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
import { DataCenterRoom, RackFilters } from "../types";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  useConnections,
  useListGPURacks,
  useListMaterial,
  usePlatformListByRoom,
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
import { PhysicalCutsheetPanel } from "./PhysicalCutsheetPanel";
import { MoreFiltersDrawer } from "./MoreFiltersDrawer";
import { PhysicalConnectionCollection } from "gen/clients/ide-lvv-client";

// export const UseMockData = window.location.host.includes("localhost")
//   ? true
//   : false; // toggle this to switch between mock and real API data
export const UseMockData = false;

const getMoreFiltersButtonLabel = (rackFilters: RackFilters): string => {
  const selectedFilters: string[] = [];

  if (rackFilters.platformName) {
    selectedFilters.push(`platform: ${rackFilters.platformName}`);
  }

  if (rackFilters.blockName) {
    selectedFilters.push(`block: ${rackFilters.blockName}`);
  }

  if (rackFilters.deploymentGroup) {
    selectedFilters.push(`group: ${rackFilters.deploymentGroup}`);
  }
  if (rackFilters.showOhrRacks) {
    selectedFilters.push("ohr: on");
  }

  return selectedFilters.length > 0
    ? `filters: ${selectedFilters.join(", ")}`
    : "More filters";
};

type GraphViewProps = {
  onSelectedSiteNameChanged?: (siteName: string) => void;
};

export const GraphView = ({ onSelectedSiteNameChanged }: GraphViewProps) => {
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
    destinationRack: string | null;
    showRackToRackImageView?: boolean;
    sourceOnly?: boolean;
  } | null>(null);

  const [filteredGpuRacks, setFilteredGpuRacks] = useState<string[] | null>(
    null,
  );
  const [MoreFiltersOpen, setMoreFiltersOpen] = useState<boolean>(false);
  const [rackFilters, setRackFilters] = useState<RackFilters>({
    platformName: null,
    blockName: null,
    deploymentGroup: null,
    showOhrRacks: false,
  });
  const [roomWideConnectionsByRoom, setRoomWideConnectionsByRoom] = useState<
    Record<string, PhysicalConnectionCollection>
  >({});

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
  const {
    data: roomPlatforms,
    refetch: refetchRoomPlatforms,
    isFetching: roomPlatformsLoading,
    error: roomPlatformsError,
  } = usePlatformListByRoom(UseMockData);

  const [errors, setErrors] = useState<any[]>([]);

  useEffect(() => {
    onSelectedSiteNameChanged?.(selectedRoom?.roomName || "");
  }, [onSelectedSiteNameChanged, selectedRoom?.roomName]);

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
    if (roomPlatformsError) {
      errors.push("Failed to load room platform metadata");
    }
    setErrors(errors);
  }, [
    roomLayoutError,
    connectionsError,
    materialsError,
    rackToRackConnectionsError,
    artifactsError,
    roomPlatformsError,
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
  const isSourceOnlySelection = !!selectedRackToRack?.sourceOnly;
  const [clearRackSelection, setClearRackSelection] = useState<boolean>(false);
  const activeConnections = selectedRoom?.roomName && !rackFilters.blockName
    ? roomWideConnectionsByRoom[selectedRoom.roomName] || connections
    : connections;
  const activeConnectionItems = activeConnections?.items || [];

  useEffect(() => {
    if (!selectedRoom?.roomName || !connections?.items || rackFilters.blockName) {
      return;
    }

    setRoomWideConnectionsByRoom((prev) => {
      const roomName = selectedRoom.roomName;
      if (prev[roomName] === connections) {
        return prev;
      }

      return {
        ...prev,
        [roomName]: connections,
      };
    });
  }, [selectedRoom?.roomName, connections]);

  const sourceRackMaterials = useMemo(() => {
    const sourceRack = selectedRackToRack?.sourceRack;
    if (!isSourceOnlySelection || !sourceRack) {
      return [];
    }

    const sourceRackBomIds = new Set<number>(
      activeConnectionItems
        .filter(
          (connection) =>
            connection.sourceRackNumber === sourceRack &&
            connection.bomId !== undefined,
        )
        .map((connection) => connection.bomId as number),
    );

    if (sourceRackBomIds.size === 0) {
      return [];
    }

    return (materials?.items || []).filter(
      (material) =>
        material.bomId !== undefined && sourceRackBomIds.has(material.bomId),
    );
  }, [
    isSourceOnlySelection,
    selectedRackToRack?.sourceRack,
    activeConnectionItems,
    materials?.items,
  ]);

  const blockFilteredMaterials = useMemo(() => {
    if (!rackFilters.blockName) {
      return [];
    }

    const racksInBlock = new Set<string>(
      (roomPlatforms || [])
        .filter((roomPlatform) => roomPlatform.blockName === rackFilters.blockName)
        .map((roomPlatform) => roomPlatform.rackNumber?.trim())
        .filter((rackNumber): rackNumber is string => !!rackNumber),
    );

    if (racksInBlock.size === 0) {
      return [];
    }

    return connections.materials || [];
  }, [
    rackFilters.blockName,
    roomPlatforms,
    activeConnectionItems,
    connections
  ]);

  const materialShown = !selectedRoom?.roomName
    ? []
    : isSourceOnlySelection
      ? sourceRackMaterials
      : rackFilters.blockName
        ? blockFilteredMaterials
        :
      selectedRackToRack
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
      refetchRoomPlatforms(roomName);
      setSelectedRackToRack(null);
      setSelectedCutsheetRack(null);
      setHoverRackId(null);
      // Always clear rack selection when the room changes
      setClearRackSelection((prev) => !prev);
      setFilteredGpuRacks(null);
      setMaterialPanelOpen(false);
      setPhysicalCutsheetsPanelOpen(false);
      setRackFilters({
        platformName: null,
        blockName: null,
        deploymentGroup: null,
        showOhrRacks: false,
      });
      setMoreFiltersOpen(false);
    }
  }, [selectedRoom?.roomName, activeTab]);

  useEffect(() => {
    if (selectedRoom?.roomName) {
      if (rackFilters.blockName) {
        refetchConnections(selectedRoom.roomName, rackFilters.blockName);
      }
    }
  }, [rackFilters.blockName]);

  useEffect(() => {
    if (
      selectedRoom?.roomName &&
      selectedRackToRack &&
      !selectedRackToRack.sourceOnly &&
      selectedRackToRack.destinationRack
    ) {
      refetchRackToRackConnections(
        selectedRoom?.roomName,
        selectedRackToRack.sourceRack,
        selectedRackToRack.destinationRack,
      );
    }
  }, [selectedRackToRack]);

  useEffect(() => {
    if (selectedRoom?.roomName && selectedRackToRack?.sourceOnly) {
      refetchMaterials(selectedRoom.roomName);
    }
  }, [
    selectedRoom?.roomName,
    selectedRackToRack?.sourceOnly,
    selectedRackToRack?.sourceRack,
  ]);

  const tabItemTemplate = (item: ojTabBar.ItemContext<Tab["path"], Tab>) => (
    <li>
      <a href="#" className="layout-material-tab-label">
        <div className={"oj-sm-padding-1x"}>{item.data.label}</div>
        {item.data.path === "materials" && (
          <div>{`(${materialsLoading || rackToRackConnectionsLoading ? "..." : materialShown?.length || 0})`}</div>
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
  const hasRackFilters = !!(
    rackFilters.platformName ||
    rackFilters.blockName ||
    rackFilters.deploymentGroup ||
    rackFilters.showOhrRacks
  );

  const resetPathSelectorsAndHideSidePanels = (doNotChangeFilters?: boolean) => {
    setClearRackSelection((prev) => !prev);
    setSelectedRackToRack(null);
    setSelectedCutsheetRack(null);
    setHoverRackId(null);
    setFilteredGpuRacks(null);
    setMaterialPanelOpen(false);
    setPhysicalCutsheetsPanelOpen(false);
    if(!doNotChangeFilters) {
    setRackFilters({
      platformName: null,
      blockName: null,
      deploymentGroup: null,
      showOhrRacks: false,
    });
    }
  };

  const materialPanelContext = (() => {
    const roomName = selectedRoom?.roomName;
    const baseDimensions = roomName ? { roomName } : {};
    const getRackBlockName = (rackNumber: string | null | undefined) =>
      roomPlatforms?.find(
        (roomPlatform) => roomPlatform.rackNumber?.trim() === rackNumber,
      )?.blockName;

    if (isSourceOnlySelection && selectedRackToRack?.sourceRack) {
      const blockName = getRackBlockName(selectedRackToRack.sourceRack);
      return {
        headerText: `Rack ${selectedRackToRack.sourceRack}`,
        metricDimensions: {
          ...baseDimensions,
          sourceRackNumber: selectedRackToRack.sourceRack,
          ...(blockName ? { blockName } : {}),
        },
      };
    }

    if (rackFilters.blockName) {
      return {
        headerText: `Block ${rackFilters.blockName}`,
        metricDimensions: {
          ...baseDimensions,
          blockName: rackFilters.blockName,
        },
      };
    }

    if (
      rackToRackConnections?.materials &&
      selectedRackToRack?.destinationRack
    ) {
      const blockName = getRackBlockName(selectedRackToRack.sourceRack);
      return {
        headerText: `Rack ${selectedRackToRack.sourceRack} to Rack ${selectedRackToRack.destinationRack}`,
        metricDimensions: {
          ...baseDimensions,
          sourceRackNumber: selectedRackToRack.sourceRack,
          destinationRackNumber: selectedRackToRack.destinationRack,
          ...(blockName ? { blockName } : {}),
        },
      };
    }

    if (selectedCutsheetRack) {
      const blockName = getRackBlockName(selectedCutsheetRack);
      return {
        headerText: `Rack ${selectedCutsheetRack}`,
        metricDimensions: {
          ...baseDimensions,
          rackNumber: selectedCutsheetRack,
          ...(blockName ? { blockName } : {}),
        },
      };
    }

    return {
      headerText: `Room ${roomName}`,
      metricDimensions: baseDimensions,
    };
  })();

  return (
    <div class="oj-web-applayout-max-width oj-web-applayout-content lvv-route-content lvv-cabling-content">
      <div className="cabling-selectors-row">
        <div className="cabling-selectors-column cabling-selectors-column--left">
          <RegionADSiteSelectors
            selectedRoom={selectedRoom?.roomName}
            setSelectedRoom={setSelectedRoom}
            onLocationSelectorsChange={resetPathSelectorsAndHideSidePanels}
          />
        </div>
        <div className="cabling-selectors-column cabling-selectors-column--right">
          <PathSelectors
            roomName={selectedRoom?.roomName}
            room={roomLayout}
            gpuRacks={gpuRacks}
            connections={activeConnectionItems}
            roomPlatforms={roomPlatforms}
            rackFilters={rackFilters}
            onAutoEnableShowOhr={() => {
              setRackFilters((prev) =>
                prev.showOhrRacks ? prev : { ...prev, showOhrRacks: true },
              );
            }}
            // highlights={highlights}
            // setHighlights={setHighlights}
            setRackToRack={setSelectedRackToRack}
            clearRackSelection={clearRackSelection}
            disableSrcRackSelect={
              (gpuRacks?.length === 0 && activeConnectionItems.length === 0) ||
              !selectedRoom?.roomName ||
              activeTab === "artifacts"
            }
            onRackListChange={(rackList) => {
              // rackList: gpu racks that are in the selected group (or all if cleared)
              // keep this in state so PathGraph can use the same filtered list

              const onlyGPURacks = rackList.filter((rack: string) =>
                gpuRacks.includes(rack),
              );
              if (onlyGPURacks.length > 0) {
                if (onlyGPURacks.length === 1) {
                  setSelectedCutsheetRack(onlyGPURacks[0]);
                  setHoverRackId(onlyGPURacks[0]);
                } else {
                  setSelectedCutsheetRack(null);
                  setHoverRackId(null);
                }
                setMaterialPanelOpen(false);
                setPhysicalCutsheetsPanelOpen(true);
              } else {
                setPhysicalCutsheetsPanelOpen(false);
              }
              setFilteredGpuRacks(onlyGPURacks);
            }}
          />
          <div className="cabling-selectors-actions">
            <oj-c-button
              chroming="ghost"
              label={getMoreFiltersButtonLabel(rackFilters)}
              size="xs"
              class={
                hasRackFilters
                  ? "extra-filters-trigger-button--active"
                  : "extra-filters-trigger-button"
              }
              onojAction={() => setMoreFiltersOpen((prev) => !prev)}
              disabled={!selectedRoom?.roomName || roomPlatformsLoading}
            >
              <span slot="startIcon" class="oj-ux-ico-filter"></span>
            </oj-c-button>
            <oj-c-button
              chroming="ghost"
              label="Clear"
              size="xs"
              class="extra-filters-trigger-button"
              onojAction={() => resetPathSelectorsAndHideSidePanels()}
            >
              <span slot="startIcon" class=" oj-ux-ico-close"></span>
            </oj-c-button>
          </div>
        </div>
      </div>
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
        startDisplay="overlay"
        start-opened={MoreFiltersOpen}
        onstartOpenedChanged={(event) =>
          setMoreFiltersOpen(event.detail.value ?? false)
        }
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
                gpuRacks={filteredGpuRacks || gpuRacks || []}
                roomPlatforms={roomPlatforms}
                rackFilters={rackFilters}
                onRackClick={(rackId: string, isGpuRack: boolean) => {
                  if (isGpuRack) {
                    setSelectedCutsheetRack(rackId);
                  }
                  setMaterialPanelOpen(false);
                  setPhysicalCutsheetsPanelOpen(true);
                }}
                hoverRackId={selectedRackToRack ? selectedRackToRack.sourceRack : hoverRackId}
                showOhrRacks={rackFilters.showOhrRacks}
              />
            )}
            {/* <PathGraph room={roomLayout} highlights={highlights} /> */}
            {!roomLayoutIsPending && !!roomLayout && (
              <div class="control-buttons">
                {selectedRackToRack && !selectedRackToRack.sourceOnly && (
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
                  onojAction={() => {
                    setMaterialPanelOpen(!materialPanelOpen);
                    setPhysicalCutsheetsPanelOpen(false);
                  }}
                >
                  {`${materialPanelOpen ? "Hide" : "View"} Materials (${materialsLoading || rackToRackConnectionsLoading ? "..." : materialShown?.length || 0} items)`}
                </oj-button>
                 <oj-button
                  hidden={(selectedRackToRack && !gpuRacks.includes(selectedRackToRack.sourceRack)) as boolean}
                  onojAction={() => {
                    setMaterialPanelOpen(false);
                    setPhysicalCutsheetsPanelOpen(!physicalCutsheetsPanelOpen);
                  }}
                >
                  {`${physicalCutsheetsPanelOpen ? "Hide" : "View"} GPU panels (${
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
              headerText={materialPanelContext.headerText}
              metricDimensions={materialPanelContext.metricDimensions}
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
              headerText={materialPanelContext.headerText}
              metricDimensions={materialPanelContext.metricDimensions}
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
        <div slot="start">
          <MoreFiltersDrawer
            opened={MoreFiltersOpen}
            roomName={selectedRoom?.roomName}
            roomPlatforms={roomPlatforms}
            loading={roomPlatformsLoading}
            filterValue={rackFilters}
            onApplyFilters={(value) => {
              resetPathSelectorsAndHideSidePanels(true);
              setRackFilters(value);
              setMoreFiltersOpen(false);
            }}
            onClose={() => setMoreFiltersOpen(false)}
          />
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
