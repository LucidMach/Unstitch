// src/lib/constants/workshopDeck.ts
//
// The workshop deck as it appears in the hub's projector view. The slides are
// pictures (public/assets/workshop/deck/slide-01.webp ...) exported from the
// deck file, and the facilitator notes are in notes.json beside them. To change
// the deck: re-export the slides, run `pnpm workshop:deck <folder>` (see
// scripts/build-workshop-deck.mjs), update notes.json and, if the slide count
// or a slide that has a QR code or starts a phase moved, the numbers below.
//
// Slide numbers here are the numbers in the deck file, where each animation step
// (for example the five role cards, or the two halves of the last-but-one slide)
// is its own slide. Deck v9 has 29.

export const deck = {
  /** Number of slides. */
  count: 29,
  /** Slide pictures: `${base}${NN}.webp`. */
  base: "/assets/workshop/deck/slide-",
  notesUrl: "/assets/workshop/deck/notes.json",

  /**
   * When the facilitator reaches one of these slides, the countdown moves forward to that
   * phase (phase numbers count from 1, matching `phases` in workshop.ts). It only ever moves
   * forward, and it keeps running or paused as it was, so reaching a slide late changes nothing.
   *  - slide 1  : Introduce (welcome and circular fashion)
   *  - slide 16 : Teams & brief (the challenge, roles, kit, constraints)
   *  - slide 25 : Explore & build (Begin the challenge)
   *  - slide 26 : Share (show and tell)
   *  - slide 27 : Unbuild & reflect
   * Test & refine (phase 4) has no slide of its own: the countdown rolls into it by itself
   * when Explore & build ends, and the bell marks the change.
   */
  anchors: { 1: 1, 16: 2, 25: 3, 26: 5, 27: 6 } as Record<number, number>,

  /**
   * The countdown pill on the slides appears from this slide on (slide 16, "The challenge"). Before it,
   * during the introduction, the slides show no clock. The facilitator window keeps its own timer, and
   * T still opens the big clock.
   */
  clockFromSlide: 16,

  /**
   * QR codes the hub draws onto the slides, over the empty white boxes in the deck. Each one is
   * made from the booking code of the workshop being run. Position and size are fractions of the
   * slide (left, top, width, height). `kind` says where it points:
   *  - student  : the participant page (/workshop?c=CODE)
   *  - feedback : the same page, scrolled to the student feedback form (#feedback)
   *  - teacher  : the teacher feedback form (/workshop/teacher?c=CODE)
   * `line` is an optional strip under the box for the typed fallback; `small` is for tiny boxes.
   */
  qr: [
    {
      slide: 25,
      kind: "student",
      box: { x: 0.6825, y: 0.3333, w: 0.2175, h: 0.3867 },
      line: { x: 0.64, y: 0.8, w: 0.3, h: 0.05 },
    },
    { slide: 28, kind: "feedback", small: true, box: { x: 0.7837, y: 0.4521, w: 0.1013, h: 0.18 } },
    { slide: 28, kind: "teacher", small: true, box: { x: 0.7837, y: 0.68, w: 0.1013, h: 0.18 } },
  ] as {
    slide: number;
    kind: "student" | "feedback" | "teacher";
    box: { x: number; y: number; w: number; h: number };
    line?: { x: number; y: number; w: number; h: number };
    small?: boolean;
  }[],
};
