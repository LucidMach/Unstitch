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
            className="absolute bottom-5 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 sm:gap-2 pointer-events-auto items-center p-1.5 sm:p-2 bg-white/95 backdrop-blur-md rounded-2xl border border-neutral-200 shadow-xl z-40"
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
                            variant="ghost"
                            size="icon"
                            title="Reset all"
                            className="w-9 h-9 sm:w-10 sm:h-10 cursor-pointer hover:bg-neutral-100 text-neutral-700 rounded-xl"
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
                    variant="ghost"
                    size="icon"
                    title="Undo"
                    className="w-9 h-9 sm:w-10 sm:h-10 cursor-pointer hover:bg-neutral-100 text-neutral-700 disabled:opacity-30 rounded-xl"
                    disabled={historyCount === 0}
                    onClick={(e) => {
                        e.stopPropagation();
                        onUndo();
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.026 22.957c10.957-11.421-2.326-20.865-10.384-13.309l2.464 2.352h-9.106v-8.947l2.232 2.229c14.794-13.203 31.51 7.051 14.794 17.675z"/>
                    </svg>
                </Button>
            </motion.div>

            {/* Dynamic History Preview */}
            <motion.div 
                layout
                className="relative flex items-center px-3 sm:px-4 bg-neutral-100/80 rounded-xl h-9 sm:h-10 min-w-[100px] sm:min-w-[140px] justify-center overflow-hidden"
            >
                {/* Fixed Icon on the left */}
                <div className="absolute left-2.5 sm:left-3 flex items-center text-neutral-400">
                    <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.5} />
                </div>

                {/* Centered Dots Container */}
                <div className="flex gap-2 sm:gap-2.5 items-center h-full translate-x-2 sm:translate-x-1.5">
                    <AnimatePresence mode="popLayout" initial={false}>
                        {visibleDots.map((dot) => (
                            <motion.div
                                key={dot.id}
                                layout
                                initial={{ opacity: 0, scale: 0.2, x: 20 }}
                                animate={{ 
                                    opacity: dot.type === 'empty' ? 0.25 : 1, 
                                    scale: dot.type === 'current' ? 1.35 : dot.type === 'empty' ? 0.75 : 1, 
                                    x: 0,
                                    backgroundColor: dot.type === 'current' ? "#A36E93" : dot.type === 'past' ? "#525252" : dot.type === 'empty' ? "#d4d4d4" : "#a3a3a3"
                                }}
                                exit={{ opacity: 0, scale: 0.2, x: -20 }}
                                transition={{ 
                                    layout: { type: "spring", stiffness: 400, damping: 30 },
                                    opacity: { duration: 0.2 },
                                    scale: { type: "spring", stiffness: 500, damping: 25 },
                                    backgroundColor: { duration: 0.3 }
                                }}
                                className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 relative ${
                                    dot.type === 'current' ? "shadow-[0_0_8px_rgba(163,110,147,0.85)] z-10" : "z-0"
                                }`}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            </motion.div>

            {/* Redo Button */}
            <motion.div layout>
                <Button
                    variant="ghost"
                    size="icon"
                    title="Redo"
                    className="w-9 h-9 sm:w-10 sm:h-10 cursor-pointer hover:bg-neutral-100 text-neutral-700 disabled:opacity-30 rounded-xl"
                    disabled={redoCount === 0}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRedo();
                    }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'scaleX(-1)' }}>
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
                            title="Delete selected tile"
                            className="w-9 h-9 sm:w-10 sm:h-10 cursor-pointer rounded-xl bg-red-600 hover:bg-red-700 text-white border-none shadow-sm"
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