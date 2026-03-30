/**
 * @license
 * Copyright (c) 2014, 2025, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import "oj-c/select-single";
import { Dispatch, StateUpdater, useEffect, useState } from "preact/hooks";
import { FlattenedConnection, HighlightsInfo } from "./types";
import { flattenConnections } from "./GraphUtil";
import ArrayDataProvider from "ojs/ojarraydataprovider";
import { PhysicalConnectionSummary } from "../../../../../../gen/clients/ide-lvv-client";

interface Option {
  label: string;
  value: string;
}

interface PathSelectorsProps {
  connections: PhysicalConnectionSummary[] | undefined;
  //   highlights: HighlightsInfo;
  //   setHighlights: Dispatch<StateUpdater<HighlightsInfo>>;
  setRackToRack: Dispatch<
    StateUpdater<{
      sourceRack: string;
      destinationRack: string;
    } | null>
  >;

  clearRackSelection: boolean;
  disableSrcRackSelect?: boolean;
}

export const PathSelectors = ({
  connections,
  //   setHighlights,
  setRackToRack,
  clearRackSelection,
  disableSrcRackSelect,
}: PathSelectorsProps) => {
  const [selected, setSelected] = useState<any>({
    srcRack: null,
    destRack: null,
    destRack2: null,
  });
  const [srcRackMapping, setSrcRackMapping] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [srcOptions, setSrcOptions] = useState<Option[]>([]);
  const [destOptions, setDestOptions] = useState<Option[]>([]);

  useEffect(() => {
    setSelected({
      srcRack: null,
      destRack: null,
      destRack2: null,
    });
    // setHighlights({ items: {} });
    setRackToRack(null);
  }, [clearRackSelection]);

  useEffect(() => {
    if (!connections || connections.length === 0) {
      setSrcOptions([]);
      setDestOptions([]);
      setSrcRackMapping(new Map());
      return;
    }
    if (connections && connections.length > 0) {
      const srcRackMapping: Map<string, Set<string>> = new Map();
      const destRackMapping: Map<string, Set<string>> = new Map();

      connections.forEach((connection) => {
        const { sourceRackNumber, destinationRackNumber } = connection;

        if (!sourceRackNumber || !destinationRackNumber) return;

        if (!srcRackMapping.has(sourceRackNumber)) {
          srcRackMapping.set(sourceRackNumber, new Set());
        }
        srcRackMapping.get(sourceRackNumber)?.add(destinationRackNumber);

        if (!destRackMapping.has(destinationRackNumber)) {
          destRackMapping.set(destinationRackNumber, new Set());
        }
        destRackMapping.get(destinationRackNumber)?.add(sourceRackNumber);
      });

      setSrcRackMapping(srcRackMapping);
      setSrcOptions(
        Array.from(srcRackMapping.keys())
          .sort()
          .map((src) => ({
            label: `${src} - (${Array.from(srcRackMapping.get(src) || [])
              .sort()
              .join(", ")})`,
            value: src,
          })),
      );
      setDestOptions(
        Array.from(destRackMapping.keys())
          .sort()
          .map((dest) => ({
            label: dest,
            value: dest,
          })),
      );
    }
  }, [connections]);

  useEffect(() => {
    if (selected.destRack && !selected.srcRack) {
      setSrcOptions(
        Array.from(srcRackMapping.get(selected.destRack) || [])
          ?.sort()
          .map((src: string) => ({
            label: `${src} - (${Array.from(srcRackMapping.get(src) || [])
              .sort()
              .join(", ")})`,
            value: src,
          })),
      );
    } else if (selected.srcRack && selected.destRack) {
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
      });
    }
  }, [selected]);

  return (
    <div className="region-dropdown-group">
      <oj-c-select-single
        id="srcRackSelect"
        data={new ArrayDataProvider(srcOptions, { keyAttributes: "value" })}
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
          setSrcOptions(
            Array.from(srcRackMapping.keys())
              .sort()
              .map((src) => ({
                label:
                  src === selectedSrcRack
                    ? src
                    : `${src} - (${Array.from(srcRackMapping.get(src) || [])
                        .sort()
                        .join(", ")})`,
                value: src,
              })),
          );
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
        id="selectedRoom"
        data={new ArrayDataProvider(destOptions, { keyAttributes: "value" })}
        item-text="label"
        label-hint="Dest Rack ID"
        placeholder={"Choose a destination rack"}
        onvalueChanged={(event) =>
          setSelected({ ...selected, destRack: event.detail.value })
        }
        value={selected.destRack}
        disabled={!selected.srcRack || !!disableSrcRackSelect}
      />
      <oj-c-select-single
        id="selectedRoom"
        data={
          new ArrayDataProvider(
            destOptions.filter((value) => value.value !== selected.destRack),
            { keyAttributes: "value" },
          )
        }
        item-text="label"
        label-hint="Dest Rack ID - second"
        placeholder={"Choose a second destination rack"}
        onvalueChanged={(event) =>
          setSelected({ ...selected, destRack2: event.detail.value })
        }
        value={selected.destRack2}
        // disabled={!selected.srcRack || !selected.destRack}
        disabled={true}
      />
    </div>
  );
};
