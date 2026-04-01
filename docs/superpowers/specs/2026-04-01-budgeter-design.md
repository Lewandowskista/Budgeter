# Budgeter — Design Specification

## Context

A desktop budgeting application for Windows and macOS that helps users track spending, set budgets, visualize financial data, and get AI-powered insights based on their location's cost of living. The app prioritizes privacy (all data local), a calm/warm minimalist aesthetic, and actionable financial intelligence.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript |
| Bundler | Vite |
| Desktop | Electron |
| UI Components | shadcn/ui + Tailwind CSS |
| Charts | Recharts |
| Database | SQLite via `better-sqlite3` (main process) |
| AI | Google Generative AI SDK (`@google/generative-ai`) — Gemini |
| Cost-of-living data | Numbeo API (or similar public API) |
| Icons | Lucide React |
| Fonts | Lexend (headings) + Source Sans 3 (body) via Google Fonts |

### Data Flow

```
Renderer (React) → IPC (contextBridge) → Main Process → SQLite
                                                       → Gemini API
                                                       → Numbeo API
```

---

## Color Palette

### Light Mode (Warm Minimal)

| Token | Color | Use |
|-------|-------|-----|
| Background | `#FAFAF8` | App background |
| Card | `#FFFFFF` | Cards, panels |
| Primary | `#4A6741` | Primary actions, active nav |
| Secondary | `#6B8F63` | Secondary elements |
| Accent | `#B08D57` | Highlights, income indicators |
| Destructive | `#C2553A` | Overspending, warnings |
| Text | `#2D2D2A` | Primary text |
| Muted text | `#7A7A72` | Labels, secondary text |
| Border | `#E8E6E1` | Dividers, card borders |
| Surface | `#F3F1EC` | Sidebar, input backgrounds |

### Dark Mode (Warm Minimal)

| Token | Color | Use |
|-------|-------|-----|
| Background | `#1A1A18` | App background |
| Card | `#2A2A26` | Cards, panels |
| Primary | `#7BAF71` | Primary actions |
| Accent | `#D4AA6A` | Highlights |
| Text | `#EDEDEA` | Primary text |
| Muted text | `#9A9A92` | Secondary text |
| Border | `rgba(255,252,245,0.08)` | Dividers |

### Category Colors (Muted, Warm)

| Category | Color |
|----------|-------|
| Food & Dining | `#D4944A` |
| Rent/Housing | `#5B8A72` |
| Transport | `#8B7EC8` |
| Subscriptions | `#C47A8F` |
| Utilities | `#5BA3A3` |
| Entertainment | `#D47B4A` |
| Healthcare | `#6BA378` |
| Shopping | `#C26A5A` |
| Savings | `#4A6741` |
| Other | `#8A8A82` |

---

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| H1 | Lexend | 700 | 32px |
| H2 | Lexend | 600 | 24px |
| H3 | Lexend | 500 | 18px |
| Body | Source Sans 3 | 400 | 16px |
| Label | Source Sans 3 | 500 | 14px |
| Small | Source Sans 3 | 400 | 12px |
| Numbers (financial) | Source Sans 3 | 500 | Tabular figures |

Line height: 1.5 for body, 1.3 for headings.

---

## Navigation

Collapsible sidebar (desktop standard):

1. **Dashboard** — overview (home icon)
2. **Transactions** — add/view/edit (list icon)
3. **Budgets** — set and track limits (pie-chart icon)
4. **Analytics** — deep spending analysis (bar-chart icon)
5. **AI Insights** — AI-powered advice (sparkle icon)
6. **Settings** — config (gear icon, bottom of sidebar)

Sidebar collapses to icon-only mode. Active page highlighted with primary color + left border indicator.

---

## Pages

### 1. Dashboard

- **Period toggle:** Month / Week / Year (top bar)
- **Summary cards (4):** Total Income, Total Spent, Remaining Budget, Savings Rate
- **Donut chart:** Spending by category (current period)
- **Line chart:** Spending trend (last 6 periods)
- **Recent transactions:** Last 5-10, with quick-add button

### 2. Transactions

- **Table:** Searchable, sortable, filterable list of all transactions
- **Filters:** Date range picker, category dropdown, amount range
- **Add form:** Amount, type (income/expense), category, date, optional note
- **Actions:** Inline edit, bulk delete with confirmation
- **Empty state:** Helpful message + "Add your first transaction" CTA

### 3. Budgets

- **Budget cards per category:** Progress bar (spent/limit), percentage, remaining amount
- **Set/edit budget:** Modal or inline form per category per month
- **Overall health gauge:** Total spent vs total budget
- **Visual alerts:** Yellow when >80% spent, red when exceeded
- **Empty state:** Guide to set first budget

### 4. Analytics

- **Spending by category:** Donut chart + horizontal bar breakdown
- **Spending over time:** Line chart with period toggle (monthly/weekly/yearly)
- **Category trends:** Stacked area chart showing category proportions over time
- **Top expenses:** Ranked list with bar visualization
- **Month-over-month comparison:** Grouped bar chart
- All charts have tooltips, legends, and accessible color patterns

### 5. AI Insights

- **Location display:** City + Country (editable, links to settings)
- **Cost comparison panel:** User spending vs local average per category — bullet charts with percentage labels
- **Financial health score:** 1-100 gauge with explanation text
- **Savings tips:** 3-5 actionable suggestions, card-based layout
- **Positive patterns:** Things the user is doing well
- **Refresh button:** Re-analyze with latest data
- **Optional chat:** "Ask about your finances" text input for follow-up questions
- **Loading state:** Skeleton UI while Gemini processes
- **Error state:** Clear message if API key missing or request fails

### 6. Settings

- Currency selector (single currency, stored locally)
- Location: City + Country text inputs
- Gemini API key: password-style input with show/hide toggle
- Theme: Light / Dark / System toggle
- Data export: CSV download button
- Data reset: "Clear all data" with confirmation dialog
- About: App version

---

## Data Model (SQLite)

### transactions

| Column | Type | Constraints |
|--------|------|------------|
| id | TEXT | PRIMARY KEY (UUID) |
| amount | REAL | NOT NULL, > 0 |
| type | TEXT | NOT NULL, CHECK("income" or "expense") |
| category | TEXT | NOT NULL |
| date | TEXT | NOT NULL (ISO 8601) |
| note | TEXT | nullable |
| created_at | TEXT | DEFAULT current_timestamp |

### budgets

| Column | Type | Constraints |
|--------|------|------------|
| id | TEXT | PRIMARY KEY (UUID) |
| category | TEXT | NOT NULL |
| amount | REAL | NOT NULL, > 0 |
| month | TEXT | NOT NULL ("YYYY-MM") |
| | | UNIQUE(category, month) |

### settings

| Column | Type | Constraints |
|--------|------|------------|
| key | TEXT | PRIMARY KEY |
| value | TEXT | NOT NULL |

Default settings: currency = "USD", theme = "system".

---

## AI Feature Design

### Flow

1. User sets city + country in Settings
2. App fetches cost-of-living data from Numbeo API for that location
3. App aggregates user spending by category for the selected period
4. Structured prompt + both datasets sent to Gemini API
5. Gemini returns JSON: comparisons, health score, tips, positives

### Gemini Prompt

```
You are a personal finance advisor. Given:
- User location: {city}, {country}
- Average cost of living data: {numbeo_data}
- User's monthly spending by category: {spending_by_category}
- User's monthly income: {total_income}

Provide:
1. Comparison of each spending category vs local average (% above/below)
2. A financial health score (1-100) with brief explanation
3. 3-5 specific, actionable savings tips for categories where user overspends
4. Positive spending patterns worth maintaining

Respond in JSON:
{
  "comparisons": [{ "category": "...", "userAmount": 0, "averageAmount": 0, "percentDiff": 0 }],
  "healthScore": 0,
  "explanation": "...",
  "tips": ["..."],
  "positives": ["..."]
}
```

### Caching

- Cache AI responses for 24 hours per analysis period (keyed by month + location)
- Re-fetch only on explicit user action ("Refresh" button)

### API Key

- Stored in SQLite settings table
- Never transmitted except to Gemini endpoint
- User provides their own key from Google AI Studio

---

## UX Guidelines Applied

- Touch targets (buttons, nav items): min 44x44px
- All interactive elements: `cursor-pointer`, hover transitions 150-300ms
- Charts: tooltips on hover, visible legends, accessible category colors (not color-only — labels always present)
- Forms: visible labels (never placeholder-only), error messages below fields, inline validation on blur
- Empty states: helpful message + primary action CTA
- Loading: skeleton screens for async content
- Destructive actions: confirmation dialogs
- Focus states: visible for keyboard navigation
- `prefers-reduced-motion`: respected (disable chart animations)
- Dark/light mode: both themes tested for 4.5:1 text contrast

---

## Verification Plan

1. `npm run dev` — Vite dev server starts, Electron window opens
2. Navigate all 6 pages via sidebar
3. Add transactions manually, verify they appear in table and charts
4. Set budgets, verify progress bars update
5. Configure location + API key in settings
6. Trigger AI analysis, verify comparison data and tips render
7. Toggle dark/light mode, verify all pages
8. Test keyboard navigation through all interactive elements
9. Export CSV, verify file contents match transactions
