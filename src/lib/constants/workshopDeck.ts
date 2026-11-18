// src/lib/constants/workshopDeck.ts
//
// The workshop deck as it appears in the hub's projector view. The slides are
// pictures (public/assets/workshop/deck/slide-01.webp ...) exported from the
// deck file, and the facilitator notes are in notes.json beside them. To change
// the deck: re-export the slides, run `pnpm workshop:deck <folder>` (see
// scripts/build-workshop-deck.mjs), update notes.json and, if the slide count
// or the QR slide moved, the numbers below.

export const deck = {
  /** Number of slides. */
  count: 21,
  /** Slide pictures: `${base}${NN}.webp`. */
  base: "/assets/workshop/deck/slide-",
  notesUrl: "/assets/workshop/deck/notes.json",

  /**
   * When the facilitator reaches one of these slides, the countdown moves forward to that
   * phase (phase numbers count from 1, matching `phases` in workshop.ts). It only ever moves
   * forward, and it keeps running or paused as it was, so reaching a slide late changes nothing.
   *  - slide 1  : Introduce
   *  - slide 9  : Teams & brief (the challenge)
   *  - slide 18 : Explore & build (Begin the challenge)
   *  - slide 19 : Share, unbuild & reflect (show and tell)
   * Test & refine (phase 4) has no slide of its own: the countdown rolls into it by itself
   * when Explore & build ends, and the bell marks the change.
   */
  anchors: { 1: 1, 9: 2, 18: 3, 19: 5 } as Record<number, number>,

  /**
   * Slide 18 has an empty box where the school's own QR code goes. The hub draws it there from
   * the booking code. Position and size are fractions of the slide (left, top, width, height).
   */
  qrSlide: 18,
  qrBox: { x: 0.682, y: 0.333, w: 0.217, h: 0.387 },
  /** Where the typed fallback line sits under the box (fractions of the slide). */
  qrLine: { x: 0.64, y: 0.795, w: 0.3, h: 0.05 },
};
