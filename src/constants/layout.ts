export const ITEM_SCALE: [number, number, number] = [30, 1, 30];

export const getLayoutConstants = (overlap: number) => {
  const GHOST_WIDTH = ITEM_SCALE[0] + overlap * 29;
  const OFFSET_MAJOR = GHOST_WIDTH * (1 - overlap / 10);
  const OFFSET_MINOR = GHOST_WIDTH * (1 - overlap);
  return { GHOST_WIDTH, OFFSET_MAJOR, OFFSET_MINOR };
};
