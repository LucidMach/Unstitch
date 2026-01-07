import { useRef, useState } from "react";
import { useAtom } from "jotai";
import { sections, selectAtom } from "../atoms/navAtom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const NavBar: React.FC = () => {
  const [selected, setSelected] = useAtom(selectAtom);
  const [open, setOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline>(null);

  useGSAP(
    () => {
      if (open) {
        gsap.to(menuRef.current, {
          height: "auto",
          autoAlpha: 1,
          duration: 0.5,
          ease: "power2.out",
        });
        gsap.fromTo(
          ".menu-item",
          { y: 20, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            stagger: 0.1,
            duration: 0.4,
            ease: "back.out(1.7)",
            delay: 0.1,
          }
        );
      } else {
        gsap.to(menuRef.current, {
          height: 0,
          autoAlpha: 0,
          duration: 0.4,
          ease: "power2.in",
        });
      }
    },
    { scope: containerRef, dependencies: [open] }
  );

  return (
    <div
      ref={containerRef}
      className="fixed flex w-full h-full top-0 flex-col justify-between pointer-events-none"
    >
      <div className="border-b border-gray-300 pointer-events-auto bg-white/80 backdrop-blur-md z-50">
        <div className="flex flex-row items-center justify-between p-3">
          <img
            src="/Mascot.png"
            className="m-2 md:w-16 md:h-16 w-10 h-10"
            decoding="async"
            loading="lazy"
            alt="the logo of unstitched"
          />
          <h1 className="text-2xl md:text-4xl font-light tracking-wide">
            UnStitch
          </h1>
        </div>
      </div>
      
      {/* Bottom Control Bar */}
      <div className="pointer-events-auto bg-white/80 backdrop-blur-md">
        <div
          className="p-3 border-t border-gray-300 flex flex-row items-center justify-between cursor-pointer group"
          onClick={() => setOpen((state) => !state)}
        >
          {/* Icon Container with Rotation Animation */}
          <div className="relative w-10 h-10 flex items-center justify-center overflow-hidden">
             {/* Open Icon */}
            <svg
              className={`absolute w-full h-full transition-all duration-500 ease-in-out transform ${
                open ? "rotate-180 opacity-0 scale-50" : "rotate-0 opacity-100 scale-100"
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
                open ? "rotate-0 opacity-100 scale-100" : "-rotate-180 opacity-0 scale-50"
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
            className={`text-xl flex-1 md:mr-8 md:text-center text-right transition-opacity duration-300 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          >
            Menu  
          </h1>
        </div>

        {/* Animated Menu Container */}
        <div 
          ref={menuRef} 
          // className="h-0 overflow-hidden invisible flex flex-col p-3 border-t border-gray-300 items-center bg-white"
        >
          <div className="flex flex-col space-y-4 py-4 w-full items-center">
            {sections.map((section, index) => (
              <h1
                key={section}
                className={`menu-item text-2xl md:text-3xl font-bold cursor-pointer transition-colors duration-200 hover:text-[#C7A6C3] ${
                  index === selected ? "text-black" : "text-gray-300"
                }`}
                onClick={() => {
                  setSelected(index);
                  if(index === 1){
                    // 1 is PlayGround
                    window.location.href = "/playground";
                  }
                  setOpen(false);
                }}
              >
                {section}
              </h1>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavBar;
