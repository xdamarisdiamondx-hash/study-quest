/**
 * Starter subject templates (PRD section 6).
 *
 * These are templates, not user data. Onboarding copies the chosen set into the
 * signed-in user's own subjects, so two users never share rows — which is why they
 * live here rather than in the `subjects` table, which is user-scoped.
 *
 * One template also carries **worked example material** (P22): a real note, a real
 * quiz and a real deck on one of its topics. A first run that opens onto empty
 * screens teaches the student that the app is empty, not what it is for — so the
 * example subject arrives with the material the topic quest steps point at.
 */
export interface StarterTopic {
  name: string;
  description: string;
}

/** A note as it ships in the example subject: markdown, exactly as a student would write it. */
export interface StarterNote {
  /** Must name one of the subject's own topics. */
  topic: string;
  title: string;
  bodyMd: string;
}

/** One multiple-choice question. Grading compares the answer *text*, never an index. */
export interface StarterQuestion {
  prompt: string;
  options: string[];
  /** Must be one of `options`, verbatim. */
  answer: string;
  explanation: string;
  /** Groups the question for "Needs Review" and retries, like an AI quiz's tags. */
  conceptTag?: string;
}

export interface StarterQuiz {
  topic: string;
  title: string;
  questions: StarterQuestion[];
}

export interface StarterCard {
  front: string;
  back: string;
}

export interface StarterDeck {
  topic: string;
  title: string;
  cards: StarterCard[];
}

/**
 * The example payload handed out at onboarding: one note, a quiz generated from
 * it and a deck of its key terms — the same three things the AI flow produces,
 * written once so the first run does not depend on a provider key.
 */
export interface StarterExample {
  note: StarterNote;
  quiz: StarterQuiz;
  deck: StarterDeck;
}

export interface StarterSubject {
  name: string;
  monogram: string;
  topics: StarterTopic[];
  /** Present on exactly the subjects that ship worked example material. */
  example?: StarterExample;
}

/**
 * The note that comes with the example subject. Real material: this is what a
 * student reads to decide whether the app is worth keeping.
 */
const MOTION_NOTE: StarterNote = {
  topic: "Motion",
  title: "Newton's three laws",
  bodyMd: [
    "Almost every first-term mechanics question is one of these three laws wearing a different hat.",
    "",
    "## 1. Inertia",
    "",
    "An object keeps doing what it is doing unless a **net** force acts on it. A book resting on a",
    "table is not being pushed up by the table — it is stationary, and the table's push exactly",
    "cancels gravity. Zero net force means constant velocity, and zero is a perfectly valid",
    "velocity.",
    "",
    "## 2. F = ma",
    "",
    "The net force on an object equals its mass times its **acceleration** — not its speed. Double",
    "the force on the same mass and you double the acceleration; halve the mass and you double it",
    "again. Forces are vectors, so they add head to tail: draw every arrow on a free-body diagram,",
    'resolve them, and "net force" stops being an abstraction.',
    "",
    "## 3. Action and reaction",
    "",
    "For every force there is an equal and opposite force — acting on a **different** object. You",
    "push the Earth backwards as hard as it pushes you up. The pair never cancels, because the two",
    'forces never act on the same body. Mistaking this for the first law ("if forces cancel',
    'nothing moves") is the classic exam trap.',
    "",
    "## What the questions actually ask",
    "",
    "- Which free-body diagram has the correct net force?",
    "- A light rope pulls two blocks: what is the tension?",
    "- Which of these is a third-law pair, and which are just two forces on one object?",
  ].join("\n"),
};

const MOTION_QUIZ: StarterQuiz = {
  topic: "Motion",
  title: "Motion checkpoint",
  questions: [
    {
      prompt: "A book lies still on a table. Which statement is correct?",
      options: [
        "Gravity pulls the book down and the table pushes it up, so the net force is zero.",
        "There is no force on the book, because it is not moving.",
        "The book's inertia cancels gravity.",
        "The table pushes harder than gravity pulls.",
      ],
      answer: "Gravity pulls the book down and the table pushes it up, so the net force is zero.",
      explanation:
        "Newton's first law: zero net force means the velocity stays as it is — here, zero. The two forces act on the same object and balance.",
      conceptTag: "first-law",
    },
    {
      prompt: "A net force of 4 N acts on a 2 kg cart. What is its acceleration?",
      options: ["0.5 m/s²", "2 m/s²", "4 m/s²", "8 m/s²"],
      answer: "2 m/s²",
      explanation: "a = F/m = 4/2 = 2 m/s². Force sets the acceleration, not the speed.",
      conceptTag: "f=ma",
    },
    {
      prompt:
        'You push a shopping cart forward and it keeps rolling at a constant speed. What does "constant speed" tell you?',
      options: [
        "Your push equals friction: the net force is zero.",
        "Your push is cancelled by the cart's inertia.",
        "The cart is accelerating at zero force.",
        "Friction has stopped acting.",
      ],
      answer: "Your push equals friction: the net force is zero.",
      explanation:
        "Constant velocity means zero net force, so the forward push and the resistive forces are equal and opposite.",
      conceptTag: "first-law",
    },
    {
      prompt: "Which of these is a Newton's third-law pair?",
      options: [
        "A rope pulls a box left; the box pulls the rope right.",
        "Gravity pulls a book down; the table pushes the book up.",
        "You push a cart forward; friction slows the cart.",
        "An engine turns the wheels; the wheels push the road.",
      ],
      answer: "A rope pulls a box left; the box pulls the rope right.",
      explanation:
        "Third-law pairs act on two different objects. The other rows list forces acting on one object — balanced forces, not a pair.",
      conceptTag: "third-law",
    },
    {
      prompt: "Doubling the net force and halving the mass changes the acceleration by:",
      options: ["×2", "×4", "×½", "not enough information"],
      answer: "×4",
      explanation: "a = F/m: twice the force gives 2a, and half the mass doubles that again.",
      conceptTag: "f=ma",
    },
  ],
};

const MOTION_DECK: StarterDeck = {
  topic: "Motion",
  title: "Motion: key terms",
  cards: [
    {
      front: "Newton's first law",
      back: "An object keeps its velocity unless a net force acts on it.",
    },
    {
      front: "Net force",
      back: "The vector sum of every force on one object. Zero net force means constant velocity.",
    },
    { front: "F = ma", back: "Net force equals mass times acceleration — not speed." },
    {
      front: "Mass vs weight",
      back: "Mass is the inertia you carry (kg); weight is the force gravity exerts on you (N).",
    },
    {
      front: "Newton's third law",
      back: "Forces come in equal and opposite pairs, acting on two different objects.",
    },
    {
      front: "Normal force",
      back: "The perpendicular push a surface makes on whatever rests on it.",
    },
    {
      front: "Free-body diagram",
      back: 'One object, every force as an arrow — the tool that makes "net force" mechanical.',
    },
    { front: "Inertia", back: "The tendency to keep the current velocity; measured by mass." },
  ],
};

export const STARTER_SUBJECTS: StarterSubject[] = [
  {
    name: "Physics",
    monogram: "Ph",
    topics: [
      { name: "Motion", description: "Velocity, acceleration, forces and Newton's laws." },
      { name: "Electricity", description: "Charge, current, voltage and circuits." },
      { name: "Waves", description: "Sound, light, frequency and amplitude." },
      { name: "Heat", description: "Temperature, transfer and thermodynamics." },
    ],
    // The worked example: the topic quest handed out at onboarding points at
    // Motion, and this is the material its steps walk through.
    example: { note: MOTION_NOTE, quiz: MOTION_QUIZ, deck: MOTION_DECK },
  },
  {
    name: "Chemistry",
    monogram: "Ch",
    topics: [
      { name: "Atomic Structure", description: "Protons, neutrons, electrons and isotopes." },
      { name: "Reactions", description: "Balancing equations and reaction types." },
      { name: "Acids and Bases", description: "pH, neutralisation and indicators." },
    ],
  },
  {
    name: "Biology",
    monogram: "Bi",
    topics: [
      { name: "Photosynthesis", description: "Light, chlorophyll, glucose and oxygen." },
      { name: "Cell Structure", description: "Organelles and their functions." },
      { name: "Genetics", description: "DNA, genes, inheritance and variation." },
    ],
  },
  {
    name: "Mathematics",
    monogram: "Ma",
    topics: [
      { name: "Algebra", description: "Equations, inequalities and sequences." },
      { name: "Trigonometry", description: "Sine, cosine, tangent and the unit circle." },
      { name: "Probability", description: "Outcomes, distributions and expected values." },
      { name: "Calculus", description: "Derivatives and integrals." },
    ],
  },
];

/**
 * A two-letter monogram for the subject tile (section 3.5).
 *
 * Two words take their initials ("Advanced Physics" -> "AP"). A single word keeps its
 * first letter capital and its second as-is, so "Physics" -> "Ph" — capitalising the
 * whole thing would read as shouting in a small tile.
 */
export function monogramFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  if (words.length === 1) {
    const word = words[0]!;
    return word[0]!.toUpperCase() + word.slice(1, 2);
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}
