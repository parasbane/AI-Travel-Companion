"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import type {
  AssistantChatApiResponse,
  AssistantResponseEnvelope,
  AssistantTurn,
} from "@/lib/ai/types";
import {
  buildAssistantChatRequestPayload,
  buildAssistantDecisionView,
  type AssistantPreferenceContext,
} from "./chatUtils";

interface TravelAssistantChatProps {
  destinationSlug: string;
  destinationName?: string;
  preferenceContext?: AssistantPreferenceContext;
  selectedPlaceIds?: string[];
  tripId?: string;
  className?: string;
  onFocusPlace?: (placeId: string) => void;
  /** Called after a chat-approved itinerary plan is applied so trip data can reload. */
  onTripUpdated?: () => void;
}

const MAX_LOCAL_TURNS = 12;

const SUGGESTED_PROMPTS = [
  "Which place should we visit tomorrow morning?",
  "What suits a family with a moderate budget?",
  "Compare the best culture and relaxation spots.",
  "Show me a shortlist for this destination.",
];

function createLocalTurn(role: AssistantTurn["role"], content: string): AssistantTurn {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function pickConversationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `conversation_${Date.now()}`;
}

function AssistantBubble({
  message,
  onFocusPlace,
}: {
  message: AssistantTurn;
  onFocusPlace?: (placeId: string) => void;
}) {
  const isAssistant = message.role === "assistant";
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      aria-label={isUser ? "Your message" : "Assistant message"}
    >
      <div
        className={`max-w-[92%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[85%] ${
          isUser
            ? "bg-blue-600 text-white"
            : "border border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed sm:text-[0.95rem]">
          {message.content}
        </p>

        {isAssistant && message.metadata?.grounded && (
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
            Grounded on destination data
          </p>
        )}

        {isAssistant && message.referencedPlaceIds && message.referencedPlaceIds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.referencedPlaceIds.map((placeId) => (
              <button
                key={placeId}
                type="button"
                onClick={() => onFocusPlace?.(placeId)}
                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70"
              >
                View {placeId}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatContextChips({
  destinationName,
  preferenceContext,
  selectedPlaceCount,
}: {
  destinationName?: string;
  preferenceContext?: AssistantPreferenceContext;
  selectedPlaceCount: number;
}) {
  const labels = useMemo(() => {
    const chips: string[] = [];
    const prefs = preferenceContext?.resolvedPreferences;
    if (prefs?.styles?.length) {
      chips.push(...prefs.styles.slice(0, 2).map((style) => style.charAt(0).toUpperCase() + style.slice(1)));
    }
    if (prefs?.budget) {
      chips.push(`Budget: ${prefs.budget}`);
    }
    if (prefs?.group) {
      chips.push(`Group: ${prefs.group}`);
    }
    return chips;
  }, [preferenceContext?.resolvedPreferences]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
      {destinationName && (
        <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
          {destinationName}
        </span>
      )}
      {selectedPlaceCount > 0 && (
        <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
          {selectedPlaceCount} selected place{selectedPlaceCount === 1 ? "" : "s"}
        </span>
      )}
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export default function TravelAssistantChat({
  destinationSlug,
  destinationName,
  preferenceContext,
  selectedPlaceIds = [],
  tripId,
  className = "",
  onFocusPlace,
  onTripUpdated,
}: TravelAssistantChatProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [conversationId] = useState(() => pickConversationId());
  const [messages, setMessages] = useState<AssistantTurn[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplyingPlan, setIsApplyingPlan] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applyPlanStatus, setApplyPlanStatus] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<AssistantResponseEnvelope | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading, lastResponse]);

  const recentTurns = useMemo(() => messages.slice(-MAX_LOCAL_TURNS), [messages]);

  // Render-ready view of the deterministic decision, or null for every other
  // intent so existing bubble behaviour is untouched.
  const decisionView = useMemo(
    () => buildAssistantDecisionView(lastResponse),
    [lastResponse]
  );

  const isEmpty = messages.length === 0;

  const handleSubmit = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userTurn = createLocalTurn("user", trimmed);
    const nextMessages = [...messages, userTurn].slice(-MAX_LOCAL_TURNS);
    setMessages(nextMessages);
    setInputValue("");
    setErrorMessage(null);
    setApplyPlanStatus(null);
    setIsLoading(true);

    const requestPayload = buildAssistantChatRequestPayload({
      destinationSlug,
      userId: user?.id,
      tripId,
      message: trimmed,
      recentTurns,
      selectedPlaceIds: selectedPlaceIds.length > 0 ? selectedPlaceIds : undefined,
      preferenceContext,
      conversationId,
      locale: typeof navigator !== "undefined" ? navigator.language : undefined,
      timezone:
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined,
      currentPath: pathname,
    });

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      const data = (await response.json()) as AssistantChatApiResponse;

      if (!response.ok || !data.ok) {
        setErrorMessage(
          !data.ok ? data.error.message : "We could not process that request right now."
        );
        return;
      }

      setLastResponse(data.data);
      setMessages((current) => [...current, data.data.assistantTurn].slice(-MAX_LOCAL_TURNS));

      if (data.data.primaryPlaceId && onFocusPlace) {
        onFocusPlace(data.data.primaryPlaceId);
      }
    } catch {
      setErrorMessage("We could not reach the travel assistant. Please try again.");
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleApplyPlan = async () => {
    const proposal = lastResponse?.itineraryProposal;
    if (!user || !tripId || !proposal || isApplyingPlan) return;

    setIsApplyingPlan(true);
    setApplyPlanStatus(null);
    try {
      const response = await fetch("/api/ai/itinerary/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, tripId, proposal }),
      });
      const payload = await response.json();

      if (response.ok && payload.ok) {
        const application = payload.data.application;
        const parts: string[] = [];
        parts.push(
          `Applied ${application.addedStopCount} new stop${application.addedStopCount === 1 ? "" : "s"} across ${application.daysApplied} day${application.daysApplied === 1 ? "" : "s"}`
        );
        if (application.skippedCount > 0) {
          parts.push(
            `${application.skippedCount} already scheduled and left in place`
          );
        }
        if (application.rejectedPlaceIds.length > 0) {
          parts.push(
            `${application.rejectedPlaceIds.length} invalid place id${application.rejectedPlaceIds.length === 1 ? "" : "s"} rejected`
          );
        }
        if (application.keptUnassignedCount > 0) {
          parts.push(
            `${application.keptUnassignedCount} left unassigned for you`
          );
        }
        setApplyPlanStatus(`${parts.join(". ")}. The itinerary below was updated.`);
        onTripUpdated?.();
      } else {
        setApplyPlanStatus(
          payload.error?.message ?? "Could not apply this plan. No stops were changed."
        );
      }
    } catch {
      setApplyPlanStatus("Could not reach the server to apply this plan. No stops were changed.");
    } finally {
      setIsApplyingPlan(false);
    }
  };

  return (
    <section
      className={`mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 ${className}`}
      aria-labelledby="travel-assistant-heading"
    >
      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-900">
        <div className="border-b border-zinc-200/80 px-4 py-4 sm:px-6 dark:border-zinc-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-400">
                AI Travel Assistant
              </p>
              <h2 id="travel-assistant-heading" className="mt-1 text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">
                Ask about {destinationName ?? destinationSlug}
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Grounded answers from the places already available on this destination page.
              </p>
            </div>
            <ChatContextChips
              destinationName={destinationName}
              preferenceContext={preferenceContext}
              selectedPlaceCount={selectedPlaceIds.length}
            />
          </div>
        </div>

        <div className="flex h-[520px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {isEmpty ? (
              <div className="flex h-full min-h-[280px] items-center justify-center">
                <div className="w-full max-w-2xl rounded-3xl border border-dashed border-blue-200 bg-blue-50/70 p-5 text-center dark:border-blue-900/50 dark:bg-blue-950/20 sm:p-8">
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                    Start a grounded travel question
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                    Ask for the best place for your traveller type, compare two spots, or ask which option fits tomorrow morning best.
                  </p>

                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInputValue(prompt)}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-blue-900/60 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <AssistantBubble
                    key={message.id}
                    message={message}
                    onFocusPlace={onFocusPlace}
                  />
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[92%] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600" />
                        <span>Checking grounded destination data...</span>
                      </div>
                    </div>
                  </div>
                )}

                {decisionView?.selectedPlaceName && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">
                      My pick
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                      {decisionView.selectedPlaceName}
                    </p>

                    {decisionView.reasons.length > 0 && (
                      <>
                        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                          Why
                        </p>
                        <ul className="mt-1 space-y-1">
                          {decisionView.reasons.map((reason) => (
                            <li
                              key={reason}
                              className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200"
                            >
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-blue-600" />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {decisionView.alternatives.length > 0 && (
                      <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                        Also considered:{" "}
                        {decisionView.alternatives
                          .map((place) => place.placeName)
                          .join(", ")}
                        .
                      </p>
                    )}

                    {decisionView.unavailableNote && (
                      <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {decisionView.unavailableNote}
                      </p>
                    )}

                    {decisionView.selectedPlaceId && onFocusPlace && (
                      <button
                        type="button"
                        onClick={() => onFocusPlace(decisionView.selectedPlaceId!)}
                        className="mt-3 text-xs font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
                      >
                        View details
                      </button>
                    )}
                  </div>
                )}

                {lastResponse?.itineraryProposal && tripId && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-white">
                          Suggested itinerary
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                          {lastResponse.itineraryProposal.dayCount} day
                          {lastResponse.itineraryProposal.dayCount === 1 ? "" : "s"} in{" "}
                          {lastResponse.itineraryProposal.destinationName}:{" "}
                          {lastResponse.itineraryProposal.scheduleCount} already planned,{" "}
                          {lastResponse.itineraryProposal.suggestionCount} new suggestion
                          {lastResponse.itineraryProposal.suggestionCount === 1 ? "" : "s"}.
                          {lastResponse.itineraryProposal.unassignedPlaceIds.length > 0 && (
                            <> {lastResponse.itineraryProposal.unassignedPlaceIds.length} left for you to add manually.</>
                          )}
                        </p>
                        {applyPlanStatus && (
                          <p className="mt-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            {applyPlanStatus}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        isLoading={isApplyingPlan}
                        disabled={
                          !user ||
                          isApplyingPlan ||
                          lastResponse.itineraryProposal.suggestionCount === 0
                        }
                        onClick={() => void handleApplyPlan()}
                      >
                        {lastResponse.itineraryProposal.suggestionCount === 0
                          ? "Nothing new to add"
                          : `Add ${lastResponse.itineraryProposal.suggestionCount} stop${
                              lastResponse.itineraryProposal.suggestionCount === 1 ? "" : "s"
                            } to my trip`}
                      </Button>
                    </div>
                  </div>
                )}

                {lastResponse?.needsClarification && lastResponse.clarificationQuestion && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    {lastResponse.clarificationQuestion}
                  </div>
                )}
              </div>
            )}
            {errorMessage && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                {errorMessage}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-zinc-200/80 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950 sm:px-6">
            <label htmlFor="assistant-message" className="sr-only">
              Ask the travel assistant
            </label>
            <textarea
              id="assistant-message"
              ref={textareaRef}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the best place for this traveller and destination..."
              rows={3}
              className="w-full resize-none rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500"
            />

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Press Enter to send. Shift+Enter adds a new line.
              </p>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInputValue("")}
                  disabled={isLoading || inputValue.trim().length === 0}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSubmit()}
                  isLoading={isLoading}
                  disabled={inputValue.trim().length === 0}
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
