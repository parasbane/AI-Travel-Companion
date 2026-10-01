import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log In — AI Travel Companion",
  description: "Sign in to access your personalized travel recommendations, trips, and saved places.",
};

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <AuthCard
        title="Welcome Back"
        subtitle="Sign in to your AI Travel Companion account"
        footer={
          <p>
            Don&apos;t have an account yet?{" "}
            <Link
              href="/signup"
              className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline-offset-4 hover:underline"
            >
              Sign up
            </Link>
          </p>
        }
      >
        <Suspense fallback={<div className="h-64 flex items-center justify-center text-sm text-zinc-400">Loading form...</div>}>
          <LoginForm />
        </Suspense>
      </AuthCard>
    </div>
  );
}
