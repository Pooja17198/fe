import { GraphView } from "./components/GraphView";

type CablingProps = {
  onSelectedSiteNameChanged?: (siteName: string) => void;
};

const Cabling = ({ onSelectedSiteNameChanged }: CablingProps) => {
  return (
    <GraphView onSelectedSiteNameChanged={onSelectedSiteNameChanged} />
  );
};

export default Cabling;
