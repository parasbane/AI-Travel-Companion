# AI Travel Companion

**AI Travel Companion** is a portfolio-grade web application designed to provide personalized, AI-powered travel recommendations, curated itineraries, and destination discovery tailored to each traveler's individual style, pace, and interests.

---

## 🚀 Current Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Library**: [React 19](https://react.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Code Quality**: [ESLint](https://eslint.org/)

---

## 📁 Project Structure

```text
AI-Travel_Companion/
├── src/
│   ├── app/
│   │   ├── favicon.ico       # Favicon
│   │   ├── globals.css       # Global styles and Tailwind configuration
│   │   ├── layout.tsx        # Root layout with Navbar and Footer
│   │   └── page.tsx          # Landing page with Hero, SearchBar, and Features
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx    # Responsive navigation bar with auth placeholders
│   │   │   └── Footer.tsx    # Responsive footer with branding and links
│   │   └── ui/
│   │       └── SearchBar.tsx # Destination search input with primary Explore action
│   └── lib/
│       └── utils.ts          # Utility functions and class name helpers
├── public/                   # Static assets
├── eslint.config.mjs         # ESLint configuration
├── next.config.ts            # Next.js configuration
├── package.json              # Project dependencies and scripts
├── postcss.config.mjs        # PostCSS configuration for Tailwind CSS
├── tsconfig.json             # TypeScript configuration
└── README.md                 # Project documentation
```

---

## 🛠️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.18 or higher recommended)
- [npm](https://www.npmjs.com/) (v9 or higher)

### 1. Install Dependencies

Clone or open the project folder in your terminal and install packages:

```bash
npm install
```

### 2. Run the Development Server

Start the local development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

### 3. Production Build & Linting

To run ESLint:

```bash
npm run lint
```

To create an optimized production build:

```bash
npm run build
```

To start the production server:

```bash
npm run start
```
