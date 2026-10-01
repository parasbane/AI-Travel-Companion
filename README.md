# AI Travel Companion

**AI Travel Companion** is a personalized AI travel planning application — not a generic chatbot or itinerary generator. It answers a specific question for every interaction:

> *"What is best for **this** traveller, in **this** destination, at **this** time?"*

The system combines deterministic preference-based ranking, real-time weather intelligence, grounded AI responses, and full trip/itinerary management to give each user advice that is genuinely tailored to them — and that can be verified against real data rather than invented on the fly.

---

## ✅ Implemented Features

### Destination Discovery
- Curated destination data for **Goa, Tokyo, Paris, and Bali** with rich place details
- Dynamic destination routes (`/destinations/[slug]`)
- Place cards with category badges, ratings, price levels, and images
- Place details modal with address, opening hours, and tags
- Generic fallback for any unrecognised destination slug

### Personalized Recommendations
- **Deterministic match-score ranking** — pure functions, fully tested, no LLM involvement
- Travel style, budget tier (budget / balanced / luxury), and group type (solo / couple / family / friends) preferences
- Profile-level preferences (persisted per user) and session-level overrides (via URL query params)
- Personalize panel to tune recommendations without leaving the destination page
- Category, keyword, price-level, and sort filters (recommended / rating / reviews / name)
- Preferences applied consistently across place cards, map markers, and the AI assistant

### Interactive Destination Map
- **Leaflet / OpenStreetMap** via `react-leaflet`
- Place markers with popup previews
- Map ↔ card two-way selection: click a card to focus the map; click a marker to highlight the card
- Map and card list always share the same filtered place set

### Real-Time Weather
- Live weather fetched from the **Open-Meteo API** (free, no key required)
- Current conditions and 5-day forecast displayed on each destination page
- Weather-aware place recommendations: places are classified as *ideal*, *neutral*, or *avoid* based on forecast conditions and place category
- Weather context injected into the AI itinerary planner as grounded, metric-only forecast notes
- Full unit test coverage for normalisation, weather-code mapping, and weather-match classification

### Grounded AI Travel Assistant
- **Google Gemini** (`gemini-2.5-flash`) integration via `@google/genai`
- Structured JSON response schema enforced at the model level
- **Grounding layer**: the assistant can only reference places that actually exist in the current destination dataset — hallucinated places are rejected before reaching the UI
- Travel context builder: destination info, curated place list, user preferences, and active itinerary serialised into a bounded system prompt
- Trip-aware context: when the user has an active trip, the assistant receives the trip's scheduled days and itinerary items
- Weather-aware context: current conditions and forecast included when the question is weather-relevant
- **Real-Time Travel Decision Intelligence**: a pure deterministic layer combines match scores, travel preferences, itinerary state, and weather to rank and explain places without any LLM involvement
- Clarification questions: the model can ask for more information rather than guessing
- Chat history across the session; resets cleanly between destinations

### Saved Places
- Bookmark any place from the destination grid or the place details modal
- Saved state synchronised immediately across all visible cards
- Persistent: stored in Supabase (`saved_places` table) when configured, or user-scoped `localStorage` in local-dev mode
- Saved places displayed on the dashboard with image, name, destination, category, and rating
- Remove a saved place directly from the dashboard

### Trips & Itinerary Management
- Create trips with title, destination, optional description, start date, and end date
- Trip status lifecycle: `planning` → `upcoming` → `completed`
- Add saved places to a trip; remove them; maintain display order
- **Day-by-day itinerary**: days generated automatically from the date range; places assigned to days with optional time slots and notes
- Move items between days; reorder within a day
- **Itinerary health analysis** (`TripPlanReport`): deterministic consistency checks — inverted time ranges, overlapping slots, duplicate places across days, unassigned places, empty days
- **Trip Readiness card**: aggregates health signals and reports a readiness score
- **Smart Day Suggestions card**: proposes unscheduled places for open days
- **AI Itinerary Planner** (`POST /api/ai/itinerary`): Gemini-powered endpoint reads the current trip state and proposes itinerary changes; weather context merged per day; proposals previewed before being applied
- **Apply Itinerary Plan** (`POST /api/ai/itinerary/apply`): applies a validated AI proposal to the service layer
- Edit and delete trips; trip detail page at `/dashboard/trips/[tripId]`

### Authentication & User Profile
- Supabase Auth (email + password) with SSR session handling via `@supabase/ssr`
- **Local-dev fallback**: full sign-up / sign-in / sign-out using `localStorage` — no database required to develop
- Middleware route protection (`/dashboard/*` requires authentication)
- User profile: travel styles, budget preference, group preference persisted to Supabase `profiles` table or localStorage

---

## 🏗️ Architecture Overview

```
User Request
    │
    ▼
Next.js App Router (pages + API routes)
    │
    ├─ PlaceProvider            Pure data layer; curated datasets + generic fallback
    │   ├─ curatedData.ts       Hand-curated place data (Goa, Tokyo, Paris, Bali)
    │   ├─ scoring.ts           Deterministic matchScore (pure functions, fully tested)
    │   └─ rankingStrategy.ts   Strategy: recommended / rating / reviews / name
    │
    ├─ Weather Layer
    │   ├─ openMeteo.ts         Open-Meteo API client (no key required)
    │   ├─ normalize.ts         Raw API → typed CurrentWeather / WeatherWithForecast
    │   ├─ weatherMatches.ts    Place-category × weather-code classification
    │   └─ service.ts           Destination-level weather fetch with coordinate lookup
    │
    ├─ AI Layer
    │   ├─ travelContext.ts     Builds bounded system-prompt context
    │   ├─ weatherContext.ts    Injects grounded forecast notes into AI context
    │   ├─ tripContext.ts       Serialises active trip days + itinerary for the assistant
    │   ├─ grounding.ts         Validates model-referenced place IDs against known data
    │   ├─ travelDecision.ts    Deterministic decision intelligence (no LLM)
    │   ├─ itineraryPlanner.ts  Pure planner: proposes itinerary items given trip state
    │   ├─ applyItineraryPlan.ts Validates + applies AI proposals to service layer
    │   └─ gemini.ts            GoogleGenAI client; structured JSON schema; retry/backoff
    │
    ├─ Saved / Trips Layer
    │   ├─ savedPlacesService.ts CRUD for saved_places (Supabase or localStorage)
    │   ├─ tripsService.ts       CRUD for trips, trip_places, trip_days, itinerary_items
    │   ├─ tripPlan.ts           Composes TripPlan read-only snapshot view
    │   ├─ tripPlanReport.ts     Deterministic itinerary consistency analysis
    │   └─ tripDates.ts          Date arithmetic and display formatting
    │
    └─ Auth Layer
        ├─ AuthContext.tsx        Supabase session or localStorage fallback
        ├─ SavedPlacesContext.tsx Reactive saved-places state with optimistic updates
        └─ TripsContext.tsx       Reactive trips state
```

**Key design principle:** The AI assistant only *explains* what the deterministic layers already decided. It never fabricates place names, invents ratings, or overrides preference-based ranking. Grounding ensures every place reference in a response traces back to a known, verified record.

---

## 📁 Project Structure

```
src/
├── app/
│   ├── (auth)/                      Login / signup pages
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       ├── page.tsx             Dashboard: saved places, trips, preferences
│   │       └── trips/[tripId]/      Trip detail + itinerary management
│   ├── api/
│   │   ├── ai/
│   │   │   ├── chat/route.ts        POST — AI travel assistant
│   │   │   └── itinerary/
│   │   │       ├── route.ts         POST — AI itinerary planning
│   │   │       └── apply/route.ts   POST — Apply AI itinerary proposal
│   │   └── destinations/[slug]/
│   │       ├── places/route.ts      GET — Filtered, ranked place list
│   │       └── weather/route.ts     GET — Weather + 5-day forecast
│   ├── destinations/[slug]/         Destination discovery page
│   ├── layout.tsx                   Root layout (Navbar, Footer, Providers)
│   └── page.tsx                     Public landing page
│
├── components/
│   ├── ai/TravelAssistantChat.tsx   AI chat panel (destination-contextual)
│   ├── dashboard/
│   │   ├── TripDetails.tsx          Full trip detail view + itinerary
│   │   ├── TripItinerary.tsx        Day-by-day itinerary editor
│   │   ├── ItineraryPlannerModal.tsx AI planner UX (propose → preview → apply)
│   │   ├── TripReadinessCard.tsx    Readiness score
│   │   ├── SmartDaySuggestionsCard.tsx Unscheduled place suggestions
│   │   ├── SavedPlacesSection.tsx   Saved places list + add-to-trip
│   │   └── TripsSection.tsx         Trips list + create/edit/delete
│   └── destinations/
│       ├── PlaceGrid.tsx            Filtered, ranked place grid
│       ├── PlaceCard.tsx            Place card with save toggle
│       ├── PlaceDetailsModal.tsx    Full place detail modal
│       ├── DestinationMap.tsx       Leaflet map integration
│       ├── DestinationWeather.tsx   Current weather + forecast display
│       ├── WeatherMatchedPicks.tsx  Weather-aware place highlights
│       └── FilterToolbar.tsx        Category/budget/sort/search controls
│
├── context/
│   ├── AuthContext.tsx              Authentication state
│   ├── SavedPlacesContext.tsx       Saved places reactive state
│   └── TripsContext.tsx             Trips reactive state
│
└── lib/
    ├── ai/                          AI logic (grounding, context, planner, Gemini)
    ├── places/                      Place data, scoring, ranking
    ├── saved/                       Saved places + trips service layer + types
    ├── supabase/                    Supabase clients + migrations
    ├── weather/                     Weather API, normalisation, matching
    └── types/                       Shared TypeScript types
```

---

## 🛠️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18.18 or higher
- [npm](https://www.npmjs.com/) v9 or higher

### 1. Clone and Install

```bash
git clone https://github.com/your-username/AI-Travel-Companion.git
cd AI-Travel-Companion
npm install
```

### 2. Configure Environment Variables

Copy the example below to a `.env.local` file in the project root. **All variables are optional in local-dev mode** — the app falls back to `localStorage`-based auth and skips live database calls.

```env
# Supabase (optional in local dev)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Google Gemini AI (required for AI assistant and itinerary planner)
GEMINI_API_KEY=your-gemini-api-key
```

> **Never commit real keys.** `.env.local` is already in `.gitignore`.

### 3. Apply Database Migrations (Supabase only)

Run the SQL files in `src/lib/supabase/migrations/` via the Supabase dashboard SQL editor or CLI:

```
migrations/
├── 20260916_saved_places_and_trips.sql   # saved_places, trips, trip_places + RLS
└── 20260917_trip_itinerary.sql           # trip_days, itinerary_items + RLS
```

Row Level Security is enforced on all tables — users can only read and write their own rows.

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **No Supabase?** Sign up and log in normally. Session, saved places, and trips are stored in `localStorage` under user-scoped keys.

---

## 🧪 Quality & Testing

### Lint

```bash
npm run lint          # ESLint — exit 0 means clean
```

### Unit Tests

The `npm test` script runs the core deterministic module tests:

```bash
npm test              # scoring, preferenceParams, coordinates
```

The project has **39 test files** covering all layers. Run the full suite with `tsx`:

```bash
# AI layer
npx tsx --test src/lib/ai/*.test.ts

# Weather layer
npx tsx --test src/lib/weather/*.test.ts

# Saved places + trips service layer
npx tsx --test src/lib/saved/*.test.ts

# API routes
npx tsx --test "src/app/api/**/*.test.ts"

# React contexts
npx tsx --test src/context/*.test.ts

# Dashboard component logic
npx tsx --test "src/components/**/*.test.ts"
```

### Production Build

```bash
npm run build         # next build (Turbopack)
npm run start         # serve the production build
```

---

## 🌐 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/destinations/[slug]/places` | Filtered, ranked place list |
| `GET` | `/api/destinations/[slug]/weather` | Current weather + 5-day forecast |
| `POST` | `/api/ai/chat` | AI travel assistant (Gemini) |
| `POST` | `/api/ai/itinerary` | AI itinerary planning proposal |
| `POST` | `/api/ai/itinerary/apply` | Apply a validated AI proposal |

---

## 📊 Current Project Status

| Area | Status |
|------|--------|
| Landing page | ✅ Complete |
| Authentication (Supabase + localStorage fallback) | ✅ Complete |
| Destination discovery — 4 curated destinations | ✅ Complete |
| Personalized ranking & preference system | ✅ Complete |
| Interactive Leaflet / OpenStreetMap | ✅ Complete |
| Real-time weather (Open-Meteo) | ✅ Complete |
| Weather-aware place recommendations | ✅ Complete |
| Grounded AI travel assistant (Gemini) | ✅ Complete |
| Real-Time Travel Decision Intelligence | ✅ Complete |
| Saved places (Supabase + localStorage) | ✅ Complete |
| Trips & trip places | ✅ Complete |
| Day-by-day itinerary management | ✅ Complete |
| AI itinerary planner + apply flow | ✅ Complete |
| Itinerary health analysis (TripPlanReport) | ✅ Complete |
| Trip Readiness & Smart Day Suggestions | ✅ Complete |
| Test suite — 39 test files | ✅ Complete |
| Production build | ✅ Passing |
| ESLint | ✅ Clean |

---

## 🔮 Future Roadmap

- **More curated destinations** — expand beyond Goa, Tokyo, Paris, Bali
- **Multi-destination trips** — a single trip spanning more than one destination
- **Collaborative trips** — share a trip plan with other users
- **Budget tracking** — estimated cost per itinerary item and per-day totals
- **Real-time availability** — integrate booking / availability APIs
- **Offline support** — PWA with service-worker caching for itinerary access without connectivity
- **Native mobile app** — React Native / Expo port of the core itinerary and AI assistant
- **Map itinerary overlay** — visualise a day's planned route on the map with route optimisation

---

## 📄 License

MIT
