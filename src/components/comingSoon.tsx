import { motion } from "framer-motion";
import { Button } from "./ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

const ComingSoon: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="space-y-8"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-50 text-pink-500 border border-pink-100 text-xs font-bold uppercase tracking-wider mb-4">
          <Sparkles size={14} />
          Coming Soon
        </div>
        
        <h1 className="text-4xl md:text-5xl font-bold text-zinc-800 tracking-tight leading-tight">
          Crafting the future <br /> 
          <span className="text-pink-500">of fashion.</span>
        </h1>
        
        <p className="text-lg text-zinc-600 leading-relaxed">
          The full collection is under construction, but you can already start creating.
          Experience our <span className="font-semibold text-zinc-800">Playground</span> — a virtual simulation of making cloth items out of modular tessellation <span className="italic text-pink-500 font-medium">"tex-tiles"</span>.
        </p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="pt-4"
        >
          <Button 
            asChild
            className="h-14 px-8 bg-zinc-900 hover:bg-pink-600 text-white rounded-full text-base font-bold transition-all duration-300 shadow-xl hover:shadow-pink-200 group"
          >
            <a href="/playground" className="flex items-center gap-3">
              Enter Playground 
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </a>
          </Button>
        </motion.div>

        <div className="pt-12 grid grid-cols-3 gap-8 opacity-40">
           <div className="h-[1px] bg-zinc-300 w-full" />
           <div className="text-[10px] uppercase tracking-[0.2em] -mt-1.5 font-bold text-zinc-500">Unstitch</div>
           <div className="h-[1px] bg-zinc-300 w-full" />
        </div>
      </motion.div>
    </div>
  );
};

export default ComingSoon;
