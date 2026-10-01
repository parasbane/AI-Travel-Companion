import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import SignUpForm from "@/components/auth/SignUpForm";

export const metadata: Metadata = {
  title: "Create Account — AI Travel Companion",
  description: "Sign up for AI Travel Companion to get personalized travel recommendations and itineraries.",
};

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <AuthCard
        title="Start Your Journey"
        subtitle="Create an account to personalize your travel discovery"
        footer={
          <p>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        }
      >
        <Suspense fallback={<div className="h-64 flex items-center justify-center text-sm text-zinc-400">Loading form...</div>}>
          <SignUpForm />
        </Suspense>
      </AuthCard>
    </div>
  );
}
