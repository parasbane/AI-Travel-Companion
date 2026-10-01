import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full border-t border-zinc-200 bg-zinc-50 py-12 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          {/* Brand & Tagline */}
          <div className="flex flex-col items-center md:items-start gap-1.5 text-center md:text-left">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white">
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21a9 9 0 100-18 9 9 0 000 18z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 7l2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5 5-2.5 2.5-5z"
                  />
                </svg>
              </div>
              <span className="text-base font-bold text-zinc-900 dark:text-white">
                AI Travel Companion
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Personalized AI-powered travel recommendations.
            </p>
          </div>

          {/* Quick Section Anchors */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-zinc-600 dark:text-zinc-400">
            <Link
              href="#explore"
              className="hover:text-zinc-950 dark:hover:text-white transition-colors"
            >
              Explore
            </Link>
            <Link
              href="#how-it-works"
              className="hover:text-zinc-950 dark:hover:text-white transition-colors"
            >
              How It Works
            </Link>
            <Link
              href="#features"
              className="hover:text-zinc-950 dark:hover:text-white transition-colors"
            >
              Features
            </Link>
            <Link
              href="#about"
              className="hover:text-zinc-950 dark:hover:text-white transition-colors"
            >
              About
            </Link>
          </div>
        </div>

        {/* Bottom Copyright & Disclaimer */}
        <div className="mt-10 border-t border-zinc-200/80 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400 dark:border-zinc-800/80 dark:text-zinc-500">
          <p>© {new Date().getFullYear()} AI Travel Companion. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="#privacy" className="hover:underline">
              Privacy Policy
            </Link>
            <Link href="#terms" className="hover:underline">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
