// src/lib/constants/workshop.ts
//
// Everything the hidden workshop hub (/workshop) shows. Edit the wording here;
// the page and the facilitator timer both read from this file, so the two can
// never disagree. Keep it in step with the facilitator guide on Drive.
//
// Role names and missions follow the workshop deck (slides 10 to 14: Designer,
// Material Keeper, Builder, Tech Wizard, Storyteller). If the printed role cards
// use different words, change them here so screen and cards match.

export interface WorkshopPhase {
  id: string;
  /** Short name shown on the timer and the plan. */
  title: string;
  /** Shorter name for the small countdown on the slides, when the title is long. */
  short?: string;
  minutes: number;
  /** What the room is doing. Shown to everyone. */
  summary: string;
  /** The line the facilitator can read out, also big on the projector. */
  say: string;
}

export const workshopMeta = {
  title: "Rethink. Reuse. Recreate.",
  challenge: "Design a fashion accessory that can be transformed, adapted or reconfigured into something else.",
  totalMinutes: 45,
  teamSize: 5,
  tilesPerTeam: 24,
  playgroundHref: "/playground",
  // What a team shares: the three parts of the pitch.
  pitch: [
    { label: "Our idea", prompt: "What did we make, who is it for and what does it do?" },
    { label: "Our innovation", prompt: "How does it change into something else without being damaged?" },
    { label: "Our discovery", prompt: "What did we learn about reusing the same material?" },
  ],
  bidCard: {
    title: "We want to share!",
    text: "If your team is happy to present, stand up your bid card on your table. Two or three teams are chosen to share for one minute each.",
  },
  reflection: [
    "What happens to a product when we no longer need it?",
    "What made your design easy to reuse?",
    "Did using fewer materials make it harder to be creative?",
  ],
} as const;

// 45 minutes in total, matching the clock slide of the workshop deck (deck v9): a 5 minute welcome,
// then Brief 5, Build 15, Test 5, Share 5, Unbuild & reflect 10. The minutes here drive the
// facilitator countdown. Which slide starts which phase is in workshopDeck.ts.
export const phases: WorkshopPhase[] = [
  {
    id: "introduce",
    title: "Introduce",
    minutes: 5,
    summary: "Welcome, a quick look at circular fashion and Unstitch.",
    say: "Today you will design something that can become something else.",
  },
  {
    id: "teams-brief",
    title: "Teams & brief",
    short: "Brief",
    minutes: 5,
    summary: "Meet the challenge, take a role card and a kit of 24 tiles, and make sure everyone understands the brief.",
    say: "Choose your roles, take your tiles and read the four constraints.",
  },
  {
    id: "explore-build",
    title: "Explore & build",
    short: "Build",
    minutes: 15,
    summary: "Build with the tiles. Use the playground to try other configurations while you build.",
    say: "Build it, then ask: what else could it become?",
  },
  {
    id: "test-refine",
    title: "Test & refine",
    short: "Test",
    minutes: 5,
    summary: "Test it: does it change form, hold together and come apart cleanly? Improve it, and decide whether to share.",
    say: "Change it into its second form. Fix what does not work.",
  },
  {
    id: "share",
    title: "Share",
    minutes: 5,
    summary: "Show and tell: two or three teams share for one minute each.",
    say: "Teams with a bid card up: tell us your idea, your innovation and your discovery.",
  },
  {
    id: "unbuild-reflect",
    title: "Unbuild & reflect",
    short: "Unbuild & reflect",
    minutes: 10,
    summary: "Every team takes its design apart, packs the tiles and returns the kit. Then everyone gives feedback on the website.",
    say: "Take it apart, return every tile, then give us your feedback.",
  },
];

// Four constraints, matching slides 23 and 25 of the workshop deck. If one is added or removed
// later, change it here and in the deck; the hub counts what is in this list.
export const constraints: { title: string; detail: string }[] = [
  { title: "Up to 24 tiles", detail: "Use no more than the 24 tiles in your kit. Fewer is fine." },
  { title: "A clear purpose and user", detail: "Know who it is for and what it does." },
  { title: "It can adapt", detail: "It can change into another configuration or use." },
  { title: "Beat the clock", detail: "You have 20 minutes to build and test." },
];

/** "three", "five": the page says "Your three constraints" and follows whatever the list holds. */
export function countWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);
}

export interface WorkshopRole {
  id: string;
  name: string;
  /** One colour per role, used on the page, the projector and the printed card.
   *  Palette: workshop deck design guide v0.4 (role colours are used for roles only). */
  color: string;
  /** Optional character image for this role, e.g. "/assets/workshop/roles/designer.png".
   *  Shown at the top of the role card when set; nothing is shown when it is left out. */
  mascot?: string;
  mission: string;
  responsibilities: string[];
  questions: string[];
}

export const roles: WorkshopRole[] = [
  {
    id: "designer",
    name: "Designer",
    color: "#E28FC0",
    mission: "Leads the idea so the team builds something with a clear user and purpose.",
    responsibilities: [
      "Decide the user and the purpose",
      "Choose the first form to build",
      "Keep the idea clear and simple",
    ],
    questions: ["Who will use this?", "What does it do in its first form?", "What will it become next?"],
  },
  {
    id: "material-keeper",
    name: "Material Keeper",
    color: "#56B885",
    mission: "Looks after the tiles, keeping them in good condition so they can be reused.",
    responsibilities: [
      "Count out the tiles and keep track of them",
      "Challenge the team to use fewer where possible",
      "Make sure every tile is returned",
    ],
    questions: ["Do we need all 24?", "Can one tile do two jobs?", "Is every tile accounted for?"],
  },
  {
    id: "builder",
    name: "Builder",
    color: "#E8654A",
    mission: "Builds the design and makes sure it holds together and is stable.",
    responsibilities: [
      "Choose how the tiles connect",
      "Test strength and stability",
      "Check nothing is damaged when it comes apart",
    ],
    questions: ["Does it hold when it is used?", "Can we take it apart without damage?", "Where is the weakest connection?"],
  },
  {
    id: "tech-wizard",
    name: "Tech Wizard",
    color: "#A3C4D9",
    mission: "Tries configurations in the playground and brings the best ideas to the team.",
    responsibilities: [
      "Try the team's ideas in the playground",
      "Show the team other forms the design could take",
      "Compare the digital version with the real build",
    ],
    questions: ["What else could this shape become?", "What changes if we move one tile?", "Does the screen match what we built?"],
  },
  {
    id: "storyteller",
    name: "Storyteller",
    color: "#F7D55C",
    mission: "Keeps track of decisions, includes everyone and prepares the show and tell.",
    responsibilities: [
      "Note the decisions and changes",
      "Make sure everyone's ideas are heard",
      "Prepare the pitch: idea, innovation, discovery",
    ],
    questions: ["What is our idea in one sentence?", "What did we change along the way?", "What did we discover about reuse?"],
  },
];

const CHARCOAL = "#382F3D";

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Text colour (charcoal or white) that reads best on a role colour, so light role colours get dark text. */
export function readableTextOn(hex: string): string {
  const l = luminance(hex);
  const vsWhite = 1.05 / (l + 0.05);
  const vsCharcoal = (l + 0.05) / (luminance(CHARCOAL) + 0.05);
  return vsCharcoal >= vsWhite ? CHARCOAL : "#ffffff";
}
