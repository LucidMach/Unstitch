import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import { Button } from './button';

interface HelpGuideProps {
  show: boolean;
  setShow: (show: boolean) => void;
  isTouch: boolean;
}

export const HelpGuide: React.FC<HelpGuideProps> = ({ show, setShow, isTouch }) => {
  const guideItems = [
    isTouch ? { text: "Swipe to rotate view" } : { text: "Drag to rotate view" },
    isTouch ? { text: "Two fingers to pan" } : { text: "Shift + Drag to pan" },
    isTouch ? { text: "Pinch to zoom view" } : { text: "Scroll to zoom view" },
    isTouch ? { text: "Tap tile to modify" } : { text: "Click tile to modify" },
    { text: "Manage moves in bottom bar" }
  ];

  return (
    <>
      {/* Laptop Version: Floating Button */}
      <div className="hidden sm:flex absolute bottom-7 right-7 pointer-events-auto flex-col items-end gap-3 z-50">
          <AnimatePresence>
            {show && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="bg-white/95 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-zinc-200 w-64 mb-2 origin-bottom-right"
              >
                  <div className="flex flex-col gap-5">
                      <div className="space-y-1">
                          <h4 className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-400">Interaction Guide</h4>
                          <div className="h-[1px] w-8 bg-pink-500" />
                      </div>
                      <div className="flex flex-col gap-4">
                          {guideItems.map((item, i) => (
                              <div key={i} className="flex items-center gap-3">
                                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500/30" />
                                  <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-tight leading-tight">{item.text}</p>
                              </div>
                          ))}
                      </div>
                  </div>
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            variant="secondary"
            size="icon"
            className={`w-12 h-12 rounded-full shadow-lg border border-zinc-200 transition-all duration-300 ${
                show ? "bg-pink-500 text-white border-pink-600 scale-110 rotate-12" : "bg-white/90 text-zinc-500 hover:text-pink-500 hover:scale-105"
            }`}
            onClick={() => setShow(!show)}
          >
            <HelpCircle size={24} />
          </Button>
      </div>

      {/* Mobile Version: Full-width Bottom Bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 pointer-events-auto">
          <AnimatePresence>
            {show && (
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="bg-white/95 backdrop-blur-xl p-8 rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-zinc-200 w-full"
              >
                  <div className="flex flex-col gap-6">
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                            <h4 className="text-[11px] uppercase tracking-[0.2em] font-black text-zinc-400">Interaction Guide</h4>
                            <div className="h-[1px] w-8 bg-pink-500" />
                        </div>
                        <button onClick={() => setShow(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                      </div>
                      <div className="flex flex-col gap-5">
                          {guideItems.map((item, i) => (
                              <div key={i} className="flex items-center gap-4">
                                  <div className="w-2 h-2 rounded-full bg-pink-500" />
                                  <p className="text-[13px] font-bold text-zinc-600 uppercase tracking-tight">{item.text}</p>
                              </div>
                          ))}
                      </div>
                      <div className="h-4" />
                  </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button onClick={() => setShow(!show)} className="w-full h-4 bg-pink-500 text-white flex items-center justify-center gap-2 active:bg-pink-600 transition-colors">
              <HelpCircle size={16} />
              <span className="text-xs">{show ? "Close Guide" : "How to Interact"}</span>
          </button>
      </div>
    </>
  );
};
