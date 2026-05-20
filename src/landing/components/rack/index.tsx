import { useEffect, useRef } from "preact/hooks";
import { RackProps } from "./types";
import NcpRackTab from "./NcpRackTab";
import ValidationServiceRackTab from "./ValidationServiceRackTab";
import { useBuildingBadLinks } from "../network-monitoring/useBuildingBadLinks";
import { BadLinksBanner } from "../network-monitoring/BadLinksBanner";
import { ENABLE_NETWORK_MONITORING } from "../../config/featureFlags";

const Rack = (props: RackProps) => {
  const isFirstRender = useRef(true);

  const networkMonitoringEnabled = ENABLE_NETWORK_MONITORING;
  const badLinks = useBuildingBadLinks(props.building, props.region, networkMonitoringEnabled);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    props.onPageChanged({ path: "home" });
  }, [props.region]);

  return (
    <div class="rack-page">
      <div class="rack-title-box">
        <span role="img" className="oj-icon rack-img-icon" title="Rack Image"></span>
        <h2 class="rack-title-headline">
          <span className="rack-title-key">Building:</span>
          <span className="rack-title-value">{props.building}</span>
          <span className="rack-title-key">Block:</span>
          <span className="rack-title-value">{props.block}</span>
          <span className="rack-title-key">Rack:</span>
          <span className="rack-title-value">{props.rack}</span>
          <span className="rack-title-key">Serial:</span>
          <span className="rack-title-value">{props.rack_serial}</span>
        </h2>
      </div>

      {networkMonitoringEnabled && (
        <BadLinksBanner building={props.building} badLinks={badLinks} />
      )}

      {props.isGpuRack ? (
        <NcpRackTab {...props} />
      ) : (
        <ValidationServiceRackTab {...props} />
      )}
    </div>
  );
};

export default Rack;