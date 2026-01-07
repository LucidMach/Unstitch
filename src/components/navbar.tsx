import { useRef, useState } from "react";
import { useAtom } from "jotai";
import { selectAtom, sections } from "../atoms/navAtom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const NavBar: React.FC = () => {
  const [selected, setSelected] = useAtom(selectAtom);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Refs for the 4 elements
  const homeRef = useRef<HTMLDivElement>(null);
  const shopRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  
  const tl = useRef<gsap.core.Timeline>(null);

  useGSAP(
    () => {
      tl.current = gsap.timeline({ 
        defaults: { ease: "power3.out", duration: 1.5 },
        paused: true
      });

      // Define animation with responsive-ish starting points
      // Note: GSAP "from" values are absolute pixels here. 
      // Ideally these would be relative or functional, but keeping it simple for now as they fly-in from "far away".
      tl.current
      .from(homeRef.current, {
        x: -500,
        y: -500,
        opacity: 0,
        rotation: -45,
      }, 0)
      .from(shopRef.current, {
        x: 500,
        y: -500,
        opacity: 0,
        rotation: 45,
      }, 0)
      .from(playRef.current, {
        y: 500,
        opacity: 0,
        rotation: -10,
      }, 0)
      .from(centerRef.current, {
        scale: 0,
        rotation: 180,
        opacity: 0,
        duration: 1.2,
      }, 0.2); 
    },
    { scope: containerRef }
  );

  useGSAP(() => {
      if (isOpen) {
          tl.current?.play();
      } else {
          tl.current?.reverse();
      }
  }, [isOpen]);

  const handleNav = (index: number, path?: string) => {
      setSelected(index);
      if(path) {
          window.location.href = path;
      }
      setIsOpen(false);
  };

  return (
    <>
        {/* Restored Header */}
        <div className="fixed top-0 left-0 w-full border-b border-gray-300 pointer-events-auto bg-white/80 backdrop-blur-md z-50">
            <div className="flex flex-row items-center justify-between p-3">
            <img
                src="/Mascot.png"
                className="m-2 md:w-16 md:h-16 w-10 h-10"
                decoding="async"
                loading="lazy"
                alt="the logo of unstitched"
            />
            <h1 className="text-2xl md:text-4xl font-light tracking-wide mr-16 md:mr-0">
                UnStitch
            </h1>
            </div>
        </div>

        {/* Bottom Control Bar / Trigger */}
        <div className="fixed bottom-0 left-0 w-full pointer-events-auto bg-white/80 backdrop-blur-md z-[60] border-t border-gray-300">
            <div
                className="p-3 flex flex-row items-center justify-between cursor-pointer group"
                onClick={() => setIsOpen((state) => !state)}
            >
                {/* Icon Container with Rotation Animation */}
                <div className="relative w-10 h-10 flex items-center justify-center overflow-hidden">
                    {/* Open Icon */}
                    <svg
                    className={`absolute w-full h-full transition-all duration-500 ease-in-out transform ${
                        isOpen ? "rotate-180 opacity-0 scale-50" : "rotate-0 opacity-100 scale-100"
                    }`}
                    clipRule="evenodd"
                    fillRule="evenodd"
                    strokeLinejoin="round"
                    strokeMiterlimit="2"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    >
                    <path
                        d="m13 16.745c0-.414-.336-.75-.75-.75h-9.5c-.414 0-.75.336-.75.75s.336.75.75.75h9.5c.414 0 .75-.336.75-.75zm9-5c0-.414-.336-.75-.75-.75h-18.5c-.414 0-.75.336-.75.75s.336.75.75.75h18.5c.414 0 .75-.336.75-.75zm-4-5c0-.414-.336-.75-.75-.75h-14.5c-.414 0-.75.336-.75.75s.336.75.75.75h14.5c.414 0 .75-.336.75-.75z"
                        fillRule="nonzero"
                    />
                    </svg>
                    
                    {/* Close Icon (X) */}
                    <svg
                    className={`absolute w-6 h-6 transition-all duration-500 ease-in-out transform ${
                        isOpen ? "rotate-0 opacity-100 scale-100" : "-rotate-180 opacity-0 scale-50"
                    }`}
                    clipRule="evenodd"
                    fillRule="evenodd"
                    strokeLinejoin="round"
                    strokeMiterlimit="2"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    >
                    <path d="m12 10.93 5.719-5.72c.146-.146.339-.219.531-.219.404 0 .75.324.75.749 0 .193-.073.385-.219.532l-5.72 5.719 5.719 5.719c.147.147.22.339.22.531 0 .427-.349.75-.75.75-.192 0-.385-.073-.531-.219l-5.719-5.719-5.719 5.719c-.146.146-.339.219-.531.219-.401 0-.75-.323-.75-.75 0-.192.073-.384.22-.531l5.719-5.719-5.72-5.719c-.146-.147-.219-.339-.219-.532 0-.425.346-.749.75-.749.192 0 .385.073.531.219z" />
                    </svg>
                </div>

                <h1
                    className={`text-xl flex-1 md:mr-8 md:text-center text-right transition-all duration-300 ${
                    isOpen ? "opacity-0" : "opacity-100"
                    }`}
                >
                    {sections[selected] === "WorkShop" ? "Work" : sections[selected]}
                </h1>
            </div>
        </div>

        <div
        ref={containerRef}
        onClick={() => setIsOpen(false)}
        className={`fixed inset-0 z-40 flex items-center justify-center overflow-hidden font-sans transition-all duration-500 
            ${isOpen ? 'pointer-events-auto bg-white/20 backdrop-blur-sm' : 'pointer-events-none bg-transparent delay-1000'}`}
        >
        {/* 1. HOME - Top Left 
            Mobile: Smaller, closer to edge
            Desktop: Larger, 25% offset
        */}
        <div 
            ref={homeRef}
            onClick={(e) => { e.stopPropagation(); handleNav(0); }}
            className="absolute cursor-pointer
                    w-48 h-48 md:w-80 md:h-80 bg-[#dbeafe] 
                    flex items-center justify-center 
                    shadow-xl
                    top-[-5%] left-[-5%] md:top-[10%] md:left-[25%]"
            style={{ 
                transform: 'rotate(-15deg)',
                backgroundColor: '#Dddddd' 
            }}
        >
            <span className="text-[#a88ea6] text-2xl md:text-4xl tracking-wider">Home</span>
        </div>

        {/* 2. SHOP NOW - Top Right 
            Mobile: Top Right edge
            Desktop: 25% offset
        */}
        <div 
            ref={shopRef}
            onClick={(e) => { e.stopPropagation(); handleNav(2); }} 
            className="absolute cursor-pointer
                    w-48 h-48 md:w-96 md:h-96 
                    flex items-center justify-center 
                    shadow-xl z-10
                    top-[-2%] right-[-5%] md:top-[5%] md:right-[25%]"
            style={{ 
                transform: 'rotate(10deg)',
                backgroundColor: '#e6dabb' 
            }}
        >
            <span className="text-[#a88ea6] text-2xl md:text-5xl tracking-wider">Work</span>
        </div>

        {/* 3. CENTER HUB */}
        <div 
            ref={centerRef}
            onClick={(e) => e.stopPropagation()} 
            className="absolute cursor-pointer
                    w-32 h-32 md:w-48 md:h-48 
                    flex flex-col items-center justify-center 
                    shadow-2xl z-30"
            style={{ 
                transform: 'rotate(45deg)', 
                backgroundColor: '#ceabc1' 
            }}
        >
            <div style={{ transform: 'rotate(-45deg)', textAlign: 'center' }} className="flex flex-col items-center">
                <span className="text-white text-2xl md:text-4xl font-bold mb-1">...</span>
                <span className="text-[0.4rem] md:text-[0.5rem] text-white/80 uppercase tracking-widest leading-tight">yi jing <br/> lucidmach <br/> alethea</span>
            </div>
        </div>

        {/* 4. PLAYGROUND - Bottom 
            Mobile: Bottom Center, wide
            Desktop: Bottom Center/Left offset
        */}
        <div 
            ref={playRef}
            onClick={(e) => { e.stopPropagation(); handleNav(1, '/playground'); }} 
            className="absolute cursor-pointer
                    w-56 h-64 md:w-80 md:h-96 
                    flex items-center justify-center 
                    shadow-xl z-20
                    bottom-[-10%] left-1/2 -translate-x-1/2 md:bottom-[5%] md:left-[35%] md:translate-x-0"
            style={{ 
                transform: 'rotate(-5deg)',
                backgroundColor: '#a6a6a6' 
            }}
        >
            <div className="text-center">
                <div className="text-white text-xl md:text-3xl tracking-wide">PlayGround</div>
            </div>
        </div>

        </div>
    </>
  );
};

export default NavBar;
