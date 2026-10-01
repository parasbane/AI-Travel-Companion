import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — AI Travel Companion",
  description: "Manage your personalized travel recommendations, profile preferences, trips, and saved places.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full flex-1 bg-zinc-50/50 dark:bg-zinc-950/50">
      {children}
    </div>
  );
}
