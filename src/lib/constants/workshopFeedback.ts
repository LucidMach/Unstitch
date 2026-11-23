// src/lib/constants/workshopFeedback.ts
//
// The questions in the three feedback forms of the workshop hub: students (on the
// participant page), teachers (/workshop/teacher) and the facilitator (a section at the
// bottom of the Facilitator tab). The pages, the API checks and Admin > Workshops all read
// from this one file, so a wording change here reaches all of them.
//
// If you change a `key` or a choice `v`, old answers keep their old keys. Changing the
// wording of a question or label is always safe.

// ------------------------------------------------------------------ students

/** The scale for the five statements. 1 is lowest, 5 is highest. */
export const studentScale = [
  { v: 1, label: "Not at all" },
  { v: 2, label: "A little" },
  { v: 3, label: "Mostly" },
  { v: 4, label: "Yes" },
  { v: 5, label: "Yes, confidently" },
] as const;

/** "How much is this true for you?" One scale answer per statement. `outcome` is what it checks. */
export const studentStatements = [
  { key: "reuse", text: "I can think of ways to use leftover materials instead of throwing them away.", outcome: "Material reuse" },
  { key: "connect", text: "I understand how the tiles connect and come apart to build things.", outcome: "Connection system" },
  { key: "spatial", text: "I can turn flat tiles into 3D structures.", outcome: "Spatial reasoning" },
  { key: "discover", text: "I discovered that the same tiles can be used to make many different things.", outcome: "Adaptability" },
  { key: "team", text: "My team shared ideas and worked together to build something.", outcome: "Teamwork" },
] as const;

export type StudentStatementKey = (typeof studentStatements)[number]["key"];

export const studentReflection = {
  teamName: "Team name",
  whatMade: "What did your team make?",
  interesting: "What was the most interesting or surprising thing you discovered today?",
  difficult: "What was difficult or frustrating? What would you change?",
} as const;

// ------------------------------------------------------------------ teachers

export interface Choice { v: string; label: string }

export const teacherForm = {
  title: "Teacher feedback",
  intro: "Thank you for joining us. Your feedback helps us improve our workshops and learning experiences. It takes about 2 minutes.",
  engagement: {
    label: "How engaged were students throughout the workshop?",
    choices: [
      { v: "very", label: "Very engaged" },
      { v: "mostly", label: "Mostly engaged" },
      { v: "somewhat", label: "Somewhat engaged" },
      { v: "not-very", label: "Not very engaged" },
    ] as Choice[],
  },
  observed: {
    label: "Did you observe students demonstrating any of the following?",
    hint: "Select all that apply.",
    choices: [
      { v: "problem-solving", label: "Creative problem-solving and experimentation" },
      { v: "modular", label: "Understanding of modular connections" },
      { v: "spatial", label: "Spatial reasoning through 3D construction" },
      { v: "collaboration", label: "Collaboration and shared decision-making" },
      { v: "reuse", label: "Understanding of material reuse and adaptability" },
    ] as Choice[],
  },
  appropriate: {
    label: "How appropriate was the workshop for the students' age and abilities?",
    choices: [
      { v: "very", label: "Very appropriate" },
      { v: "appropriate", label: "Appropriate" },
      { v: "somewhat", label: "Somewhat appropriate" },
      { v: "not", label: "Not appropriate" },
    ] as Choice[],
  },
  valuable: { label: "What did you find most valuable about the workshop?", placeholder: "Your response..." },
  improve: { label: "Was there anything students struggled with or that could be improved?", placeholder: "Your response..." },
  recommend: {
    label: "Would you recommend this workshop to other teachers?",
    choices: [
      { v: "yes", label: "Yes" },
      { v: "maybe", label: "Maybe" },
      { v: "no", label: "No" },
    ] as Choice[],
  },
} as const;

// --------------------------------------------------------------- facilitator

/** A to-do list for the person running the workshop: what they saw, and what to fix. */
export const facilitatorScale: Choice[] = [
  { v: "1", label: "1 · Not demonstrated" },
  { v: "2", label: "2 · Demonstrated with guidance" },
  { v: "3", label: "3 · Demonstrated independently" },
  { v: "no", label: "N/O · Not observed" },
];

export const facilitatorOutcomes = [
  { key: "reuse", q: "Did students recognise that leftover textiles and materials can be useful resources?", checks: "Material reuse" },
  { key: "connections", q: "Could students understand and use the modular connections?", checks: "Connection system" },
  { key: "spatial", q: "Could students translate 2D tiles into 3D structures?", checks: "Spatial reasoning" },
  { key: "exploration", q: "Could students experiment with different geometries, patterns or structural configurations?", checks: "Design exploration" },
  { key: "reversibility", q: "Could students disassemble, adapt or reuse their creations?", checks: "Reversibility and adaptability" },
  { key: "teamwork", q: "Did students collaborate, share ideas and contribute to a shared structure?", checks: "Teamwork" },
] as const;

/** Questions 7 and 8 are open; 9 to 12 are a quick yes / partly / no with room for a note. */
export const facilitatorDeliveryOpen = [
  { key: "engaging", q: "Which activity generated the most engagement?" },
  { key: "assistance", q: "At what point did students need the most assistance?" },
] as const;

export const facilitatorYesPartlyNo: Choice[] = [
  { v: "yes", label: "Yes" },
  { v: "partly", label: "Partly" },
  { v: "no", label: "No" },
];

export const facilitatorDeliveryChecks = [
  { key: "instructions", q: "Were the instructions and demonstrations clear enough for students to work independently?" },
  { key: "tiles", q: "Were the tiles and connections easy for students to manipulate?" },
  { key: "balance", q: "Were the physical and digital activities appropriately balanced?" },
  { key: "time", q: "Was the allocated time sufficient for students to plan, build, reflect and disassemble?" },
] as const;

export const facilitatorOpen = [
  { key: "created", q: "What was the most interesting or unexpected thing a student or team created?" },
  { key: "challenges", q: "What were the three biggest challenges encountered during the workshop?" },
  { key: "change", q: "What would you change about the workshop next time?" },
  { key: "unexpected", q: "Did you observe any learning or behaviours that weren't anticipated in the original learning outcomes?" },
] as const;

/** The quick observations table. `kind` says how it is answered. */
export const facilitatorObservations = [
  { key: "independent", label: "Students who independently assembled structures", kind: "ypn" },
  { key: "beyond", label: "Students who experimented beyond demonstrated examples", kind: "ypn", note: "Did students begin experimenting with possibilities beyond the examples demonstrated to them?" },
  { key: "reused", label: "Students who successfully disassembled and reused tiles", kind: "ypn" },
  { key: "difficulty", label: "Most common technical difficulty", kind: "text" },
  { key: "successful", label: "Most successful activity", kind: "text" },
] as const;

export const facilitatorSections = {
  a: "A. Learning outcomes assessment",
  b: "B. Workshop delivery and usability",
  bHint: "These questions help identify operational improvements.",
  c: "C. Open-ended reflection",
  obs: "Quick observations",
} as const;

// ------------------------------------------------------------------- helpers

/** Label for a stored choice value, falling back to the raw value if the choice was removed. */
export function labelFor(choices: readonly Choice[], v: string | null | undefined): string {
  if (!v) return "";
  return choices.find((c) => c.v === v)?.label ?? v;
}
