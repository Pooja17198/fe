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
import { useEffect, useRef, useState } from "preact/hooks";
import {
  useConnections,
  useListGPURacks,
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
import { ValidationErrorsTab } from "./ValidationErrorsTab";
import { PhysicalCutsheetPanel } from "./PhysicalCutsheetPanel";

// export const UseMockData = window.location.host.includes("localhost")
//   ? true
//   : false; // toggle this to switch between mock and real API data
export const UseMockData = false;

export const GraphView = () => {
  const [selectedRoom, setSelectedRoom] = useState<DataCenterRoom | null>(null);
  const [materialPanelOpen, setMaterialPanelOpen] = useState<boolean>(false);
  // const [highlights, setHighlights] = useState<HighlightsInfo>({
  //   items: {},
  // });
  const [physicalCutsheetsPanelOpen, setPhysicalCutsheetsPanelOpen] =
    useState<boolean>(false);
  const [selectedCutsheetRack, setSelectedCutsheetRack] = useState<
    string | null
  >(null);
  const [hoverRackId, setHoverRackId] = useState<string | null>(null);

  const [selectedRackToRack, setSelectedRackToRack] = useState<{
    sourceRack: string;
    destinationRack: string;
    showRackToRackImageView?: boolean;
  } | null>(null);

  const [filteredGpuRacks, setFilteredGpuRacks] = useState<string[] | null>(
    null,
  );

  const {
    data: connections,
    isFetching: connectionsLoading,
    refetch: refetchConnections,
    error: connectionsError,
  } = useConnections(UseMockData);
  const {
    data: materials,
    isFetching: materialsLoading,
    refetch: refetchMaterials,
    error: materialsError,
  } = useListMaterial(UseMockData);
  const {
    data: roomLayout,
    isFetching: roomLayoutLoading,
    refetch: refetchRoomLayout,
    error: roomLayoutError,
    isPending: roomLayoutIsPending,
  } = useRoomLayout(UseMockData);
  const {
    data: rackToRackConnections,
    isFetching: rackToRackConnectionsLoading,
    refetch: refetchRackToRackConnections,
    error: rackToRackConnectionsError,
  } = useRackToRackConnections(UseMockData);

  const {
    data: artifacts,
    isFetching: artifactsLoading,
    refetch: refetchArtifacts,
    error: artifactsError,
  } = useBuildartifacts(UseMockData);

  const {
    data: gpuRacks,
    refetch: refetchGPURacks,
    isFetching: gpuRacksLoading,
    error: gpuRacksError,
  } = useListGPURacks(UseMockData);

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
    if (gpuRacksError) {
      errors.push("Failed to load GPU racks");
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
  const lastFetchedRoomforLayoutRef = useRef<string | null>(null);

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
    const roomName = selectedRoom?.roomName || null;

    // Only react when roomName actually changes
    if (roomName && roomName !== lastFetchedRoomforLayoutRef.current) {
      // Only do the big refetch if we are *not* on the validation tab and remember this room as the latest one we fetched for
      lastFetchedRoomforLayoutRef.current = roomName;
      refetchRoomLayout(roomName);
      refetchConnections(roomName);
      refetchMaterials(roomName);
      refetchArtifacts(roomName);
      refetchGPURacks(roomName);
      setSelectedRackToRack(null);
      setSelectedCutsheetRack(null);
      setHoverRackId(null);
      // Always clear rack selection when the room changes
      setClearRackSelection((prev) => !prev);
      setFilteredGpuRacks(null);
      setPhysicalCutsheetsPanelOpen(false);
    }
  }, [selectedRoom?.roomName, activeTab]);

  // useEffect(() => {
  //   if (!roomPhysicalCutsheets) {
  //     setRoomPhysicalCutsheets(physicalCutsheets?.items);
  //   }
  // }, [physicalCutsheets]);

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
    const value = event.detail.value;
    setActiveTab(value || "layout");
    if (value !== "layout") {
      setMaterialPanelOpen(false);
      setPhysicalCutsheetsPanelOpen(false);
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
        roomName={selectedRoom?.roomName}
        gpuRacks={gpuRacks}
        connections={connections?.items}
        // highlights={highlights}
        // setHighlights={setHighlights}
        setRackToRack={setSelectedRackToRack}
        clearRackSelection={clearRackSelection}
        disableSrcRackSelect={
          (gpuRacks?.length === 0 && connections?.items.length === 0) ||
          activeTab === "artifacts"
        }
        onRackListChange={(rackList) => {
          // rackList: gpu racks that are in the selected group (or all if cleared)
          // keep this in state so PathGraph can use the same filtered list
          if (rackList.length > 0) {
            setMaterialPanelOpen(false);
            setPhysicalCutsheetsPanelOpen(true);
            if (rackList.length === 1) {
              setSelectedCutsheetRack(rackList[0]);
              setHoverRackId(rackList[0]);
            }
          }
          setFilteredGpuRacks(rackList);
        }}
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
      <oj-c-drawer-layout
        endDisplay="reflow"
        end-opened={materialPanelOpen || physicalCutsheetsPanelOpen}
      >
        {activeTab === "layout" ? (
          <div class="svg-container">
            {selectedRackToRack &&
            selectedRackToRack.showRackToRackImageView ? (
              selectedRoom?.roomName &&
              rackToRackConnections &&
              rackToRackConnections.image &&
              !rackToRackConnectionsError ? (
                <img
                  src={`data:image/png;base64,${rackToRackConnections.image}`}
                  alt={"Room Design"}
                  className="svg-container-img"
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
              <PathGraph
                room={roomLayout}
                racksWithPhysicalCutsheet={filteredGpuRacks || gpuRacks || []}
                onRackClick={(rackId: string, hasCutsheet: boolean) => {
                  if (hasCutsheet) {
                    setSelectedCutsheetRack(rackId);
                  }
                  setMaterialPanelOpen(false);
                  setPhysicalCutsheetsPanelOpen(true);
                }}
                hoverRackId={hoverRackId}
              />
            )}
            {/* <PathGraph room={roomLayout} highlights={highlights} /> */}
            {!roomLayoutIsPending && !!roomLayout && (
              <div class="control-buttons">
                {selectedRackToRack && (
                  <oj-button
                    class="oj-md-padding-2x-horizontal"
                    onojAction={() => {
                      setSelectedRackToRack((prev) => ({
                        ...(prev as any),
                        showRackToRackImageView: !prev?.showRackToRackImageView,
                      }));
                    }}
                  >
                    {selectedRackToRack?.showRackToRackImageView
                      ? "Show Layout View"
                      : "Show Path Image View"}
                  </oj-button>
                )}
                <oj-button
                  class="oj-md-padding-2x-horizontal"
                  onojAction={(value) => {
                    value.preventDefault();
                    setClearRackSelection(!clearRackSelection);
                    setMaterialPanelOpen(false);
                    setPhysicalCutsheetsPanelOpen(false);
                    setSelectedCutsheetRack(null);
                    setHoverRackId(null);
                    setFilteredGpuRacks(null);
                  }}
                >
                  Clear Rack Selection
                </oj-button>
                <oj-button
                  class="oj-md-padding-2x-horizontal"
                  onojAction={() => {
                    setMaterialPanelOpen(!materialPanelOpen);
                    setPhysicalCutsheetsPanelOpen(false);
                  }}
                >
                  {`${materialPanelOpen ? "Hide" : "View"} Materials (${materialsLoading || rackToRackConnectionsLoading ? "..." : materialShown?.length || 0} items)`}
                </oj-button>
                <oj-button
                  onojAction={() => {
                    setMaterialPanelOpen(false);
                    setPhysicalCutsheetsPanelOpen(!physicalCutsheetsPanelOpen);
                  }}
                >
                  {`${physicalCutsheetsPanelOpen ? "Hide" : "View"} GPU Connections (${
                    gpuRacksLoading || !selectedRoom?.roomName
                      ? "..."
                      : filteredGpuRacks?.length || gpuRacks?.length || 0
                  } racks)`}
                </oj-button>
              </div>
            )}
          </div>
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
        <div slot="end" className={activeTab ? "isMax" : ""}>
          {materialPanelOpen ? (
            <MaterialPanel
              materials={materialShown}
              loading={materialsLoading || !selectedRoom?.roomName}
            />
          ) : (
            <PhysicalCutsheetPanel
              gpuRacks={filteredGpuRacks || gpuRacks || []}
              roomName={selectedRoom?.roomName}
              initialSelectedRack={selectedCutsheetRack}
              onRackHover={setHoverRackId}
              disableBackButton={activeTab !== "validation"}
            />
          )}
        </div>
      </oj-c-drawer-layout>
      <oj-c-dialog
        opened={
          roomLayoutLoading ||
          connectionsLoading ||
          materialsLoading ||
          rackToRackConnectionsLoading ||
          artifactsLoading ||
          gpuRacksLoading
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
