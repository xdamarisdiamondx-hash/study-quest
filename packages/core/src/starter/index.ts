/**
 * Starter subject templates (PRD section 6).
 *
 * These are templates, not user data. Onboarding copies the chosen set into the
 * signed-in user's own subjects, so two users never share rows — which is why they
 * live here rather than in the `subjects` table, which is user-scoped.
 */
export interface StarterTopic {
  name: string;
  description: string;
}

export interface StarterSubject {
  name: string;
  monogram: string;
  topics: StarterTopic[];
}

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
