import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Card,
  CheckItem,
  Chip,
  LevelBadge,
  Logo,
  Monogram,
  QuestStepper,
  Ring,
  Streak,
  Track,
} from "./index";

/**
 * Every component ships with its states (section 9). Colour is never the only signal,
 * so each progress component carries a text label.
 */
const meta = {
  title: "Design system",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LogoMark: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
      <Logo size={64} title="Study Quest" />
      <Logo size={32} />
      <Logo size={20} />
    </div>
  ),
};

export const Progress: Story = {
  name: "Progress / Ring",
  render: () => (
    <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
      <Ring value={0} label="Physics progress, 0 percent" />
      <Ring value={68} label="Physics progress, 68 percent" />
      <Ring value={100} label="Physics progress, 100 percent" />
      <Ring value={50} small label="Today's quest, 2 of 4" />
    </div>
  ),
};

export const Tracks: Story = {
  name: "Progress / Track",
  render: () => (
    <div style={{ display: "grid", gap: 20, maxWidth: 420 }}>
      <Track label="Physics" value={68} caption="68%" />
      <Track label="XP to level 8" variant="xp" value={760} max={1000} caption="760 / 1,000" />
      <Track label="Nothing started" value={0} caption="0%" />
    </div>
  ),
};

export const Gamification: Story = {
  name: "Level and streak",
  render: () => (
    <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
      <LevelBadge level={7} />
      <Streak days={7} />
      <Chip tone="gold">LEVEL 7</Chip>
    </div>
  ),
};

export const Chips: Story = {
  name: "Chips",
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Chip>All</Chip>
      <Chip tone="accent">Today</Chip>
      <Chip tone="iris">Physics</Chip>
      <Chip tone="gold">LEVEL 7</Chip>
      <Chip tone="ok">Correct</Chip>
      <Chip tone="warn">Due soon</Chip>
      <Chip tone="bad">Overdue</Chip>
    </div>
  ),
};

export const Monograms: Story = {
  name: "Monogram tiles",
  render: () => (
    <div style={{ display: "flex", gap: 12 }}>
      <Monogram text="Ph" active />
      <Monogram text="Bi" />
      <Monogram text="Ma" />
      <Monogram text="Ch" large />
      <Monogram text="En" large active />
    </div>
  ),
};

export const Checklist: Story = {
  name: "Check items",
  render: function Checklist() {
    return (
      <Card title="Today's Quest" action={<span className="sq-num">2/4</span>}>
        <CheckItem done>Review Atomic Structure</CheckItem>
        <CheckItem done>Complete quiz</CheckItem>
        <CheckItem done={false}>Complete assignment</CheckItem>
        <CheckItem done={false}>Review Motion</CheckItem>
      </Card>
    );
  },
};

export const QuestStepperStory: Story = {
  name: "Quest stepper",
  render: () => (
    <QuestStepper
      steps={[
        { id: "1", title: "Read notes", state: "done" },
        { id: "2", title: "Review summary", state: "done" },
        { id: "3", title: "Study flashcards", state: "done" },
        { id: "4", title: "Complete quiz", state: "current" },
        { id: "5", title: "Pass final challenge", state: "locked" },
      ]}
    />
  ),
};

export const Buttons: Story = {
  name: "Buttons",
  render: () => (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="sq-btn sq-btn-primary">Start studying</button>
        <button className="sq-btn sq-btn-secondary">Add notes</button>
        <button className="sq-btn sq-btn-ghost">Cancel</button>
        <button className="sq-btn sq-btn-danger">Delete</button>
        <button className="sq-btn sq-btn-reward">+50 XP</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="sq-btn sq-btn-primary" disabled>
          Disabled
        </button>
        <button className="sq-btn sq-btn-primary sq-btn-sm">Small</button>
        <button className="sq-btn sq-btn-primary sq-btn-lg">Large</button>
        <button className="sq-btn sq-btn-primary sq-btn-block">Block</button>
      </div>
    </div>
  ),
};

export const Fields: Story = {
  name: "Inputs",
  render: () => (
    <div style={{ display: "grid", gap: 20, maxWidth: 420 }}>
      <div className="sq-field">
        <label htmlFor="s1">Title</label>
        <input className="sq-input" id="s1" placeholder="e.g. Motion notes" />
        <p className="sq-help">Shown as the note heading and in search results.</p>
      </div>
      <div className="sq-field">
        <label htmlFor="s2">Email</label>
        <input className="sq-input" id="s2" defaultValue="praise@" aria-invalid="true" />
        <p className="sq-error">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5M12 16h.01" />
          </svg>
          Enter an email address.
        </p>
      </div>
      <div className="sq-field">
        <label htmlFor="s3">Locked</label>
        <input className="sq-input" id="s3" defaultValue="Physics" disabled />
      </div>
      <div className="sq-field">
        <label htmlFor="s4">Notes</label>
        <textarea
          className="sq-textarea"
          id="s4"
          placeholder="Type or paste your study material…"
        />
      </div>
    </div>
  ),
};
