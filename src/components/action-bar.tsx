/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import React, { useMemo } from "react";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { History } from "lucide-react";

interface ActionBarProps {
    historyCount: number;
    redoCount: number;
    canDelete: boolean;
    onReset: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onDelete: () => void;
}

const ActionBar: React.FC<ActionBarProps> = ({
    historyCount,
    redoCount,
    canDelete,
    onReset,
    onUndo,
    onRedo,
    onDelete
}) => {
    // The "Current" dot starts at slot index 2 (Position 3)
    // and moves to slot index 3 (Position 4) for all subsequent moves.
    const targetSlot = historyCount === 0 ? 2 : 3;

    const visibleDots = useMemo(() => {
        // We generate a window of 5 slots.
        // We want the dot at `historyCount` to be at `targetSlot`.
        return Array.from({ length: 5 }).map((_, i) => {
            const absoluteIndex = historyCount - targetSlot + i;
            
            if (absoluteIndex < 0 || absoluteIndex > (historyCount + redoCount)) {
                return { id: `empty-${absoluteIndex}`, type: 'empty' as const };
            }
            
            let type: 'past' | 'current' | 'future' = 'past';
            if (absoluteIndex === historyCount) type = 'current';
            else if (absoluteIndex > historyCount) type = 'future';
            
            return {
                id: `state-${absoluteIndex}`,
                type
            };
        });
    }, [historyCount, redoCount, targetSlot]);

    return (
        <motion.div 
            layout
            className="absolute bottom-5 sm:bottom-7 flex gap-2 sm:gap-3 pointer-events-auto items-center px-4 py-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl"
        >
            {/* Reset Button */}
            <AnimatePresence mode="popLayout">
                {historyCount >= 1 && (
                    <motion.div
                        key="reset-btn"
                        layout
                        initial={{ opacity: 0, scale: 0.5, x: -10 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.5, x: -10 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    >
                        <Button
                            variant="secondary"
                            size="icon"
                            className="w-9 h-9 sm:w-10 sm:h-10 cursor-pointer hover:bg-pink-100 bg-white/80 shadow-sm border-zinc-200"
                            onClick={(e) => {
                                e.stopPropagation();
                                onReset();
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                            </svg>
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Undo Button */}
            <motion.div layout>
                <Button
                    variant="secondary"
                    size="icon"
                    className="w-9 h-9 sm:w-10 sm:h-10 cursor-pointer hover:bg-pink-100 bg-white/80 shadow-sm border-zinc-200 disabled:opacity-30"
                    disabled={historyCount === 0}
                    onClick={(e) => {
                        e.stopPropagation();
                        onUndo();
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24">
                        <path d="M17.026 22.957c10.957-11.421-2.326-20.865-10.384-13.309l2.464 2.352h-9.106v-8.947l2.232 2.229c14.794-13.203 31.51 7.051 14.794 17.675z"/>
                    </svg>
                </Button>
            </motion.div>

            {/* Dynamic History Preview with Layout Animation */}
            <motion.div 
                layout
                className="relative flex items-center px-3 sm:px-4 py-1 bg-white/50 backdrop-blur-md rounded-full border border-zinc-200/50 shadow-inner h-9 sm:h-10 min-w-[120px] sm:min-w-[180px] justify-center overflow-hidden"
            >
                {/* Fixed Icon and Separator on the left */}
                <div className="absolute left-3 sm:left-4 flex items-center gap-2 sm:gap-3">
                    <div className="flex items-center text-zinc-400/80">
                        <History className="w-3.5 h-3.5 sm:w-[15px] sm:h-[15px]" strokeWidth={2.5} />
                    </div>
                    <div className="w-[1px] h-3 sm:h-4 bg-zinc-300/60" />
                </div>

                {/* Centered Dots Container */}
                <div className="flex gap-2 sm:gap-2.5 items-center h-full translate-x-3 sm:translate-x-0">
                    <AnimatePresence mode="popLayout" initial={false}>
                        {visibleDots.map((dot) => (
                            <motion.div
                                key={dot.id}
                                layout
                                initial={{ opacity: 0, scale: 0.2, x: 20 }}
                                animate={{ 
                                    opacity: dot.type === 'empty' ? 0.2 : 1, 
                                    scale: dot.type === 'current' ? 1.3 : dot.type === 'empty' ? 0.75 : 1, 
                                    x: 0,
                                    backgroundColor: dot.type === 'current' ? "#ec4899" : dot.type === 'past' ? "#a1a1aa" : dot.type === 'empty' ? "transparent" : "#e4e4e7"
                                }}
                                exit={{ opacity: 0, scale: 0.2, x: -20 }}
                                transition={{ 
                                    layout: { type: "spring", stiffness: 400, damping: 30 },
                                    opacity: { duration: 0.2 },
                                    scale: { type: "spring", stiffness: 500, damping: 25 },
                                    backgroundColor: { duration: 0.4 }
                                }}
                                className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 relative ${
                                    dot.type === 'current' ? "shadow-[0_0_12px_rgba(236,72,153,0.8)] z-10" : "z-0"
                                } ${
                                    dot.type === 'future' ? "border-2 border-zinc-300" : ""
                                } ${
                                    dot.type === 'empty' ? "border-2 border-zinc-200" : ""
                                }`}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            </motion.div>

            {/* Redo Button */}
            <motion.div layout>
                <Button
                    variant="secondary"
                    size="icon"
                    className="w-9 h-9 sm:w-10 sm:h-10 cursor-pointer hover:bg-pink-100 bg-white/80 shadow-sm border-zinc-200 disabled:opacity-30"
                    disabled={redoCount === 0}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRedo();
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" style={{ transform: 'scaleX(-1)' }}>
                        <path d="M17.026 22.957c10.957-11.421-2.326-20.865-10.384-13.309l2.464 2.352h-9.106v-8.947l2.232 2.229c14.794-13.203 31.51 7.051 14.794 17.675z"/>
                    </svg>
                </Button>
            </motion.div>

            {/* Delete Button */}
            <AnimatePresence mode="popLayout">
                {canDelete && (
                    <motion.div
                        key="delete-btn"
                        layout
                        initial={{ opacity: 0, scale: 0.5, x: 10 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.5, x: 10 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    >
                        <Button
                            variant="destructive"
                            size="icon"
                            className="w-9 h-9 sm:w-10 sm:h-10 cursor-pointer shadow-lg"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
                            </svg>
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default ActionBar;