# Study Quest — Design System

Version 1.0 · Status: approved for implementation · Applies to the web app (mobile-first PWA)

This document is the single source of truth for how Study Quest *looks and feels*. Every screen
in the app must be assembled from the tokens and components defined here. If something is not
in this document, it does not ship — extend this document first.

---

## 1. Design principles

The five product principles (PRD §33) become five design rules:

| Principle | Design consequence |
| --- | --- |
| Learning comes first | Gamification (gold, XP, streaks) is never more visually prominent than the learning action itself. No confetti on a screen where the student is reading. |
| Simple but powerful | Progressive disclosure. One primary action per screen. Secondary AI actions live in a single "AI actions" row on notes. Never more than 3 primary CTAs on a screen. |
| Everything connects | Every screen answers "what's next?" — a persistent suggestion strip on Home and a "Next up" row after every completed activity. |
| Students stay in control | Anything auto-generated is visibly editable and clearly labelled ("Suggested by Study Quest"), never silently applied. |
| Always answer "What's next?" | After quiz/flashcard/session completion, the result screen's primary button is the next logical action (e.g. *Retry weak topics*), not "Back to home". |

Additional design rules:

- **Mobile-first.** The primary design target is a 390 × 844 phone. Desktop is an enhancement.
- **Calm, not childish.** Secondary-school and university students, not 8-year-olds. Rounded
  and warm, but restrained. No comic fonts, no mascot characters.
- **Progress is visible but not shaming.** Never show red for "behind". Use neutral greys for
  zero-progress and indigo/green for achieved.

---

## 2. Brand

### 2.1 Logo concept

An **open book** (study) beneath a **four-point quest star** (reward, progress, the "quest" in
Study Quest), set on an indigo→violet gradient tile. Indigo communicates focus and study;
gold communicates achievement and XP. The pairing is used consistently throughout the UI:
indigo for actions, gold for rewards.

### 2.2 Files

| File | Use |
| --- | --- |
| `brand/logo-mark.svg` | Primary app icon, 512 × 512, gradient + gold star |
| `brand/logo-lockup.svg` | Mark + "Study Quest" wordmark + tagline, for headers and marketing |
| `brand/logo-mono.svg` | Single-colour mark (`currentColor`), for print, stamps, watermarks, one-colour contexts |
| `brand/favicon.svg` | Simplified mark (thicker shapes, no spine detail) for ≤ 32 px |

### 2.3 Usage rules

- **Clear space:** keep at least the height of the gold star (≈ 25 % of the mark's height) free
  on all sides. Nothing enters the clear space.
- **Minimum sizes:** mark ≥ 24 px; lockup ≥ 120 px wide; favicon variant for anything smaller.
- **Allowed backgrounds:** white, neutral-50, neutral-950, or the indigo gradient itself.
  On photography, place the mark on a solid neutral surface — never directly on a busy image.
- **Do not:** rotate, stretch, skew, outline, add a drop shadow, recolour the star, replace
  the gradient with a flat fill, or re-typeset the wordmark with a different font.
- **Wordmark:** set in Inter ExtraBold, `-3` letter-spacing, with "Study" in indigo-900 and
  "Quest" in violet-600. Any change to the lockup requires updating this document.

### 2.4 App icon

PWA icons are generated from `brand/logo-mark.svg` by `scripts/generate-icons.mjs` into:

```
public/icons/icon-192.png   public/icons/icon-512.png
public/icons/maskable-512.png   (with 20 % safe-area padding, solid indigo field)
apple-touch-icon.png
favicon.ico
```

---

## 3. Colour

All values are CSS custom properties in `packages/ui/src/styles/tokens.css` and are exposed to
Tailwind v4 through `@theme`. Never hard-code a hex value in a component.

### 3.1 Brand — Indigo (actions, progress, primary surfaces)

| Token | Value | Use |
| --- | --- | --- |
| `indigo-50` | `#EEF2FF` | Tint backgrounds, hover on light cards |
| `indigo-100` | `#E0E7FF` | Selected row background |
| `indigo-200` | `#C7D2FE` | Borders on tinted surfaces |
| `indigo-300` | `#A5B4FC` | Disabled fills, dividers on dark |
| `indigo-400` | `#818CF8` | Chart series 2 |
| `indigo-500` | `#6366F1` | Gradient start |
| `indigo-600` | `#4F46E5` | **Primary action**, active progress |
| `indigo-700` | `#4338CA` | Primary hover / pressed |
| `indigo-800` | `#3730A3` | Primary text on light backgrounds |
| `indigo-900` | `#312E81` | Wordmark "Study", headings on light |
| `indigo-950` | `#1E1B4B` | Dark-mode page background |

### 3.2 Brand — Violet (gradient partner, progress highlights)

`violet-400 #A78BFA` · `violet-500 #8B5CF6` · `violet-600 #7C3AED` (gradient end) ·
`violet-700 #6D28D9`

### 3.3 Accent — Gold (XP, levels, achievements, celebration **only**)

| Token | Value | Use |
| --- | --- | --- |
| `gold-100` | `#FEF3C7` | Achievement tile background |
| `gold-200` | `#FDE68A` | Star gradient start |
| `gold-300` | `#FCD34D` | Gold star on dark |
| `gold-400` | `#FBBF24` | Star gradient end, streak flame |
| `gold-500` | `#F59E0B` | XP bar fill |
| `gold-600` | `#D97706` | XP text on light backgrounds |

**Gold rule:** gold is *never* used for a primary button, a link, or body text. If something is
gold, it is a reward. Text on gold is always `indigo-950`.

### 3.4 Semantic

| Token | 500 | 600 | Use |
| --- | --- | --- | --- |
| Success | `#10B981` | `#059669` | Correct answers, completed quests, improvements |
| Warning | `#F59E0B` | `#D97706` | Due soon, low mastery |
| Danger | `#EF4444` | `#DC2626` | Overdue, destructive actions, wrong answers |
| Info | `#3B82F6` | `#2563EB` | Neutral notices, AI-generated content badge |

### 3.5 Neutrals (slate)

`slate-50 #F8FAFC` · `slate-100 #F1F5F9` · `slate-200 #E2E8F0` · `slate-300 #CBD5E1` ·
`slate-400 #94A3B8` · `slate-500 #64748B` · `slate-600 #475569` · `slate-700 #334155` ·
`slate-800 #1E293B` · `slate-900 #0F172A` · `slate-950 #020617`

Surfaces: light page `slate-50`, card `white`, border `slate-200`, body text `slate-800`,
muted text `slate-500`. Dark page `indigo-950`, card `slate-900`, border `slate-800`,
body text `slate-100`, muted `slate-400`.

### 3.6 Subject colours (assignable palette, AA on white)

Eight fixed, pre-approved subject colours so charts stay readable and consistent:

`#4F46E5` indigo · `#0EA5E9` sky · `#14B8A6` teal · `#F59E0B` amber · `#EF4444` red ·
`#EC4899` pink · `#8B5CF6` violet · `#65A30D` lime

The subject colour is used for the subject's avatar tile, its progress ring, and its chart
series. Progress **state** (done / in progress / not started) is always shown by fill, icon and
label as well as colour.

### 3.7 Contrast and accessibility

- Body text ≥ 4.5:1 against its background; large text and UI borders ≥ 3:1 (WCAG AA).
- No information is conveyed by colour alone. Every progress ring, status dot and mastery badge
  has a text label or icon.
- Dark mode is a first-class theme, not an afterthought: it is a Phase 1 deliverable.

---

## 4. Typography

**Family:** Inter (self-hosted variable font, subset `latin`, ~45 KB woff2) with fallback
`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. No web-font CDN — the app must work
offline. Tabular numerals enabled for all stat displays.

| Style token | Size / line-height | Weight | Use |
| --- | --- | --- | --- |
| `display` | 32 / 40 | 800 | Home greeting, level number |
| `h1` | 28 / 34 | 700 | Screen titles |
| `h2` | 24 / 30 | 700 | Section headings |
| `h3` | 20 / 28 | 600 | Card titles, subject names |
| `body-lg` | 18 / 28 | 400 | Note body on mobile |
| `body` | 16 / 26 | 400 | Default UI text |
| `body-sm` | 14 / 22 | 400 | Secondary text, helper text |
| `caption` | 12 / 16 | 600 | Badges, meta, timestamps (uppercase only for badges) |
| `stat` | 24 / 28 | 700, tabular | XP, scores, timers |

- **Measure:** 60–75 characters for note and summary text; UI text is not width-constrained.
- **Note editor:** `body-lg`, 1.7 line-height, max-width 70ch, comfortable tap targets in lists.
- **Science notation:** support `x²`, `H₂O`, `CO₂` styling via a small `sub`/`sup` helper in the
  note renderer (math is a core use case — see Phase 5).
- Uppercase is reserved for `caption` badges. Never uppercase body text.

---

## 5. Spacing, radius, elevation

**Spacing** — 4 pt base: `0, 1(4), 2(8), 3(12), 4(16), 5(20), 6(24), 8(32), 10(40), 12(48), 16(64)`

- Screen padding: 16 (mobile) / 24 (≥ 768).
- Card padding: 16–20. Card gap: 12–16. Section gap: 32.
- Minimum touch target: 44 × 44.

**Radius** — `sm 8` (chips, inputs) · `md 12` (buttons, cards) · `lg 16` (large cards, sheets)
· `xl 24` (modals, hero tiles) · `2xl 32` (celebration cards) · `full` (avatars, pills)

**Elevation**

| Token | Use |
| --- | --- |
| `e0` | Flat — cards on `slate-50` use a border, no shadow |
| `e1` | Resting cards: `0 1px 2px rgb(15 23 42 / 0.06), 0 1px 3px rgb(15 23 42 / 0.10)` |
| `e2` | Raised: sticky headers, floating action button |
| `e3` | Popovers, dropdowns, active drag |
| `e4` | Modals and sheets only |

**Focus ring** — `0 0 0 2px <surface>, 0 0 0 4px indigo-500`. Always visible on keyboard focus,
never removed without a replacement.

---

## 6. Iconography

- **Set:** Lucide (MIT, tree-shakeable), 24 × 24 grid, `stroke-width 1.75`, rounded caps.
- Sizes: 16 (inline, badges), 20 (default UI), 24 (navigation, empty states), 32 (feature icons).
- Icons never carry meaning alone next to a label; the label is the source of truth.
- Product-specific icons are custom SVGs in `packages/ui/src/icons/`, following the same
  24 × 24 grid and 1.75 stroke: `quest-flag`, `star-quest`, `streak-flame`, `xp-bolt`,
  `level-shield`, `topic-node`.

---

## 7. Motion

| Token | Duration | Easing | Use |
| --- | --- | --- | --- |
| `instant` | 100 ms | `cubic-bezier(0.2, 0, 0, 1)` | Press feedback, toggles |
| `fast` | 150 ms | same | Hover, small reveals |
| `base` | 200 ms | same | Sheets, dropdowns, card lift |
| `slow` | 300 ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Page transitions, progress fills |
| `deliberate` | 500 ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | XP bar fill, level-up, quest complete |

- **Reduced motion:** `prefers-reduced-motion: reduce` collapses all durations to 0 ms except
  opacity fades (100 ms), and replaces the level-up animation with a static badge.
- Celebration animation (confetti) is capped at 600 ms, fires once, and is skipped entirely in
  reduced-motion mode.
- The quiz runner and focus timer animate progress only — never the question text — to avoid
  visual noise during study.

---

## 8. Layout and navigation

**Breakpoints** — `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536` (mobile-first, min-width)

**Navigation**

- **Mobile (< 1024):** bottom tab bar with the five PRD sections — Home, Tasks, Study, Quests,
  Progress. A centre FAB on Home is replaced by quick actions in a sheet; the tab bar never
  grows a sixth item.
- **Desktop (≥ 1024):** left rail (72 px collapsed, 240 px expanded) with the same five items,
  plus a secondary top bar for search and settings.
- Header: title + contextual primary action only. No more.

**Page templates**

1. **Dashboard** — progress strip, Today's Quest, Continue Learning, Upcoming, Quick Actions.
2. **List** — filter chips + sortable list (Tasks, Quests, Topics, Flashcard decks).
3. **Detail** — hero header + tabs (Notes / Quizzes / Flashcards / Tasks) + activity.
4. **Theatre** — distraction-free full-bleed mode for Quiz, Flashcards, Read My Notes and Focus
   sessions. No navigation chrome; a single escape affordance.
5. **Settings** — grouped list of setting panels.

**Grid** — 4 columns mobile, 8 at ≥ 768, 12 at ≥ 1280, 20 px gutter, 1440 px max content width
(readable columns capped at 720 px for text).

---

## 9. Component inventory

Every component below ships with Storybook stories covering default, hover, active, focus,
disabled, loading, error and empty states.

**Actions** — Button (primary / secondary / ghost / danger / gold-reward, sm / md / lg, loading
spinner), IconButton, FAB, SegmentedControl, Chip (filter, removable, subject colour), Link.

**Inputs** — TextInput, Textarea, RichNoteEditor, Select, Combobox (subject/topic picker),
DatePicker, TimePicker, Slider (difficulty), Toggle, Checkbox, Radio, SegmentedChoice
(summary length/format, quiz options), SearchInput, FileInput (Phase 22).

**Data display** — Card, StatTile, ProgressBar, ProgressRing (0–100 %, ARIA value), XpBar
(gold), LevelBadge, StreakFlame, Badge/AchievementTile, SubjectCard, TopicRow, SubjectAvatar,
EmptyState, Skeleton, Table (progress history), ListRow.

**Domain components** — NoteCard, NoteActionBar, SummaryPanel, ExplanationCard, QuizRunner,
QuizOption, QuizResultDonut, WeakTopicList, Flashcard, FlashcardDeckCard, DeckStudyProgress,
FocusTimer, SessionStepList, TaskRow, TaskComposer, RecurrenceEditor, PlanDayView, QuestCard,
QuestStepper, DailyQuestList, LevelUpToast, StreakCalendar.

**Overlays** — Modal, BottomSheet, Drawer, Popover, Tooltip, Toast (with `aria-live="polite"`),
ConfirmDialog, CommandPalette (⌘K, global search).

---

## 10. Theming

- Tokens are CSS custom properties on `:root`, overridden under `.dark`.
- Default follows the OS (`prefers-color-scheme`); the user's explicit choice in Settings wins
  and is stored in `localStorage` + the `settings` table.
- Theme switch is a three-state control: System / Light / Dark.
- Charts must be readable in both themes; series colours are theme-aware tokens, not literals.

---

## 11. Voice and microcopy

- **Tone:** encouraging, direct, second person. "Let's review Motion" — not "You failed to
  review Motion".
- **No guilt, ever.** Overdue states say "Due Friday" and offer a reschedule, never shame.
- **Labels AI output.** Anything the model generated carries a subtle "AI" badge with a
  tooltip stating it came from the student's own notes.
- **Errors say what to do next:** "We couldn't reach the AI service. Your notes are safe —
  try again or continue offline."
- **Numbers are friendly:** scores as "7 of 10" alongside "70 %"; XP as "+50 XP" with a
  one-line reason.

---

## 12. Accessibility requirements (definition of done for every screen)

- Keyboard reachable and operable; visible focus ring everywhere; logical tab order.
- Touch targets ≥ 44 × 44 px; primary actions reachable in the bottom third on mobile.
- Progress components expose `role="progressbar"` with `aria-valuenow`, or a visually hidden
  text equivalent ("Physics 68 %").
- Quiz runner announces the question and each result via a live region; supports
  `1`–`4` to select options and `Enter` to submit.
- Colour is never the only signal (§3.7).
- `prefers-reduced-motion` honoured (§7).
- Text meets AA contrast in both themes.
- Full dark-mode rendering is part of the DoD, not a follow-up.

---

## 13. Delivery

| Concern | Mechanism |
| --- | --- |
| Tokens | `packages/ui/src/styles/tokens.css` → Tailwind v4 `@theme` |
| Components | `packages/ui` (React, no app dependencies), consumed via workspace import |
| Catalogue | Storybook, run with `pnpm storybook`, deployed to a private local port |
| Icons | `lucide-react` + custom SVGs, tree-shaken |
| Fonts | Self-hosted Inter variable, preloaded, `font-display: swap` |
| App icon | Generated from `brand/logo-mark.svg` by a build script |
| Review | Every new component needs a Storybook story and an a11y check before merge |
