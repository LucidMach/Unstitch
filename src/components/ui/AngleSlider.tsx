/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import React from 'react';

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
    <div className="absolute sm:top-7 bottom-24 sm:bottom-auto left-1/2 -translate-x-1/2 bg-white/90 shadow-lg backdrop-blur-sm px-6 pb-6 pt-4 rounded-2xl flex items-center gap-3 sm:gap-6 border border-zinc-200 z-10 pointer-events-auto max-w-[95vw]">
      <div className="flex items-center gap-1 sm:gap-1.5 bg-zinc-50 px-2.5 py-1.5 rounded-xl border border-zinc-200 focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-100 transition-all shrink-0">
        <span className="text-[9px] sm:text-[10px] uppercase tracking-tighter font-black text-zinc-400 select-none">Deg</span>
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
            className="w-8 sm:w-10 bg-transparent text-center font-mono text-pink-600 font-bold outline-none [appearance:textfield] text-xs sm:text-sm pt-0.5"
        />
        <span className="text-zinc-400 font-bold text-xs sm:text-sm">°</span>
      </div>
      <div className="relative w-32 sm:w-64 flex flex-col">
        <input
          type="range"
          min={-(99 * Math.PI) / 180}
          max={(99 * Math.PI) / 180}
          step={0.01}
          value={foldAngle || 0}
          onPointerDown={recordMove}
          onChange={(e) => updateFoldAngle(parseFloat(e.target.value))}
          className="w-full accent-pink-500 cursor-pointer relative z-10"
        />
        <div className="absolute top-5 left-0 right-0 h-6 mx-[6px]">
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
                <div className="w-[2px] h-2 bg-zinc-300 rounded mb-1 group-hover:bg-pink-500 transition-colors" />
                <span className="text-[10px] text-zinc-500 font-medium select-none group-hover:text-pink-600 transition-colors">{pt.label}°</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
