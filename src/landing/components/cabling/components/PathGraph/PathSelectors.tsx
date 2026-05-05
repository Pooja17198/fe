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
import { PhysicalConnectionSummary } from "../../../../../../gen/clients/ide-lvv-client";
import mapping from "../../api/mockAPI/deployment-groups.json";
interface Option {
  label: string;
  value: string;
}

interface PathSelectorsProps {
  roomName?: string | null; // NEW
  gpuRacks: string[];
  connections: PhysicalConnectionSummary[] | undefined;
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
  onRackListChange?: (
    racksInGroup: string[],
  ) => void;
}

export const PathSelectors = ({
  roomName,
  gpuRacks,
  connections,
  //   setHighlights,
  setRackToRack,
  clearRackSelection,
  disableSrcRackSelect,
  onRackListChange,
}: PathSelectorsProps) => {
  const [selected, setSelected] = useState<any>({
    deploymentGroup: null,
    srcRack: null,
    destRack: null,
    destRack2: null,
  });
  const [srcRackMapping, setSrcRackMapping] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [destOptions, setDestOptions] = useState<Option[]>([]);

  useEffect(() => {
    setSelected({
      deploymentGroup: null,
      srcRack: null,
      destRack: null,
      destRack2: null,
    });
    // setHighlights({ items: {} });
    setRackToRack(null);
    setDestOptions([]);
  }, [clearRackSelection]);

  useEffect(() => {
    if (!connections || connections.length === 0) {
      // Even if there are no connections, we still want to show GPU racks as selectable
      const srcRackMappingLocal: Map<string, Set<string>> = new Map();
      const destRackMappingLocal: Map<string, Set<string>> = new Map();

      // Seed mapping with GPU racks (no destinations yet)
      gpuRacks?.forEach((rack) => {
        if (!srcRackMappingLocal.has(rack)) {
          srcRackMappingLocal.set(rack, new Set());
        }
      });

      setSrcRackMapping(srcRackMappingLocal);

      setDestOptions(
        Array.from(destRackMappingLocal.keys())
          .sort()
          .map((dest) => ({
            label: dest,
            value: dest,
          })),
      );
      return;
    }

    const srcRackMappingLocal: Map<string, Set<string>> = new Map();
    const destRackMappingLocal: Map<string, Set<string>> = new Map();

    connections.forEach((connection) => {
      const { sourceRackNumber, destinationRackNumber } = connection;
      if (!sourceRackNumber || !destinationRackNumber) return;

      if (!srcRackMappingLocal.has(sourceRackNumber)) {
        srcRackMappingLocal.set(sourceRackNumber, new Set());
      }
      srcRackMappingLocal.get(sourceRackNumber)!.add(destinationRackNumber);

      if (!destRackMappingLocal.has(destinationRackNumber)) {
        destRackMappingLocal.set(destinationRackNumber, new Set());
      }
      destRackMappingLocal.get(destinationRackNumber)!.add(sourceRackNumber);
    });

    // Ensure all GPU racks exist in the mapping (even if they didn't appear as a source)
    gpuRacks?.forEach((rack) => {
      if (!srcRackMappingLocal.has(rack)) {
        srcRackMappingLocal.set(rack, new Set());
      }
    });

    setSrcRackMapping(srcRackMappingLocal);
    setDestOptions(
      Array.from(destRackMappingLocal.keys())
        .sort()
        .map((dest) => ({
          label: dest,
          value: dest,
        })),
    );
  }, [connections, gpuRacks]);

  useEffect(() => {
    if (selected.srcRack && selected.destRack) {
      setDestOptions(
        Array.from(srcRackMapping.get(selected.srcRack) || [])
          ?.sort()
          .map((dest: string) => ({
            label: dest,
            value: dest,
          })),
      );
      //   setHighlights({
      //     items: {
      //       id: connections?.filter((connection) => {
      //         return (
      //           connection.sourceRackNumber === selected.srcRack &&
      //           (connection.destinationRackNumber === selected.destRack ||
      //             connection.destinationRackNumber === selected.destRack2)
      //         );
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
      setDestOptions([]);
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

  const deploymentGroupOptions: Option[] = useMemo(
    () => [
      { label: "All Racks", value: "" }, // explicit unselect
      ...(mapping.groups || []).map((g) => ({
        label:
          String(g.placementGroup) +
          " (" +
          (g.rackPositions || []).join(", ") +
          ")",
        value: String(g.placementGroup),
      })),
    ],
    [],
  );

  const filteredSrcOptions = useMemo(() => {
    // Start from GPU racks only
    const gpuRackSet = new Set(gpuRacks || []);

    // base set: all GPU racks that have (or were added into) srcRackMapping
    let candidateRacks = Array.from(srcRackMapping.keys()).filter((rack) =>
      gpuRackSet.has(rack),
    );

    if(!roomName) return [];
    // If in aga5.1 and a specific group is chosen, further filter by group
    if (roomName?.startsWith("aga5") && selected.deploymentGroup) {
      const group = mapping.groups.find(
        (g) => String(g.placementGroup) === selected.deploymentGroup,
      );
      if (!group || !group.rackPositions || group.rackPositions.length === 0) {
        candidateRacks = [];
      } else {
        const allowedRacks = new Set(group.rackPositions);
        candidateRacks = candidateRacks.filter((r) => allowedRacks.has(r));
      }
    } else {
      candidateRacks = Array.from(srcRackMapping.keys());
    }

    return candidateRacks.sort().map((src) => {
      const destinations = Array.from(srcRackMapping.get(src) || []).sort();
      const label =
        destinations.length > 0 ? `${src} - (${destinations.join(", ")})` : src;
      return {
        label,
        value: src,
      };
    });
  }, [roomName, selected.deploymentGroup, srcRackMapping, gpuRacks]);

  // Determine which GPU racks are in the selected deployment group
  useEffect(() => {
    // if not aga5.1 or no callback, do nothing
    if (!roomName || !roomName.startsWith("aga5") || !onRackListChange) {
      return;
    }

    const groupId = selected.deploymentGroup;

    // groupId empty string or null => "no group filter": send all gpuRacks
    if (!groupId) {
      onRackListChange(gpuRacks || []);
      return;
    }

    const group = mapping.groups.find(
      (g) => String(g.placementGroup) === groupId,
    );
    if (!group || !group.rackPositions) {
      onRackListChange([]); // nothing in group
      return;
    }

    const allowedRacks = new Set(group.rackPositions);
    const gpuInGroup = (gpuRacks || []).filter((r) => allowedRacks.has(r));

    onRackListChange(gpuInGroup);
  }, [roomName, selected.deploymentGroup, gpuRacks]);

  return (
    <div className="region-dropdown-group">
      {roomName?.startsWith("aga5") && (
        <oj-c-select-single
          id="deploymentGroupSelect"
          class="rack-select"
          data={
            new ArrayDataProvider<Option["value"], Option>(
              deploymentGroupOptions,
              {
                keyAttributes: "value",
              },
            )
          }
          item-text="label"
          label-hint="Deployment Group"
          placeholder="Select a deployment group"
          value={selected.deploymentGroup ?? ""} // map null -> "" for "All"
          onvalueChanged={(event) => {
            const newGroup = event.detail.value as string | null;
            // Reset racks when deployment group changes
            setRackToRack(null);
            setSelected({
              deploymentGroup: newGroup,
              srcRack: null,
              destRack: null,
              destRack2: null,
            });
          }}
        />
      )}
      <oj-c-select-single
        id="srcRackSelect"
        class="rack-select"
        data={
          new ArrayDataProvider(filteredSrcOptions, { keyAttributes: "value" })
        }
        item-text="label"
        label-hint="Source Rack ID"
        placeholder={"Choose a single source"}
        onvalueChanged={(event) => {
          //   setHighlights({ items: {} });
          const selectedSrcRack = event.detail.value;
          setRackToRack(null);
          const destRackSet = srcRackMapping.get(selectedSrcRack);
          const destRack = destRackSet
            ? Array.from(destRackSet).sort()[0]
            : null;
          setSelected({
            ...selected,
            srcRack: selectedSrcRack,
            destRack: destRack,
            destRack2: null,
          });
        }}
        value={selected.srcRack}
        disabled={!!disableSrcRackSelect}
      />
      <oj-c-select-single
        id="destRackSelect"
        class="rack-select"
        data={new ArrayDataProvider(destOptions, { keyAttributes: "value" })}
        item-text="label"
        label-hint="Dest Rack ID"
        placeholder={"Choose a destination rack"}
        onvalueChanged={(event) =>
          setSelected({ ...selected, destRack: event.detail.value })
        }
        value={selected.destRack}
        disabled={
          !selected.srcRack ||
          !!disableSrcRackSelect ||
          destOptions.length === 0
        }
      />
    </div>
  );
};
