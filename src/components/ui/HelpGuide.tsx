import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X } from 'lucide-react';
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
    isTouch ? { text: "Tap tile to modify" } : { text: "Click tile to modify" }
  ];

  return (
    <>
      {/* Floating Action Button on Bottom Left */}
      <div className="absolute bottom-5 left-4 sm:bottom-6 sm:left-6 pointer-events-auto flex flex-col items-start gap-2.5 z-40">
        {/* Desktop Popover Tooltip */}
        <AnimatePresence>
          {show && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="hidden sm:block bg-white/95 backdrop-blur-xl p-5 rounded-2xl shadow-xl border border-neutral-200 w-64 mb-1 origin-bottom-left"
            >
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center pb-2.5 border-b border-neutral-100">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">Interaction Guide</h3>
                    <p className="text-[10px] text-neutral-400">Navigation & Gestures</p>
                  </div>
                  <button 
                    onClick={() => setShow(false)} 
                    className="p-1 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="flex flex-col gap-2.5">
                  {guideItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#A36E93] shrink-0" />
                      <p className="text-[11px] font-semibold text-neutral-700 uppercase tracking-tight leading-tight">{item.text}</p>
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
          title="Interaction Guide"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl shadow-md border transition-all duration-200 ${
            show ? "bg-neutral-900 text-white border-neutral-900" : "bg-white/90 text-neutral-700 border-neutral-200 hover:text-[#A36E93] hover:border-neutral-400"
          }`}
          onClick={() => setShow(!show)}
        >
          <HelpCircle size={18} />
        </Button>
      </div>

      {/* Mobile Bottom Sheet Modal */}
      <AnimatePresence>
        {show && (
          <div className="sm:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-4 pointer-events-auto">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl p-6 shadow-2xl border border-neutral-200 w-full max-w-sm mb-2"
            >
              <div className="flex flex-col gap-5">
                <div className="flex justify-between items-center pb-2.5 border-b border-neutral-100">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">Interaction Guide</h3>
                    <p className="text-xs text-neutral-400">Navigation & Gestures</p>
                  </div>
                  <button 
                    onClick={() => setShow(false)} 
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="flex flex-col gap-3 py-1">
                  {guideItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#A36E93]" />
                      <p className="text-xs font-semibold text-neutral-700 uppercase tracking-tight">{item.text}</p>
                    </div>
                  ))}
                </div>
                <Button 
                  onClick={() => setShow(false)}
                  className="w-full bg-neutral-900 hover:bg-black text-white rounded-xl py-2.5 font-semibold text-xs uppercase tracking-wider"
                >
                  Got It
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
