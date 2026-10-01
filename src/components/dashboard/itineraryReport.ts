import type {
  ItineraryItem,
  TripPlanIssue,
  TripPlanIssueSeverity,
} from "@/lib/saved/types";

export const SEVERITY_ORDER: readonly TripPlanIssueSeverity[] = [
  "error",
  "warning",
  "info",
];

export interface SeverityMeta {
  label: string;
  description: string;
}

export const SEVERITY_META: Record<TripPlanIssueSeverity, SeverityMeta> = {
  error: { label: "Error", description: "Needs your attention" },
  warning: { label: "Warning", description: "Worth reviewing" },
  info: { label: "Info", description: "Suggestions and notes" },
};

export interface IssueSeverityCounts {
  errors: number;
  warnings: number;
  info: number;
  total: number;
}

export function countIssuesBySeverity(
  issues: readonly TripPlanIssue[]
): IssueSeverityCounts {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  for (const issue of issues) {
    if (issue.severity === "error") {
      errors += 1;
    } else if (issue.severity === "warning") {
      warnings += 1;
    } else {
      info += 1;
    }
  }
  return { errors, warnings, info, total: issues.length };
}

export interface SeverityGroup {
  severity: TripPlanIssueSeverity;
  issues: TripPlanIssue[];
}

export function groupIssuesBySeverity(
  issues: readonly TripPlanIssue[]
): SeverityGroup[] {
  const groups: SeverityGroup[] = [];
  for (const severity of SEVERITY_ORDER) {
    const matching = issues.filter((issue) => issue.severity === severity);
    if (matching.length > 0) {
      groups.push({ severity, issues: matching });
    }
  }
  return groups;
}

export function formatIssueDay(issue: TripPlanIssue): string | null {
  if (issue.dayNumber === undefined) return null;
  return `Day ${issue.dayNumber}`;
}

export function resolveIssuePlaceName(
  issue: TripPlanIssue,
  placeNameById: ReadonlyMap<string, string>,
  itemById: ReadonlyMap<string, ItineraryItem>
): string | null {
  if (issue.placeId) {
    const name = placeNameById.get(issue.placeId);
    if (name) return name;
  }
  if (issue.itemId) {
    const item = itemById.get(issue.itemId);
    if (item) return item.placeName;
  }
  return null;
}