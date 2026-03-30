/**
 * @license
 * Copyright (c) 2014, 2025, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import "oj-c/select-single";
import PathGraph from "./PathGraph/PathGraph";
import RegionADSiteSelectors from "./RegionADSiteSelectors";
import { DataCenterRoom } from "../types";
import { useEffect, useState } from "preact/hooks";
import {
  useConnections,
  useListMaterial,
  useRackToRackConnections,
  useRoomLayout,
} from "../api/hooks/materialApi";
import { HighlightsInfo } from "./PathGraph/types";
import "oj-c/drawer-layout";
import { MaterialPanel } from "./MaterialPanel";
import "oj-c/dialog";
import "oj-c/progress-circle";
import { PathSelectors } from "./PathGraph/PathSelectors";
import "./style.scss";
import { ojTabBar } from "ojs/ojnavigationlist";
import MutableArrayDataProvider from "ojs/ojmutablearraydataprovider";
import "oj-c/button";
import { ArtifactPanel } from "./ArtifactPanel";
import { useBuildartifacts } from "../api/hooks/artifactsApi";
import ToastMessage from "./ToastMessage";

export const GraphView = () => {
  const [selectedRoom, setSelectedRoom] = useState<DataCenterRoom | null>(null);
  const [materialPanelOpen, setMaterialPanelOpen] = useState<boolean>(false);
  // const [highlights, setHighlights] = useState<HighlightsInfo>({
  //   items: {},
  // });
  const [selectedRackToRack, setSelectedRackToRack] = useState<{
    sourceRack: string;
    destinationRack: string;
  } | null>(null);

  const {
    data: connections,
    isFetching: connectionsLoading,
    refetch: refetchConnections,
    error: connectionsError,
    // } = useConnections(true);
  } = useConnections();
  const {
    data: materials,
    isFetching: materialsLoading,
    refetch: refetchMaterials,
    error: materialsError,
    // } = useListMaterial(true);
  } = useListMaterial();
  const {
    data: roomLayout,
    isFetching: roomLayoutLoading,
    refetch: refetchRoomLayout,
    error: roomLayoutError,
    isPending: roomLayoutIsPending,
    // } = useRoomLayout(true);
  } = useRoomLayout();
  const {
    data: rackToRackConnections,
    isFetching: rackToRackConnectionsLoading,
    refetch: refetchRackToRackConnections,
    error: rackToRackConnectionsError,
    // } = useRackToRackConnections(true);
  } = useRackToRackConnections();
  const {
    data: artifacts,
    isFetching: artifactsLoading,
    refetch: refetchArtifacts,
    error: artifactsError,
    // } = useBuildartifacts(true);
  } = useBuildartifacts();

  const [errors, setErrors] = useState<any[]>([]);

  useEffect(() => {
    const errors = [];
    if (roomLayoutError) {
      errors.push("Failed to load room layout");
    }
    if (connectionsError) {
      errors.push("Failed to load connections");
    }
    if (materialsError) {
      errors.push("Failed to load materials");
    }
    if (rackToRackConnectionsError) {
      errors.push("Failed to load rack-to-rack connections");
    }
    if (artifactsError) {
      errors.push("Failed to load artifacts");
    }
    setErrors(errors);
  }, [
    roomLayoutError,
    connectionsError,
    materialsError,
    rackToRackConnectionsError,
    artifactsError,
  ]);
  type Tab = {
    path: string;
    label: string;
  };

  const tabs: Tab[] = [
    { path: "layout", label: "Layout" },
    { path: "materials", label: "Materials" },
    { path: "artifacts", label: "Artifacts" },
  ];
  const [activeTab, setActiveTab] = useState<string>(tabs[0].path);

  const materialShown = !selectedRoom?.roomName
    ? []
    : selectedRackToRack
      ? rackToRackConnectionsError
        ? []
        : rackToRackConnections?.materials
      : materialsError
        ? []
        : materials?.items;

  useEffect(() => {
    if (selectedRoom?.roomName) {
      refetchRoomLayout(selectedRoom?.roomName);
      refetchConnections(selectedRoom?.roomName);
      refetchMaterials(selectedRoom?.roomName);
      refetchArtifacts(selectedRoom?.roomName);
      setSelectedRackToRack(null);
    }
    setClearRackSelection((prev) => !prev); // trigger clearing rack selection in PathSelectors
  }, [selectedRoom?.roomName]);

  useEffect(() => {
    if (selectedRoom?.roomName && selectedRackToRack) {
      refetchRackToRackConnections(
        selectedRoom?.roomName,
        selectedRackToRack.sourceRack,
        selectedRackToRack.destinationRack,
      );
    }
  }, [selectedRackToRack]);

  const tabItemTemplate = (item: ojTabBar.ItemContext<Tab["path"], Tab>) => (
    <li>
      <a href="#" className="layout-material-tab-label">
        <div className={"oj-sm-padding-1x"}>{item.data.label}</div>
        {item.data.path === "materials" && (
          <div>{`(${materialsLoading || rackToRackConnectionsLoading ? "..." : materialShown?.length || 0})`}</div>
          // <oj-c-button id="icon_button1" display="icons" label="Icon Button" chroming="borderless" disabled={activeTab !== "materials"}>
          //   <span slot="startIcon" class="oj-ux-ico-acl-export"></span>
          // </oj-c-button>
        )}
        {item.data.path === "artifacts" && (
          <oj-c-button
            id="icon_button1"
            display="icons"
            label="Icon Button"
            chroming="borderless"
            disabled={activeTab !== "artifacts"}
          >
            <span slot="startIcon" class="oj-ux-ico-file"></span>
          </oj-c-button>
        )}
      </a>
    </li>
  );

  const loadTabContent = (
    event: ojTabBar.selectionChanged<Tab["path"], Tab>,
  ) => {
    if (event.detail.value === "layout") {
      setActiveTab(tabs[0].path);
    } else if (event.detail.value === "materials") {
      setActiveTab(tabs[1].path);
    } else {
      setActiveTab(tabs[2].path);
    }
  };

  const tabbarDP = new MutableArrayDataProvider<Tab["path"], Tab>(
    tabs.slice(0),
    { keyAttributes: "path" },
  );

  const [clearRackSelection, setClearRackSelection] = useState<boolean>(false);
  return (
    <div class="oj-web-applayout-max-width oj-web-applayout-content">
      <RegionADSiteSelectors
        selectedRoom={selectedRoom?.roomName}
        setSelectedRoom={setSelectedRoom}
      />
      <PathSelectors
        connections={connections?.items}
        // highlights={highlights}
        // setHighlights={setHighlights}
        setRackToRack={setSelectedRackToRack}
        clearRackSelection={clearRackSelection}
        disableSrcRackSelect={
          connections?.items.length === 0 || activeTab === "artifacts"
        }
      />
      <div className="layout-material-tab-bar">
        <oj-tab-bar
          class="oj-sm-margin-8x-end "
          edge="top"
          data={tabbarDP}
          selection={activeTab}
          onselectionChanged={loadTabContent}
        >
          <template slot="itemTemplate" render={tabItemTemplate}></template>
        </oj-tab-bar>
      </div>

      {activeTab === "layout" ? (
        <oj-c-drawer-layout endDisplay="reflow" end-opened={materialPanelOpen}>
          <div class="svg-container">
            {selectedRackToRack ? (
              selectedRoom?.roomName &&
              rackToRackConnections &&
              rackToRackConnections.image &&
              !rackToRackConnectionsError ? (
                <img
                  src={`data:image/png;base64,${rackToRackConnections.image}`}
                  alt={"Room Design"}
                  style={{ width: "100%", height: "auto" }}
                />
              ) : (
                <p className="oj-helper-text-align-center">
                  Image not available
                </p>
              )
            ) : !selectedRoom?.roomName || roomLayoutIsPending ? (
              <p className="oj-helper-text-align-center">
                Select a room above to view layout
              </p>
            ) : roomLayoutError || (!roomLayout && !roomLayoutLoading) ? (
              <p className="oj-helper-text-align-center">
                Room layout not available
              </p>
            ) : (
              <PathGraph room={roomLayout} />
            )}
            {/* <PathGraph room={roomLayout} highlights={highlights} /> */}
            {!roomLayoutIsPending && !!roomLayout && (
              <div class="control-buttons">
                <oj-button
                  class="oj-md-padding-5x-horizontal"
                  onojAction={(value) => {
                    value.preventDefault();
                    setClearRackSelection(!clearRackSelection);
                    setMaterialPanelOpen(false);
                  }}
                >
                  Clear Rack Selection
                </oj-button>
                <oj-button
                  onojAction={() => {
                    setMaterialPanelOpen(!materialPanelOpen);
                  }}
                >
                  {`${materialPanelOpen ? "Hide" : "View"} Materials (${materialsLoading || rackToRackConnectionsLoading ? "..." : materialShown?.length || 0} items)`}
                </oj-button>
              </div>
            )}
          </div>
          <div slot="end" className={activeTab ? "isMax" : ""}>
            <MaterialPanel
              materials={materialShown}
              loading={materialsLoading || !selectedRoom?.roomName}
            />
          </div>
        </oj-c-drawer-layout>
      ) : activeTab === "materials" ? (
        <div className="material-tab">
          <MaterialPanel
            materials={materialShown}
            loading={materialsLoading || !selectedRoom?.roomName}
          />
        </div>
      ) : (
        <div className="artifact-tab">
          <ArtifactPanel
            artifacts={artifacts?.items}
            roomName={selectedRoom?.roomName}
            loading={!selectedRoom?.roomName || artifactsLoading}
          />
        </div>
      )}
      <oj-c-dialog
        opened={
          roomLayoutLoading ||
          connectionsLoading ||
          materialsLoading ||
          rackToRackConnectionsLoading ||
          artifactsLoading
        }
        id="modalDialogLoading"
        aria-describedby="desc"
      >
        <div slot="body" class="oj-helper-text-align-center">
          <oj-c-progress-circle
            aria-labelledby="lgLabel indetLabel"
            size="lg"
            value={-1}
          ></oj-c-progress-circle>
          <h4 class="oj-md-padding-5x-vertical">
            {activeTab === "artifacts"
              ? "Loading artifacts..."
              : "Loading connections and materials..."}
          </h4>
        </div>
      </oj-c-dialog>
      <ToastMessage
        messageList={errors.map((error) => ({
          summary: error,
          detail: "",
          severity: "error",
        }))}
        position="top"
        onClose={() => setErrors([])}
      ></ToastMessage>
    </div>
  );
};
