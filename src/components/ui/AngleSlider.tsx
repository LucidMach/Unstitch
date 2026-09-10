/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import React from 'react';
import { motion } from 'framer-motion';

interface AngleSliderProps {
  foldAngle: number;
  typedAngle: string | null;
  setTypedAngle: (val: string | null) => void;
  updateFoldAngle: (angle: number) => void;
  recordMove: () => void;
}

export const AngleSlider: React.FC<AngleSliderProps> = ({
  foldAngle, typedAngle, setTypedAngle, updateFoldAngle, recordMove
}) => {
  const angleDeg = Math.round(((foldAngle || 0) * 180) / Math.PI);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 15, x: "-50%" }}
      animate={{ opacity: 1, y: 0, x: "-50%" }}
      exit={{ opacity: 0, y: 15, x: "-50%" }}
      transition={{ duration: 0.18 }}
      className="absolute bottom-20 sm:bottom-24 left-1/2 bg-white/95 shadow-xl backdrop-blur-md px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl flex items-center gap-3 sm:gap-5 border border-neutral-200 z-30 pointer-events-auto max-w-[95vw]"
    >
      <div className="flex items-center gap-1 sm:gap-1.5 bg-neutral-100/80 px-2.5 py-1.5 rounded-xl border border-neutral-200/80 focus-within:border-neutral-900 focus-within:ring-1 focus-within:ring-neutral-900 transition-all shrink-0">
        <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-neutral-400 select-none">Deg</span>
        <input 
            type="number"
            value={typedAngle !== null ? typedAngle : angleDeg}
            onChange={(e) => {
                setTypedAngle(e.target.value);
                const deg = parseFloat(e.target.value);
                if (!isNaN(deg)) updateFoldAngle((deg * Math.PI) / 180);
            }}
            onFocus={() => { recordMove(); setTypedAngle(""); }}
            onBlur={() => setTypedAngle(null)}
            className="w-8 sm:w-10 bg-transparent text-center font-mono text-neutral-900 font-bold outline-none [appearance:textfield] text-xs sm:text-sm"
        />
        <span className="text-neutral-400 font-bold text-xs sm:text-sm">°</span>
      </div>

      <div className="relative w-36 sm:w-56 flex flex-col pt-1 pb-4">
        <input
          type="range"
          min={-(99 * Math.PI) / 180}
          max={(99 * Math.PI) / 180}
          step={0.01}
          value={foldAngle || 0}
          onPointerDown={recordMove}
          onChange={(e) => updateFoldAngle(parseFloat(e.target.value))}
          className="w-full accent-[#A36E93] cursor-pointer relative z-10"
        />
        <div className="absolute bottom-0 left-0 right-0 h-4 mx-[6px]">
          {[
            { label: '-90', val: -Math.PI / 2 },
            { label: '-45', val: -Math.PI / 4, hideOnMobile: true },
            { label: '0', val: 0 },
            { label: '45', val: Math.PI / 4, hideOnMobile: true },
            { label: '90', val: Math.PI / 2 },
          ].map(pt => {
            const MAX_ANGLE = (100 * Math.PI) / 180;
            const percent = ((pt.val + MAX_ANGLE) / (2 * MAX_ANGLE)) * 100;
            return (
              <div
                key={pt.label}
                className={`absolute flex-col items-center cursor-pointer -translate-x-1/2 group ${pt.hideOnMobile ? 'hidden sm:flex' : 'flex'}`}
                style={{ left: `${percent}%` }}
                onClick={() => updateFoldAngle(pt.val)}
              >
                <div className="w-[1.5px] h-1.5 bg-neutral-300 rounded-full mb-0.5 group-hover:bg-[#A36E93] transition-colors" />
                <span className="text-[9px] sm:text-[10px] text-neutral-400 font-medium select-none group-hover:text-[#A36E93] transition-colors">{pt.label}°</span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};
