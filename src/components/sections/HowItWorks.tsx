export interface Step {
  number: string;
  title: string;
  description: string;
  badge: string;
}

const STEPS: Step[] = [
  {
    number: "01",
    title: "Choose your destination",
    description:
      "Enter any city, region, or dream spot worldwide that you want to experience next.",
    badge: "Destination",
  },
  {
    number: "02",
    title: "Tell us your travel style",
    description:
      "Select the vibes you love — from culture and local cuisine to thrilling trails or peaceful escapes.",
    badge: "Preferences",
  },
  {
    number: "03",
    title: "Get recommendations made for you",
    description:
      "Receive personalized recommendations and curated places designed specifically around your tastes.",
    badge: "Personalized",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="w-full border-t border-zinc-200/80 bg-zinc-50/50 py-20 sm:py-28 dark:border-zinc-800/80 dark:bg-zinc-950/40"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-3.5 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-300">
            Simple 3-Step Process
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            How It Works
          </h2>
          <p className="mt-3 text-base sm:text-lg text-zinc-600 dark:text-zinc-400">
            From initial idea to customized recommendations in moments.
          </p>
        </div>

        {/* Step Cards Grid */}
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          {STEPS.map((step, idx) => (
            <div
              key={step.number}
              className="relative flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-8 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              {/* Connector line for desktop */}
              {idx < STEPS.length - 1 && (
                <div
                  className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 text-zinc-300 dark:text-zinc-700 z-10"
                  aria-hidden="true"
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </div>
              )}

              <div>
                {/* Step Number & Badge */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-3xl font-extrabold tracking-tight text-blue-600 dark:text-blue-400">
                    {step.number}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {step.badge}
                  </span>
                </div>

                {/* Step Title */}
                <h3 className="mt-6 text-xl font-semibold text-zinc-900 dark:text-white">
                  {step.title}
                </h3>

                {/* Step Description */}
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {step.description}
                </p>
              </div>

              <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                <span>Step {idx + 1} of 3</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
