import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { sections, selectAtom } from "../atoms/navAtom";

const NavBar: React.FC = () => {
  // let sections = ["Home", "PlayGround", "WorkShop", "Journey", "Community"];
  const [selected, setSelected] = useAtom(selectAtom);
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    // console.log(window.location.href);
  }, []);

  return (
    <div className="fixed flex w-full h-full top-0 flex-col justify-between">
      <div className="border-b border-gray-300">
        <div className="flex flex-row items-center justify-between p-3">
          <img
            src="/logo.png"
            width={48}
            height={48}
            decoding="async"
            loading="lazy"
            alt="the logo of unstitched"
          />
          <h1 className="text-2xl">UnStitched</h1>
        </div>
      </div>
      <div>
        <div
          className="p-3 border-t border-gray-300 flex flex-row items-center justify-between cursor-pointer"
          onClick={() => setOpen((state) => !state)}
        >
          {/* <button onClick={(e) => setOpen(true)}> */}
          <svg
            clipRule="evenodd"
            fillRule="evenodd"
            strokeLinejoin="round"
            strokeMiterlimit="2"
            viewBox="0 0 24 24"
            className={`w-10 h-10 ${open ? "invisible" : ""}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="m13 16.745c0-.414-.336-.75-.75-.75h-9.5c-.414 0-.75.336-.75.75s.336.75.75.75h9.5c.414 0 .75-.336.75-.75zm9-5c0-.414-.336-.75-.75-.75h-18.5c-.414 0-.75.336-.75.75s.336.75.75.75h18.5c.414 0 .75-.336.75-.75zm-4-5c0-.414-.336-.75-.75-.75h-14.5c-.414 0-.75.336-.75.75s.336.75.75.75h14.5c.414 0 .75-.336.75-.75z"
              fillRule="nonzero"
            />
          </svg>
          {/* </button> */}
          <h1 className="text-xl">{sections[selected]}</h1>
          {/* <button onClick={() => setOpen(false)}> */}
          <svg
            clipRule="evenodd"
            fillRule="evenodd"
            strokeLinejoin="round"
            strokeMiterlimit="2"
            viewBox="0 0 24 24"
            className={`w-6 h-6 ${!open ? "invisible" : ""}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="m12 10.93 5.719-5.72c.146-.146.339-.219.531-.219.404 0 .75.324.75.749 0 .193-.073.385-.219.532l-5.72 5.719 5.719 5.719c.147.147.22.339.22.531 0 .427-.349.75-.75.75-.192 0-.385-.073-.531-.219l-5.719-5.719-5.719 5.719c-.146.146-.339.219-.531.219-.401 0-.75-.323-.75-.75 0-.192.073-.384.22-.531l5.719-5.719-5.72-5.719c-.146-.147-.219-.339-.219-.532 0-.425.346-.749.75-.749.192 0 .385.073.531.219z" />
          </svg>
          {/* </button> */}
        </div>
        {open ? (
          <div className="flex flex-col p-3 space-y-3 border-t border-gray-300 items-center">
            {sections.map((section, index) => (
              <h1
                className={`cursor-pointer ${
                  index === selected ? "text-black" : "text-gray-400"
                }`}
                onClick={() => {
                  // window.location.href = `${section.toLowerCase()}`;
                  setSelected(index);
                  setOpen(false);
                }}
              >
                {section}
              </h1>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default NavBar;
