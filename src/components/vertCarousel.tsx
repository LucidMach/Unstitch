import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const products = [
    {name: "Tote", image: "/Hero.png", color: "bg-orange-300"},
  { name: "Big Tote", image: "/BigTote.png", color: "bg-orange-300" },
  { name: "Bucket", image: "/Bucket.png", color: "bg-blue-300" },
  { name: "Clutch", image: "/Clutch.png", color: "bg-pink-300" },
  { name: "Moon", image: "/Moon.png", color: "bg-purple-300" },
  { name: "Semi", image: "/Semi.png", color: "bg-yellow-300" },
  { name: "Square", image: "/Square.png", color: "bg-green-300" },
];

const VertCarousel: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastScrollTime, setLastScrollTime] = useState(0);
  const scrollAccumulator = useState({ current: 0 })[0]; // Ref-like behavior for mutable scroll accumulator

  const handleDotClick = (index: number) => {
    setCurrentIndex(index);
    // Reset auto-cycle timer logic implicitly by state change (if we use a key or dependency) or we can make the interval dependent on currentIndex
  };

  // Auto-cycle effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % products.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [currentIndex]); // Reset interval on index change (manual or auto) causes a fresh 1.5s wait

  // Scroll navigation effect
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const now = Date.now();
      // Debounce: ignore scrolls if too soon after last change (e.g., 500ms)
      if (now - lastScrollTime < 500) {
        scrollAccumulator.current = 0;
        return;
      }

      scrollAccumulator.current += e.deltaY;

      // Threshold: almost 1 page length (e.g., 60% of viewport height)
      const threshold = window.innerHeight * 0.6;

      if (Math.abs(scrollAccumulator.current) > threshold) {
        if (scrollAccumulator.current > 0) {
          // Scroll Down -> Next
          setCurrentIndex((prev) => (prev + 1) % products.length);
        } else {
          // Scroll Up -> Prev
          setCurrentIndex((prev) => (prev - 1 + products.length) % products.length);
        }
        // Reset accumulation and update timestamp
        scrollAccumulator.current = 0;
        setLastScrollTime(now);
      }
    };

    window.addEventListener("wheel", handleWheel);
    return () => window.removeEventListener("wheel", handleWheel);
  }, [lastScrollTime, scrollAccumulator]);

  return (
    <div className="relative -z-10 w-full h-full bg-neutral-50 overflow-hidden flex flex-col items-center justify-center">
      {/* 1. Left Sidebar Navigation (Dots) */}
      <div className="absolute left-4 md:left-12 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 md:gap-4 bg-black rounded-full py-2 px-1 md:py-4 md:px-2">
        {products.map((_, index) => (
          <button
            key={index}
            onClick={() => handleDotClick(index)}
            className={`w-2 h-2 md:w-4 md:h-4 rounded-full transition-all duration-300 ${
              index === currentIndex ? "bg-pink-400 scale-125" : "bg-neutral-600 hover:bg-neutral-400"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* 2. Center Content */}
      <div className="relative w-full h-full flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative w-full h-full flex items-center justify-center"
          >
            {/* Background Typography */}
            {/* <h1 className="absolute text-[120px] md:text-[200px] font-bold text-[#8B3A4F] -rotate-90 select-none opacity-80 z-0 tracking-tighter leading-none">
              {products[currentIndex].name.split(" ")[0].toLowerCase()}
            </h1> */}

            {/* Product Image */}
            <motion.img
              initial={{ y: 20, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              src={products[currentIndex].image}
              alt={products[currentIndex].name}
              className="relative z-10 h-full w-full object-contain"
            />
            
            {/* 3. Bottom Button */}
            <div className="absolute bottom-35 md:bottom-30 cursor-pointer z-20">
              <Button 
                className="bg-[#A87285] hover:bg-[#8B5A6B] text-white px-8 rounded-none uppercase tracking-widest"
              >
                explore
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>


    </div>
  );
};

export default VertCarousel;
