"use client";

import React, { forwardRef, useId } from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      rightElement,
      className = "",
      id: customId,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = customId || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className="w-full space-y-1.5 text-left">
        <label
          htmlFor={inputId}
          className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200"
        >
          {label}
        </label>

        <div className="relative flex items-center">
          {icon && (
            <div
              className="pointer-events-none absolute left-3.5 text-zinc-400 dark:text-zinc-500"
              aria-hidden="true"
            >
              {icon}
            </div>
          )}

          <input
            id={inputId}
            ref={ref}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm sm:text-base text-zinc-900 transition-all duration-150 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 ${
              icon ? "pl-10" : ""
            } ${rightElement ? "pr-10" : ""} ${
              error
                ? "border-rose-500 focus-visible:border-rose-500 focus-visible:ring-rose-500/20"
                : "border-zinc-300 hover:border-zinc-400 focus-visible:border-blue-600 focus-visible:ring-blue-600/20 dark:border-zinc-700 dark:hover:border-zinc-600 dark:focus-visible:border-blue-500"
            } ${className}`}
            {...props}
          />

          {rightElement && (
            <div className="absolute right-3 flex items-center">{rightElement}</div>
          )}
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 animate-fadeIn"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-zinc-500 dark:text-zinc-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
