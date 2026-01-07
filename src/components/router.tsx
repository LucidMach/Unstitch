import { selectAtom, sections } from "@/atoms/navAtom";
import { useAtom } from "jotai";

import ComingSoon from "./comingSoon";
import VertCarousel from "./vertCarousel";

const Router: React.FC = () => {
  const [selected, setSelected] = useAtom(selectAtom);

  if (sections[selected] === "Home")
    return (
      <>
        <VertCarousel />
      </>
    );
  else if (sections[selected] === "WorkShop")
    return (
      <>
        <ComingSoon />
      </>
    );
  else if (sections[selected] === "Journey")
    return (
      <>
        <ComingSoon />
      </>
    );
  else if (sections[selected] === "Community")
    return (
      <>
        <ComingSoon />
      </>
    );
  else return <>404</>;
};

export default Router;
