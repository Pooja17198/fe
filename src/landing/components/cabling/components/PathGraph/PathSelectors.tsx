/**
 * @license
 * Copyright (c) 2014, 2025, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import "oj-c/select-single";
import {
  Dispatch,
  StateUpdater,
  useEffect,
  useMemo,
  useState,
} from "preact/hooks";
import { FlattenedConnection, HighlightsInfo } from "./types";
import { flattenConnections } from "./GraphUtil";
import ArrayDataProvider from "ojs/ojarraydataprovider";
import {
  PhysicalConnectionSummary,
  RoomLayout,
  RoomPlatform,
} from "../../../../../../gen/clients/ide-lvv-client";
import mapping from "../../api/mockAPI/deployment-groups.json";
import { RackFilters } from "../../types";
interface Option {
  label: string;
  value: string;
}

interface PathSelectorsProps {
  roomName?: string | null; // NEW
  room?: RoomLayout;
  gpuRacks: string[];
  connections: PhysicalConnectionSummary[] | undefined;
  roomPlatforms: RoomPlatform[] | undefined;
  rackFilters: RackFilters;
  onAutoEnableShowOhr?: () => void;
  //   highlights: HighlightsInfo;
  //   setHighlights: Dispatch<StateUpdater<HighlightsInfo>>;
  setRackToRack: Dispatch<
    StateUpdater<{
      sourceRack: string;
      destinationRack: string | null;
      showRackToRackImageView?: boolean;
      sourceOnly?: boolean;
    } | null>
  >;

  clearRackSelection: boolean;
  disableSrcRackSelect?: boolean;
  onRackListChange?: (racksInGroup: string[]) => void;
}

export const PathSelectors = ({
  roomName,
  room,
  gpuRacks,
  connections,
  roomPlatforms,
  rackFilters,
  onAutoEnableShowOhr,
  //   setHighlights,
  setRackToRack,
  clearRackSelection,
  disableSrcRackSelect,
  onRackListChange,
}: PathSelectorsProps) => {
  const [selected, setSelected] = useState<any>({
    srcRack: null,
    destRack: null,
  });
  const [srcRackMapping, setSrcRackMapping] = useState<
    Map<string, Set<string>>
  >(new Map());
  const normalizeRackId = (rackId: string | null | undefined) =>
    String(rackId || "").trim().toLowerCase();
  const ohrRackIdSet = useMemo(() => {
    const ohrRackIds = new Set<string>();

    (room?.layout?.room?.objects || []).forEach((item: any) => {
      const rackId = item?.label || item?.id;
      const rackType = String(item?.type || "").toLowerCase();
      if (!rackId || !rackType.includes("ohr")) {
        return;
      }
      ohrRackIds.add(normalizeRackId(rackId));
    });

    return ohrRackIds;
  }, [room]);
  const isOhrRackId = (rackId: string | null | undefined) =>
    ohrRackIdSet.has(normalizeRackId(rackId));

  useEffect(() => {
    setSelected({
      srcRack: null,
      destRack: null,
    });
    // setHighlights({ items: {} });
    setRackToRack(null);
  }, [clearRackSelection]);

  useEffect(() => {
    if (!roomName?.startsWith("aga5")) {
      return;
    }

    setRackToRack(null);
    setSelected((prev: any) => ({
      ...prev,
      srcRack: null,
      destRack: null,
    }));
  }, [roomName, rackFilters.deploymentGroup]);

  useEffect(() => {
    const srcRackMappingLocal: Map<string, Set<string>> = new Map();

    if (!connections || connections.length === 0) {
      // Even if there are no connections, we still want to show racks as selectable.
      gpuRacks?.forEach((rack) => {
        if (!srcRackMappingLocal.has(rack)) {
          srcRackMappingLocal.set(rack, new Set());
        }
      });

      setSrcRackMapping(srcRackMappingLocal);
      return;
    }

    connections.forEach((connection) => {
      const { sourceRackNumber, destinationRackNumber } = connection;
      if (!sourceRackNumber || !destinationRackNumber) return;

      if (!srcRackMappingLocal.has(sourceRackNumber)) {
        srcRackMappingLocal.set(sourceRackNumber, new Set());
      }
      srcRackMappingLocal.get(sourceRackNumber)!.add(destinationRackNumber);
    });

    // Ensure all GPU racks exist in the mapping (even if not in connections)
    gpuRacks?.forEach((rack) => {
      if (!srcRackMappingLocal.has(rack)) {
        srcRackMappingLocal.set(rack, new Set());
      }
    });

    setSrcRackMapping(srcRackMappingLocal);
  }, [connections, gpuRacks]);

  const filteredSrcRackValues = useMemo(() => {
    let candidateRacks = Array.from(srcRackMapping.keys());

    if (!roomName) return [];
    // If in aga5 and a specific group is chosen, filter by deployment group
    if (roomName?.startsWith("aga5") && rackFilters.deploymentGroup) {
      const group = mapping.groups.find(
        (g) => String(g.placementGroup) === rackFilters.deploymentGroup,
      );
      if (!group || !group.rackPositions || group.rackPositions.length === 0) {
        candidateRacks = [];
      } else {
        const allowedRacks = new Set(group.rackPositions);
        candidateRacks = candidateRacks.filter((r) => allowedRacks.has(r));
      }
    }

    if (rackFilters.platformName || rackFilters.blockName) {
      const roomPlatformByRack = new Map<
        string,
        { platformName: string | null; blockName: string | null }
      >();
      (roomPlatforms || []).forEach((roomPlatform) => {
        const rackNumber = roomPlatform.rackNumber?.trim();
        if (!rackNumber) {
          return;
        }
        roomPlatformByRack.set(rackNumber, {
          platformName: roomPlatform.platformName ?? null,
          blockName: roomPlatform.blockName ?? null,
        });
      });

      candidateRacks = candidateRacks.filter((rack) => {
        const rackPlatform = roomPlatformByRack.get(rack);
        if (!rackPlatform) {
          return false;
        }
        if (
          rackFilters.platformName &&
          rackPlatform.platformName !== rackFilters.platformName
        ) {
          return false;
        }
        if (
          rackFilters.blockName &&
          rackPlatform.blockName !== rackFilters.blockName
        ) {
          return false;
        }
        return true;
      });
    }

    return candidateRacks.sort();
  }, [
    roomName,
    rackFilters.deploymentGroup,
    srcRackMapping,
    roomPlatforms,
    rackFilters.platformName,
    rackFilters.blockName,
  ]);

  const filteredSrcOptions = useMemo(
    () =>
      filteredSrcRackValues.map((src) => {
        const destinations = Array.from(srcRackMapping.get(src) || []).sort();
        const label =
          destinations.length > 0
            ? `${src} - (${destinations.join(", ")})`
            : src;
        return {
          label,
          value: src,
        };
      }),
    [filteredSrcRackValues, srcRackMapping],
  );

  const destOptions = useMemo(() => {
    if (!selected.srcRack) {
      return [];
    }

    return Array.from(srcRackMapping.get(selected.srcRack) || new Set<string>())
      .sort()
      .map((dest) => ({
        label: dest,
        value: dest,
      }));
  }, [selected.srcRack, srcRackMapping]);

  useEffect(() => {
    if (!selected.srcRack && selected.destRack) {
      return;
    }

    const nextDestRack = destOptions.length > 0 ? destOptions[0].value : null;
    if (selected.destRack === nextDestRack) {
      return;
    }

    setSelected((prev: any) => ({
      ...prev,
      destRack: nextDestRack,
    }));
  }, [selected.srcRack]);

  useEffect(() => {
    if (selected.srcRack && selected.destRack) {
      //   setHighlights({
      //     items: {
      //       id: connections?.filter((connection) => {
      //         return (
      //           connection.sourceRackNumber === selected.srcRack &&
      //           connection.destinationRackNumber === selected.destRack);
      //       }) || [],
      //     },
      //   });
      setRackToRack({
        sourceRack: selected.srcRack,
        destinationRack: selected.destRack,
        showRackToRackImageView: true,
        sourceOnly: false,
      });
      onRackListChange?.([selected.srcRack]);
    } else if (selected.srcRack && !selected.destRack) {
      setRackToRack({
        sourceRack: selected.srcRack,
        destinationRack: null,
        showRackToRackImageView: false,
        sourceOnly: true,
      });
      onRackListChange?.([selected.srcRack]);
    } else {
      setRackToRack(null);
    }
  }, [selected, srcRackMapping]);

  // Determine which GPU racks are in the selected filters
  useEffect(() => {
    if (!onRackListChange) {
      return;
    }

    let filteredRacks = [...(gpuRacks || [])];

    if (roomName?.startsWith("aga5") && rackFilters.deploymentGroup) {
      const group = mapping.groups.find(
        (g) => String(g.placementGroup) === rackFilters.deploymentGroup,
      );
      if (!group || !group.rackPositions) {
        onRackListChange([]);
        return;
      }

      const allowedRacks = new Set(group.rackPositions);
      filteredRacks = filteredRacks.filter((rack) => allowedRacks.has(rack));
    }

    if (rackFilters.platformName || rackFilters.blockName) {
      const roomPlatformByRack = new Map<
        string,
        { platformName: string | null; blockName: string | null }
      >();

      (roomPlatforms || []).forEach((roomPlatform) => {
        const rackNumber = roomPlatform.rackNumber?.trim();
        if (!rackNumber) {
          return;
        }

        roomPlatformByRack.set(rackNumber, {
          platformName: roomPlatform.platformName ?? null,
          blockName: roomPlatform.blockName ?? null,
        });
      });

      filteredRacks = filteredRacks.filter((rack) => {
        const rackPlatform = roomPlatformByRack.get(rack);
        if (!rackPlatform) {
          return false;
        }
        if (
          rackFilters.platformName &&
          rackPlatform.platformName !== rackFilters.platformName
        ) {
          return false;
        }
        if (
          rackFilters.blockName &&
          rackPlatform.blockName !== rackFilters.blockName
        ) {
          return false;
        }
        return true;
      });
    }

    onRackListChange(filteredRacks);
  }, [
    roomName,
    rackFilters.deploymentGroup,
    rackFilters.platformName,
    rackFilters.blockName,
    gpuRacks,
    roomPlatforms,
  ]);

  const isDestRackSelectDisabled =
    !selected.srcRack || !selected.destRack;

  return (
    <div className="path-selectors-group">
      <oj-c-select-single
        id="srcRackSelect"
        data={
          new ArrayDataProvider(filteredSrcOptions, { keyAttributes: "value" })
        }
        itemText="label"
        labelHint="Source Rack ID"
        placeholder={"Choose a single source"}
        width={"sm"}
        onvalueChanged={(event) => {
          //   setHighlights({ items: {} });
          const selectedSrcRack = event.detail.value;
          if (isOhrRackId(selectedSrcRack)) {
            onAutoEnableShowOhr?.();
          }
          setRackToRack(null);
          setSelected({
            ...selected,
            srcRack: selectedSrcRack,
            destRack: null
          });
        }}
        value={selected.srcRack}
        disabled={!!disableSrcRackSelect}
      />
      {!isDestRackSelectDisabled && (
        <oj-c-select-single
          id="destRackSelect"
          data={new ArrayDataProvider(destOptions, { keyAttributes: "value" })}
          itemText="label"
          labelHint="Dest Rack ID"
          placeholder={"Choose a destination rack"}
          width={"sm"}
          onvalueChanged={(event) =>
            setSelected({ ...selected, destRack: event.detail.value })
          }
          value={selected.destRack}
          disabled={isDestRackSelectDisabled}
        />
      )}
    </div>
  );
};
