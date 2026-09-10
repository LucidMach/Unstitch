/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

export const ITEM_SCALE: [number, number, number] = [30, 1, 30];

export const getLayoutConstants = (overlap: number) => {
  const GHOST_WIDTH = ITEM_SCALE[0] + overlap * 29;
  const OFFSET_MAJOR = GHOST_WIDTH * (1 - overlap / 10);
  const OFFSET_MINOR = GHOST_WIDTH * (1 - overlap);
  return { GHOST_WIDTH, OFFSET_MAJOR, OFFSET_MINOR };
};
