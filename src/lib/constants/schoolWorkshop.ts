// Single source of truth for the school workshop subject tracks and the
// school enquiry options. Used by BOTH /learn/schools (renders the track
// cards) and /contact (renders the multiselect), so adding, renaming or
// removing a track here updates both pages -- they can't drift apart.

export interface SubjectTrack {
  /** Stable key submitted with the enquiry; the label is what's shown/emailed. */
  id: string;
  tag: 'Systems' | 'STEAM' | 'Value & Identity';
  title: string;
  description: string;
  curriculumFit: string;
  /** Optional extra line under the curriculum fit (e.g. an availability caveat). */
  note?: string;
}

export const subjectTracks: SubjectTrack[] = [
  {
    id: 'sustainable-lifecycles',
    tag: 'Systems',
    title: 'Sustainable Lifecycles & Circular Economy',
    description:
      'Students learn circular economy principles by visiting global traditional packaging techniques, then prototype reimagined 3D packaging without glue.',
    curriculumFit: 'Geography, Design and Technology',
  },
  {
    id: 'tactile-steam-geometry',
    tag: 'STEAM',
    title: 'Tactile STEAM & Geometry',
    description:
      'Students explore structural thinking and spatial reasoning using tactile geometry, symmetry, pattern and tessellation to transform 2D flat tiles into 3D structures.',
    curriculumFit: 'Mathematics, Design and Technology',
  },
  {
    id: 'community-eco-emblem',
    tag: 'Value & Identity',
    title: 'Community Eco-Emblem',
    description:
      "Students collaborate, design, prototype and pitch simplified, abstract emblems that physically represent the school's values that becomes a permanent school asset.",
    curriculumFit: 'Wellness, Design and Technology (Graphic and Branding)',
  },
  {
    id: 'architectural-systems',
    tag: 'Systems',
    title: 'Architectural Systems in Spaces',
    description:
      'Students construct interior spatial elements, acoustic wall paneling, or architectural models using the tile system.',
    curriculumFit: 'Engineering, Design and Technology (Spatial Design)',
  },
  {
    id: 'e-textiles-wearable-tech',
    tag: 'STEAM',
    title: 'Interactive E-Textiles & Wearable Tech',
    description:
      'Students rapid prototype a smart garment or an interactive soft sculpture that reacts to light, touch or sound with simple open-source hardware such as micro:bits or conductive thread.',
    curriculumFit: 'Digital Technologies, Design and Technology',
    note: 'Currently only available to schools with electronic kits.',
  },
  {
    id: 'textile-animation',
    tag: 'Value & Identity',
    title: 'Textile Animation',
    description: 'Students direct and build creative storytelling through tactile frame-by-frame animation.',
    curriculumFit: 'Media & Visual Arts',
  },
];

/** Shown after the six tracks so a school can still enquire without choosing. */
export const NOT_SURE_TRACK = { id: 'not-sure', title: 'Not sure yet — recommend something' };

/** Display order of the lenses; the contact form lists tracks grouped in this order. */
export const trackLenses: SubjectTrack['tag'][] = ['Systems', 'STEAM', 'Value & Identity'];

/** Tracks sorted so each lens's tracks sit together, in the order above. */
export const tracksGroupedByLens: SubjectTrack[] = trackLenses.flatMap((lens) =>
  subjectTracks.filter((track) => track.tag === lens),
);

/** Budget brackets for the enquiry dropdown. */
export const budgetOptions = ['Under $500', '$500 – $1,000', '$1,000 – $2,000', '$2,000 – $5,000', 'Over $5,000'];

export const hearAboutOptions = [
  'Social media',
  'LinkedIn',
  'Google search',
  'Word of mouth / a colleague',
  'Zero Waste Festival',
  'Education event or conference',
  'Other',
];
