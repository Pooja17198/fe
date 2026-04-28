import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import "ojs/ojnavigationlist";
import { ojTabBar } from "ojs/ojnavigationlist";
import { RackProps } from "./types";
import NcpRackTab from "./NcpRackTab";
import ValidationServiceRackTab from "./ValidationServiceRackTab";
import { useBuildingBadLinks } from "../network-monitoring/useBuildingBadLinks";
import { BadLinksBanner } from "../network-monitoring/BadLinksBanner";
import { ENABLE_NETWORK_MONITORING } from "../../config/featureFlags";

type Tab = {
  path: "ncp" | "validationService";
  label: string;
};

const MASTER_TABS: Tab[] = [
  { path: "ncp", label: "On-demand" },
  { path: "validationService", label: "Streaming" },
];

const Rack = (props: RackProps) => {
  const isFirstRender = useRef(true);
  const isMasterUser = props.userType === "master";
  const [activeTab, setActiveTab] = useState<Tab["path"]>("ncp");

  const networkMonitoringEnabled = ENABLE_NETWORK_MONITORING;
  const badLinks = useBuildingBadLinks(props.building, props.region, networkMonitoringEnabled);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    props.onPageChanged({ path: "home" });
  }, [props.region]);

  useEffect(() => {
    if (!isMasterUser && activeTab !== "ncp") {
      setActiveTab("ncp");
    }
  }, [isMasterUser, activeTab]);

  const tabbarDP = useMemo(
    () => new MutableArrayDataProvider<Tab["path"], Tab>(MASTER_TABS.slice(0), { keyAttributes: "path" }),
    []
  );

  const tabItemTemplate = (item: ojTabBar.ItemContext<Tab["path"], Tab>) => (
    <li>
      <a href="#">{item.data.label}</a>
    </li>
  );

  const loadTabContent = (event: ojTabBar.selectionChanged<Tab["path"], Tab>) => {
    setActiveTab(event.detail.value);
  };

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

      {isMasterUser && (
        <div className="rack-tabbar-wrap">
          <oj-tab-bar
            class="rack-tabbar"
            edge="top"
            data={tabbarDP}
            selection={activeTab}
            onselectionChanged={loadTabContent}
          >
            <template slot="itemTemplate" render={tabItemTemplate}></template>
          </oj-tab-bar>
        </div>
      )}

      {activeTab === "validationService" && isMasterUser ? (
        <ValidationServiceRackTab {...props} />
      ) : (
        <NcpRackTab {...props} />
      )}
    </div>
  );
};

export default Rack;
