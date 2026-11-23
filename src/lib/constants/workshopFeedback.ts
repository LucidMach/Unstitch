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

// ------------------------------------------------------- school liaison and staff

/**
 * The longer evaluation for the teacher liaison and other school staff, at /workshop/school?c=CODE.
 * `n` is the question number shown on the page; `key` is what is stored. Questions are required unless
 * marked `optional`. The testimonial permission (q12) is only required when a testimonial was written.
 */
export type SchoolQuestion =
  | { key: string; n: number; kind: "single"; label: string; choices: Choice[]; optional?: boolean }
  | { key: string; n: number; kind: "multi"; label: string; hint: string; choices: Choice[]; otherLabel: string; optional?: boolean }
  | { key: string; n: number; kind: "text"; label: string; placeholder?: string; prompts?: string[]; promptsLabel?: string; optional?: boolean }
  | { key: string; n: number; kind: "short"; label: string; type: "text" | "email"; autocomplete: string; optional: true };

export interface SchoolSection { id: string; title: string; intro?: string; questions: SchoolQuestion[] }

const rating = (): Choice[] => [
  { v: "excellent", label: "Excellent" },
  { v: "very-good", label: "Very good" },
  { v: "good", label: "Good" },
  { v: "fair", label: "Fair" },
  { v: "poor", label: "Poor" },
];

export const schoolForm = {
  title: "Unstitch School Workshop Evaluation & Feedback",
  /** `{school}` is replaced by the school name on the booking. */
  thanksLine: "Thank you for having Unstitch at {school}!",
  intro:
    "We'd love to hear your thoughts on the workshop. Your feedback helps us improve our educational programmes and develop meaningful learning experiences for students.",
  time: "Estimated completion time: 3–5 minutes",
  sent: "Thank you for supporting Unstitch and helping us make creative, sustainable learning more accessible!",
  sections: [
    {
      id: "educational-value",
      title: "Educational value",
      questions: [
        { key: "q1", n: 1, kind: "single", label: "How would you rate the overall educational value of the workshop?", choices: rating() },
        {
          key: "q2", n: 2, kind: "single",
          label: "To what extent do you feel the workshop aligned with your school's educational priorities?",
          choices: [
            { v: "very-well", label: "Very well" },
            { v: "well", label: "Well" },
            { v: "somewhat", label: "Somewhat" },
            { v: "not-particularly", label: "Not particularly" },
            { v: "not-sure", label: "Not sure" },
          ],
        },
        {
          key: "q3", n: 3, kind: "multi",
          label: "Which aspects of the workshop do you feel were most valuable?",
          hint: "Select all that apply.",
          choices: [
            { v: "sustainability", label: "Sustainability, material reuse and circular economy" },
            { v: "design-thinking", label: "Design thinking and creative problem-solving" },
            { v: "stem", label: "STEM and spatial reasoning" },
            { v: "collaboration", label: "Collaborative learning and teamwork" },
            { v: "hands-on", label: "Hands-on making and experimentation" },
            { v: "textile-design", label: "Exploring alternative approaches to textile design" },
          ],
          otherLabel: "Other",
        },
        {
          key: "q4", n: 4, kind: "single",
          label: "Do you feel the workshop was appropriate for the intended student cohort in terms of age, abilities and learning needs?",
          choices: [
            { v: "very", label: "Very appropriate" },
            { v: "appropriate", label: "Appropriate" },
            { v: "somewhat", label: "Somewhat appropriate" },
            { v: "not", label: "Not appropriate" },
            { v: "not-sure", label: "Not sure" },
          ],
        },
      ],
    },
    {
      id: "delivery",
      title: "Delivery and organisation",
      questions: [
        { key: "q5", n: 5, kind: "single", label: "How would you rate the organisation and delivery of the workshop?", choices: rating() },
        {
          key: "q6", n: 6, kind: "single",
          label: "Was the communication, coordination and preparation with Unstitch clear and effective?",
          choices: [
            { v: "completely", label: "Yes, completely" },
            { v: "mostly", label: "Mostly" },
            { v: "somewhat", label: "Somewhat" },
            { v: "no", label: "No" },
            { v: "na", label: "Not applicable" },
          ],
        },
        {
          key: "q7", n: 7, kind: "text",
          label: "What did you find most valuable about the workshop, and is there anything you think could be improved?",
        },
      ],
    },
    {
      id: "future",
      title: "Future opportunities",
      questions: [
        {
          key: "q8", n: 8, kind: "single",
          label: "Would your school be interested in engaging Unstitch for future workshops or programmes?",
          choices: [
            { v: "yes", label: "Yes" },
            { v: "possibly", label: "Possibly" },
            { v: "not-now", label: "Not at this stage" },
          ],
        },
        {
          key: "q9", n: 9, kind: "text", optional: true,
          label: "Are there other year levels, subjects or school initiatives where you could see Unstitch workshops being relevant?",
        },
        {
          key: "q10", n: 10, kind: "text", optional: true,
          label: "What would make our learn programme more valuable to your school or encourage you to engage Unstitch again?",
        },
      ],
    },
    {
      id: "testimonial",
      title: "Testimonial (optional)",
      intro:
        "We'd love to hear about your experience working with Unstitch. Your comments may help other schools understand the value of our workshops.",
      questions: [
        {
          key: "q11", n: 11, kind: "text", optional: true,
          label: "Would you be happy to share a short testimonial about your experience?",
          promptsLabel: "Suggested prompts",
          prompts: [
            "What did you particularly value about the workshop?",
            "What stood out about the students' experience?",
            "What made the workshop different from other learning experiences?",
            "Would you recommend Unstitch to other schools? Why?",
          ],
        },
        {
          key: "q12", n: 12, kind: "single", optional: true,
          label: "How may we use your testimonial?",
          choices: [
            { v: "name-and-school", label: "With my name and school identified" },
            { v: "school-only", label: "With the school identified, but without my name" },
            { v: "anonymous", label: "Anonymously, without identifying me or the school" },
            { v: "ask-first", label: "Please contact me to seek approval before using it" },
            { v: "no-public-use", label: "I do not give permission for public use" },
          ],
        },
        { key: "q13", n: 13, kind: "short", type: "text", autocomplete: "name", optional: true, label: "Your name and role (optional)" },
        { key: "q14", n: 14, kind: "short", type: "text", autocomplete: "organization", optional: true, label: "School name (optional)" },
        { key: "q15", n: 15, kind: "short", type: "email", autocomplete: "email", optional: true, label: "Email address (optional)" },
      ],
    },
  ] as SchoolSection[],
};

/** Every school question in one list, in order. */
export const schoolQuestions: SchoolQuestion[] = schoolForm.sections.flatMap((s) => s.questions);

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
