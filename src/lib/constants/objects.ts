// Built-in objects for the /how-it-works catalogue.
//
// Objects can ALSO be added without touching code: Admin > Objects saves them
// to the database and they appear on the page next to these (see
// src/server/objects.ts). Use this file for objects whose photo lives in the
// repo (src/assets); use the admin for everything else.
//
// Fields marked (SEO) are what search engines and AI answer engines quote --
// plain, factual sentences, the first one able to stand alone.

import type { ImageMetadata } from 'astro';
import mushroomImage from '../../assets/slow-bloom-mushroom.png';
import cupWarmerImage from '../../assets/slow-bloom-cup-warmer.png';
import turtleImage from '../../assets/slow-bloom-turtle-lifestyle.png';
import elephantImage from '../../assets/object-elephant.webp';
import feltCubeImage from '../../assets/object-felt-cube.webp';
import medifyImage from '../../assets/object-medify-pixel-art.webp';

export interface ObjectCredit {
  name: string;
  /** e.g. "Designer", "Maker", "Collaborator". */
  role?: string;
  /** Link to their site / Instagram / LinkedIn, if they want one. */
  url?: string;
}

export interface CatalogueObject {
  /** Short and lowercase; used for the share link (/how-it-works#<slug>). */
  slug: string;
  /** Short display name. */
  name: string;
  /** One line shown on the card. */
  tagline: string;
  /** (SEO) 1-2 plain, factual sentences. The FIRST sentence should stand alone. */
  summary: string;
  /** (SEO) What kind of thing it is, in plain words. */
  objectType: string;
  /** Number of tiles it's built from. Leave out if unknown. */
  tiles?: number;
  /** (SEO) Materials, as specifically as you know them. */
  materials?: string[];
  /** Optional, e.g. "20 minutes". */
  buildTime?: string;
  /** Who made it. */
  designedBy: ObjectCredit[];
  image: ImageMetadata;
  /** (SEO / accessibility) Describe what is actually in the photo. */
  imageAlt: string;
}

const STUDIO: ObjectCredit[] = [{ name: 'Unstitch', role: 'Designer' }];

export const objects: CatalogueObject[] = [
  {
    slug: 'mushroom',
    name: 'Mushroom',
    tagline: 'A 14-tile flat composition',
    summary:
      'The Mushroom is a flat composition built from 14 interlocking textile tiles: a brown soil base, a turquoise water layer and a navy mushroom on top. The tiles join with tabs and slots, with no sewing or glue.',
    objectType: 'Flat tile composition',
    tiles: 14,
    materials: ['Rescued deadstock textile'],
    designedBy: STUDIO,
    image: mushroomImage,
    imageAlt:
      'Flat lay of 14 interlocking fabric tiles arranged as a mushroom: a navy cap and stem over a row of turquoise fleece tiles and a row of brown tiles.',
  },
  {
    slug: 'cup-warmer',
    name: 'Reusable Cup Warmer',
    tagline: 'A 9-tile cup holder with a rolled top',
    summary:
      'The Reusable Cup Warmer is a small standing holder built from 9 interlocking textile tiles: a one-tile base, four standing walls and a rolled turquoise fleece edge. The tiles join with tabs and slots, with no sewing or glue.',
    objectType: 'Cup warmer / holder',
    tiles: 9,
    materials: ['Rescued deadstock textile', 'Turquoise fleece (rolled top)'],
    designedBy: STUDIO,
    image: cupWarmerImage,
    imageAlt:
      'A dark-grey woven fabric holder with a rolled turquoise fleece top, holding a black cup, with a smaller photo of the unrolled version in the corner.',
  },
  {
    slug: 'turtle',
    name: 'Turtle',
    tagline: 'A 22-tile soft sculpture',
    summary:
      'The Turtle is a soft sculpture built from 22 interlocking textile tiles: a turquoise-and-brown shell with navy legs, tail and head, stuffed with fluff and closed with a bottom shell. The tiles join with tabs and slots, with no sewing or glue.',
    objectType: 'Soft sculpture',
    tiles: 22,
    materials: ['Rescued deadstock textile', 'Turquoise fleece (shell)', 'Fluff filling'],
    designedBy: STUDIO,
    image: turtleImage,
    imageAlt:
      'A soft turtle sculpture on a woven rug, with a turquoise fleece shell panelled in brown and navy fabric tiles, and frayed navy legs.',
  },
  {
    slug: 'elephant',
    name: 'Elephant',
    tagline: 'A small folded elephant',
    summary:
      'The Elephant is a small folded figure with a grey head, large ears, googly eyes and a textured grey-and-white body.',
    objectType: 'Folded figure',
    designedBy: STUDIO,
    image: elephantImage,
    imageAlt:
      'A small folded grey elephant figure with large ears, two googly eyes and a textured grey-and-white body, on a white background.',
  },
  {
    slug: 'felt-cube',
    name: 'Felt Cube',
    tagline: 'A soft cube in natural felt',
    summary: 'The Felt Cube is a soft cube made from cream-coloured felt.',
    objectType: 'Soft cube',
    materials: ['Felt'],
    designedBy: STUDIO,
    image: feltCubeImage,
    imageAlt: 'A soft cream felt cube with slightly rounded edges on a white background.',
  },
  {
    slug: 'medify-pixel-art',
    name: 'Medify × Unstitch Pixel Art',
    tagline: 'A pixel-art wall panel in black and turquoise',
    summary:
      'The Medify × Unstitch Pixel Art piece is a wall-mounted panel of black and turquoise textile tiles arranged as pixel art, made as a collaboration between Medify and Unstitch.',
    objectType: 'Collaboration wall panel',
    designedBy: [
      { name: 'Unstitch', role: 'Designer' },
      { name: 'Medify', role: 'Collaborator' },
    ],
    image: medifyImage,
    imageAlt:
      'A wall-mounted pixel-art panel of black and turquoise textile tiles under a sign reading Medify x Unstitch Pixel Art Collab.',
  },
];

export const getObject = (slug: string) => objects.find((o) => o.slug === slug);

/** Display line for the credits, e.g. "Unstitch" or "Alex Lee (Designer), Unstitch". */
export const creditLine = (credits: ObjectCredit[]) =>
  credits.map((c) => (c.role && credits.length > 1 ? `${c.name} (${c.role})` : c.name)).join(', ');

/** The four "how it works" steps -- real HTML on the page, so they're readable without JavaScript. */
export const howItWorksSteps = [
  {
    n: '01',
    title: 'Source',
    body: 'We rescue surplus and offcut textile that would otherwise go to landfill.',
    label: 'Offcuts',
  },
  {
    n: '02',
    title: 'Cut',
    body: 'The fabric is cut into flat tiles, each with tabs and slots along its edges.',
    label: 'Tile · tab + slot',
  },
  {
    n: '03',
    title: 'Interlock',
    body: 'A tab passes through a slot to join one tile to the next. No sewing, no glue.',
    label: 'Tab into slot',
  },
  {
    n: '04',
    title: 'Re-make',
    body: 'Take it apart whenever you like and build something new from the same tiles.',
    label: 'Build · unbuild · repeat',
  },
];

export const howItWorksFaq = [
  {
    q: 'What is Unstitch?',
    a: 'Unstitch is a Melbourne (Naarm) circular design studio. We make interlocking textile tiles from rescued deadstock that join into 3D objects without sewing, stitching or glue.',
  },
  {
    q: 'Do I need to sew or glue anything?',
    a: 'No. Each tile has tabs and slots, and a tab passes through a slot to hold tiles together.',
  },
  {
    q: 'Can I take an object apart and make something else?',
    a: 'Yes. Because the tiles are only interlocked, they can be taken apart and rebuilt into a different object as often as you like.',
  },
  {
    q: 'Where does the fabric come from?',
    a: 'From surplus and offcut textile that would otherwise be thrown away. If you have surplus material you would like to divert, you can get in touch through our contact page.',
  },
];
