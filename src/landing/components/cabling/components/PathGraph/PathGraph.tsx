import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import * as d3 from "d3";
import * as d3Zoom from "d3-zoom";
// import GraphFilterPanel from './GraphFilterPanel';
import {
  getColorByEdge,
  getPathColor,
  calculateScaledX,
  calculateScaledY,
  addOffset,
} from "./GraphUtil";
import "ojs/ojbutton";
import "oj-c/button";
import { HighlightsInfo, GraphProp } from "./types";
import "./style.scss";
import { RoomObject } from "../../types";
import { RoomLayout, RoomPlatform } from "gen/clients/ide-lvv-client";

const IMAGE_WIDTH = 1000;
const IMAGE_HEIGHT = 800;
const IMAGE_BORDER_SPACE = 100;
const PAN_DISTANCE = 50;
const RACK_HOVER_SCALE = 2;
const RACK_HOVER_TEXT_OFFSET_X = 15;
const OHR_RACK_FILL = "red";
const OHR_RACK_STROKE = "darkred";

const isOhrRack = (rack: Partial<RoomObject> | null | undefined) =>
  String(rack?.type || "").toLowerCase().includes("ohr");

const isRackObject = (item: Partial<RoomObject> | null | undefined) => {
  const type = String(item?.type || "");
  return type.endsWith("Rack") || isOhrRack(item);
};

const getRackId = (rack: Partial<RoomObject> | null | undefined) =>
  rack?.label || rack?.id || "";

interface PathGraphProps {
  room: RoomLayout;
  gpuRacks: string[];
  roomPlatforms: RoomPlatform[] | undefined;
  rackFilters: {
    platformName: string | null;
    blockName: string | null;
  };
  onRackClick: (rackId: string, isGpuRack: boolean) => void;
  hoverRackId: string | null;
  showOhrRacks?: boolean;
  // highlights: HighlightsInfo;
}

export const PathGraph = ({
  room,
  gpuRacks,
  roomPlatforms,
  rackFilters,
  onRackClick,
  hoverRackId,
  showOhrRacks = false,
}: PathGraphProps) => {
  type RackPlatformInfo = {
    platformName: string | null;
    blockName: string | null;
  };

  const [graphProp, setGraphProp] = useState<GraphProp>();
  const gpuRackSet = useMemo(() => new Set(gpuRacks || []), [gpuRacks]);
  const hasActiveRackFilters = !!(
    rackFilters.platformName || rackFilters.blockName
  );
  const roomPlatformByRackIdRef = useRef<Map<string, RackPlatformInfo>>(
    new Map(),
  );
  const roomPlatformByRackId = useMemo(() => {
    const rackMap = new Map<string, RackPlatformInfo>();

    (roomPlatforms || []).forEach((roomPlatform) => {
      const rackNumber = roomPlatform.rackNumber?.trim();
      if (!rackNumber) {
        return;
      }

      rackMap.set(rackNumber, {
        platformName: roomPlatform.platformName ?? null,
        blockName: roomPlatform.blockName ?? null,
      });
    });

    return rackMap;
  }, [roomPlatforms]);
  useEffect(() => {
    roomPlatformByRackIdRef.current = roomPlatformByRackId;
  }, [roomPlatformByRackId]);
  const matchingFilteredRackIds = useMemo(() => {
    if (!hasActiveRackFilters) {
      return null;
    }

    const matchingRacks = new Set<string>();
    (roomPlatforms || []).forEach((roomPlatform) => {
      const rackNumber = roomPlatform.rackNumber?.trim();
      if (!rackNumber) {
        return;
      }

      if (
        rackFilters.platformName &&
        roomPlatform.platformName !== rackFilters.platformName
      ) {
        return;
      }

      if (
        rackFilters.blockName &&
        roomPlatform.blockName !== rackFilters.blockName
      ) {
        return;
      }

      matchingRacks.add(rackNumber);
    });

    return matchingRacks;
  }, [
    hasActiveRackFilters,
    roomPlatforms,
    rackFilters.platformName,
    rackFilters.blockName,
  ]);
  const getRackOpacity = (
    rack: string | Partial<RoomObject> | null | undefined,
  ) => {
    if(showOhrRacks && isOhrRack(rack as Partial<RoomObject>)) {
      return '0.8';
    }
    const rackId =
      typeof rack === "string" ? rack : getRackId(rack as Partial<RoomObject>);
    if (!hasActiveRackFilters) {
      return gpuRacks.includes(rackId) ? "0.9" : "0.8";
    }
    return matchingFilteredRackIds?.has(rackId) ? "1" : "0.1";
  };
  const generateLine = d3
    .line()
    .x((p: any) => calculateScaledX(p.pointX, graphProp))
    .y((p: any) => calculateScaledY(p.pointY, graphProp));

  const generateLineWithOffset = d3
    .line()
    .x((p: any) => p.pointX)
    .y((p: any) => p.pointY);

  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<d3Zoom.ZoomBehavior<
    SVGSVGElement,
    unknown
  > | null>(null);
  const getSvgElement = () => d3.select(svgRef.current as SVGSVGElement);
  const getGraphLayer = () =>
    getSvgElement().select<SVGGElement>("g.graph-content");
  const getRackPolygonPoints = (
    coordinates: [number, number][],
    scaleFactor = 1,
  ) => {
    if (!graphProp || !coordinates?.length) return "";

    const screenPoints = coordinates.map(([x, y]) => ({
      x: calculateScaledX(x, graphProp, true),
      y: calculateScaledY(y, graphProp, true),
    }));

    if (scaleFactor === 1) {
      return screenPoints.map((pt) => `${pt.x},${pt.y}`).join(" ");
    }

    const centerX =
      screenPoints.reduce((sum, pt) => sum + pt.x, 0) / screenPoints.length;
    const centerY =
      screenPoints.reduce((sum, pt) => sum + pt.y, 0) / screenPoints.length;

    return screenPoints
      .map((pt) => {
        const scaledX = centerX + (pt.x - centerX) * scaleFactor;
        const scaledY = centerY + (pt.y - centerY) * scaleFactor;
        return `${scaledX},${scaledY}`;
      })
      .join(" ");
  };
  const rackIsGpu = (rack: Partial<RoomObject> | null | undefined) =>
    gpuRackSet.has(getRackId(rack));

  const getRackStroke = (rack: Partial<RoomObject> | null | undefined) => {
    if (isOhrRack(rack)) {
      return OHR_RACK_STROKE;
    }

    return rackIsGpu(rack) ? "darkgreen" : "darkgrey";
  };

  const getRackFill = (rack: Partial<RoomObject> | null | undefined) => {
    if (isOhrRack(rack)) {
      return OHR_RACK_FILL;
    }

    return rackIsGpu(rack) ? "green" : "lightblue";
  };

  const getRackBounds = (coordinates: [number, number][]) => {
    if (!graphProp || !coordinates?.length) return null;

    const screenPoints = coordinates.map(([x, y]) => ({
      x: calculateScaledX(x, graphProp, true),
      y: calculateScaledY(y, graphProp, true),
    }));

    return {
      minX: Math.min(...screenPoints.map((pt) => pt.x)),
      maxX: Math.max(...screenPoints.map((pt) => pt.x)),
      minY: Math.min(...screenPoints.map((pt) => pt.y)),
      maxY: Math.max(...screenPoints.map((pt) => pt.y)),
    };
  };

  // calculate max, min, scale, range on x/y, and set in GraphProp state
  useEffect(() => {
    const svgElement = getSvgElement();
    if (svgElement.empty()) return;

    const width = svgElement.node()?.getBoundingClientRect().width;
    const height = svgElement.node()?.getBoundingClientRect().height;

    if (!width || !height) {
      return;
    }

    svgElement.attr("viewBox", `0 0 ${width} ${height}`);
    svgElement.selectAll("*").remove();

    const graphLayer = svgElement.append("g").attr("class", "graph-content");

    const zoom = d3Zoom
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 10])
      .on("zoom", (e) => {
        graphLayer.attr("transform", e.transform.toString());
      });

    zoomBehaviorRef.current = zoom;

    svgElement.call(zoom as any).on("dblclick.zoom", null);
    svgElement.call(zoom.transform as any, d3.zoomIdentity.translate(50, 0));

    const racks: RoomObject[] = [];
    const ohrRacks: RoomObject[] = [];
    const basketTrays: RoomObject[] = [];
    room?.layout?.room?.objects.forEach((item: any, index: number) => {
      if (String(item?.type || "").startsWith("BasketTray")) {
        basketTrays.push({
          ...item,
          id: index + "",
        });
      } else if (isRackObject(item)) {
        if (isOhrRack(item)) {
          ohrRacks.push(item);
        } else {
          racks.push(item);
        }
      }
    });

    const rackBoundsObjects = showOhrRacks ? [...racks, ...ohrRacks] : racks;

    if (!rackBoundsObjects.length) {
      setGraphProp(undefined);
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    rackBoundsObjects.forEach((rack) => {
      minX = Math.min(minX, rack.coordinates[0][0], rack.coordinates[1][0]);
      maxX = Math.max(maxX, rack.coordinates[0][0], rack.coordinates[1][0]);
      minY = Math.min(minY, rack.coordinates[0][1], rack.coordinates[1][1]);
      maxY = Math.max(maxY, rack.coordinates[0][1], rack.coordinates[1][1]);
    });
    minX = minX * 25.4;
    maxX = maxX * 25.4;
    minY = minY * 25.4;
    maxY = maxY * 25.4;

    let sizeRangeX = maxX - minX;
    let sizeRangeY = maxY - minY;
    if (sizeRangeX === 0) sizeRangeX = 1;
    if (sizeRangeY === 0) sizeRangeY = 1;
    const scaleX = (IMAGE_WIDTH - IMAGE_BORDER_SPACE * 2) / sizeRangeX;
    const scaleY = (IMAGE_HEIGHT - IMAGE_BORDER_SPACE * 2) / sizeRangeY;
    const scale = Math.min(scaleX, scaleY);

    setGraphProp({
      minX,
      maxX,
      minY,
      maxY,
      scale,
      sizeRangeX,
      sizeRangeY,
      imageWidth: IMAGE_WIDTH,
      imageHeight: IMAGE_HEIGHT,
      racks,
      ohrRacks,
      basketTrays,
    });
  }, [room, showOhrRacks]);

  const renderRackInfo = (node: any) => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;
    const rackData = node?.["__data__"];
    const rackId = String(rackData?.label || rackData?.id || "").trim();
    const bounds = getRackBounds(rackData?.coordinates || []);
    if (!bounds) return;

    const rackPlatformInfo = roomPlatformByRackIdRef.current.get(rackId);
    const rackType = rackData?.type || "N/A";
    const hoverLines = [`Rack: ${rackId || "N/A"}`, `Type: ${rackType}`];
    if (rackPlatformInfo?.platformName) {
      hoverLines.push(`Platform: ${rackPlatformInfo?.platformName}`);
    }
    if (rackPlatformInfo?.blockName) {
      hoverLines.push(`Block: ${rackPlatformInfo?.blockName || "N/A"}`);
    }

    const lineHeight = 16;
    const paddingX = 8;
    const paddingY = 4;
    const hoverWidth =
      Math.max(...hoverLines.map((line) => line.length), 0) * 7 + paddingX * 2;
    const hoverHeight = hoverLines.length * lineHeight + paddingY * 2;
    const hoverX = bounds.maxX + RACK_HOVER_TEXT_OFFSET_X;
    const hoverY = bounds.minY + (bounds.maxY - bounds.minY - hoverHeight) / 2;

    graphLayer.selectAll(".rack-hover-text").remove();

    const hoverGroup = graphLayer
      .append("g")
      .attr("class", "rack-hover-text")
      .attr("key", rackData?.key || rackData?.label || rackData?.id || "")
      .attr("transform", `translate(${hoverX},${hoverY})`);

    hoverGroup
      .append("rect")
      .attr("width", hoverWidth)
      .attr("height", hoverHeight)
      .attr("stroke", "grey")
      .attr("stroke-width", "1")
      .attr("fill", "lightgrey")
      .attr("x", 0)
      .attr("y", 0);

    const hoverText = hoverGroup
      .append("text")
      .attr("x", paddingX)
      .attr("y", paddingY)
      .attr("font-size", "12px");

    hoverLines.forEach((line, index) => {
      hoverText
        .append("tspan")
        .attr("x", paddingX)
        .attr("dy", index === 0 ? "1em" : "1.2em")
        .text(line);
    });

    graphLayer.selectAll(`.rack-hover-text`).raise();
  };
  // helper: enlarge a rack polygon and show label, same as mouseover
  const enlargeRackById = (rackId: string) => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;
    if (!graphProp) return;
    const sel = graphLayer.select(`g#node-group-rack-${rackId} polygon`);
    if (sel.empty()) return;

    const data: any = (sel.node() as any)?.__data__;
    if (!data || !data.coordinates) return;

    sel
      .transition()
      .duration(100)
      .attr("points", () =>
        getRackPolygonPoints(data.coordinates || [], RACK_HOVER_SCALE),
      );

    renderRackInfo(sel.node() as Element);
  };

  // helper: reset rack polygon and remove label, same as mouseout
  const resetRackById = (rackId: string) => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;
    if (!graphProp) return;
    const sel = graphLayer.select(`g#node-group-rack-${rackId} polygon`);
    if (sel.empty()) return;

    const data: any = (sel.node() as any)?.__data__;
    if (!data || !data.coordinates) return;

    sel
      .transition()
      .duration(200)
      .attr("points", () => getRackPolygonPoints(data.coordinates || []));

    graphLayer.selectAll(".rack-hover-text").remove();
  };
  const raiseHighlightedRacks = () => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;

    matchingFilteredRackIds?.forEach((rackId) => {
      graphLayer.select(`g#node-group-rack-${rackId}`).raise();
    });
  };

  const raiseOhrRacks = () => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;

    graphLayer.selectAll("g.node-group-ohr-rack").raise();
  };

  // inital node rendering
  useEffect(() => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;
    graphLayer.selectAll("*").remove();
    if (!graphProp) return;

    const visibleRacks = showOhrRacks
      ? [...(graphProp?.racks || []), ...(graphProp?.ohrRacks || [])]
      : graphProp?.racks || [];

    // rack node group handles the mouse over/out event
    graphLayer
      .selectAll("g.node-group-rack")
      .data(visibleRacks)
      .enter()
      .append("g")
      .attr("key", (d) => getRackId(d))
      .attr("class", (d) =>
        isOhrRack(d)
          ? "node-group node-group-rack node-group-ohr-rack"
          : "node-group node-group-rack",
      )
      .attr("id", (d) => "node-group-rack-" + getRackId(d));

    graphLayer
      .selectAll("g.basket-tray-group")
      .data(graphProp?.basketTrays || [])
      .enter()
      .append("g")
      .attr("key", (d) => getRackId(d))
      .attr("class", "basket-tray-group")
      .attr("id", (d) => "basket-tray-" + (d.id || d.label || ""));

    graphLayer
      .selectAll("g.node-group")
      .append("polygon")
      .attr("class", "rack-node-rect")
      .attr("id", (d: any) => d.id)
      .attr("points", (d: any) => getRackPolygonPoints(d.coordinates || []))
      .attr("stroke", (d: any) => getRackStroke(d))
      .attr("fill", (d: any) => getRackFill(d))
      .attr("stroke-width", "0.6")
      .attr("opacity", (d: any) => getRackOpacity(d))
      .on("mouseover", function (d) {
        d3.select(this)
          .transition()
          .duration(100)
          .attr("points", (d: any) =>
            getRackPolygonPoints(d.coordinates || [], RACK_HOVER_SCALE),
          );
        renderRackInfo(d3.select(this).node() as Element);
      })
      .on("mouseout", function (d: any, node: any) {
        if (hoverRackId === (node.label || node.id)) return;
        d3.select(this)
          .transition()
          .duration(200)
          .attr("points", (d: any) =>
            getRackPolygonPoints(d.coordinates || []),
          );
        graphLayer.selectAll(".rack-hover-text").remove();
      });
    // basket trays connections
    graphLayer
      .selectAll("g.basket-tray-group")
      .append("polygon")
      .attr("class", "edge")
      .attr("id", (d: any) => d.id)
      .attr("points", (d: any) => {
        return (d.coordinates || [])
          .map((d: any) => {
            return [
              calculateScaledX(d[0], graphProp, true),
              calculateScaledY(d[1], graphProp, true),
            ].join(",");
          })
          .join(" ");
      })
      .attr("stroke", "darkgrey")
      .attr("fill", "lightgrey")
      .attr("stroke-width", "0.6")
      .attr("opacity", "0.2");

    graphLayer.selectAll(".node-group").raise();
    graphLayer.selectAll(".edge").lower();
    if (matchingFilteredRackIds?.size) {
      matchingFilteredRackIds.forEach((rackId) => {
        graphLayer
          .selectAll("g#node-group-rack-" + rackId + " polygon")
          .attr("opacity", (d: any) => getRackOpacity(d))
          .on("click", function (_event, d: any) {
            const rackId = getRackId(d);
            const isGpuRack = rackIsGpu(d);
            onRackClick(rackId, isGpuRack);
          });
      });
      raiseHighlightedRacks();
    }
    raiseOhrRacks();
  }, [graphProp, showOhrRacks]);

  useEffect(() => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;

    graphLayer
      .selectAll("g.node-group polygon")
      .attr("stroke", (d: any) => getRackStroke(d))
      .attr("fill", (d: any) => getRackFill(d))
      .attr("opacity", (d: any) => getRackOpacity(d))
      .on("click", function (_event, d: any) {
        if (isOhrRack(d)) return;

        const rackId = getRackId(d);
        const isGpuRack = rackIsGpu(d);
        onRackClick(rackId, isGpuRack);
      });

    raiseHighlightedRacks();
    raiseOhrRacks();
  }, [
    gpuRacks,
    hasActiveRackFilters,
    matchingFilteredRackIds,
    showOhrRacks]);

  // respond to hoverRackId from PhysicalCutsheetPanel
  const prevHoverRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevHoverRef.current;
    if (prev && prev !== hoverRackId) {
      resetRackById(prev);
    }
    if (hoverRackId) {
      enlargeRackById(hoverRackId);
    }
    prevHoverRef.current = hoverRackId;
  }, [hoverRackId, graphProp]);

  // const renderPathInfo = (
  //   d: any,
  //   connection: PhysicalConnectionSummary,
  //   route: string,
  // ) => {
  //   if (!connection) return;
  //   const {
  //     sourceRackNumber,
  //     destinationRackNumber,
  //     cableType,
  //     routeType,
  //     id,
  //   } = connection;

  // const { offsetX, offsetY } = d;
  // svgElement
  //   .append("g")
  //   .attr("class", "path-hover-text")
  //   .attr("key", d.key)
  //   .append("rect")
  //   .attr("width", 300)
  //   .attr("height", 90)
  //   .attr("stroke", getPathColor(routeType, id))
  //   .attr("stroke-width", "3")
  //   .attr("fill", "lightgrey")
  //   .attr("x", offsetX + 70)
  //   .attr("y", offsetY);

  // svgElement
  //   .selectAll("g.path-hover-text")
  //   .append("text")
  //   .attr("x", offsetX + 75)
  //   .attr("y", offsetY + 5)
  //   .attr("font-size", "1em")
  //   .html(
  //     `<tspan x=${offsetX + 75} dy='1em'>SrcRackNumber: ${sourceRackNumber}</tspan>
  //      <tspan x=${
  //        offsetX + 75
  //      } dy='1em'>DestRackNumber: ${destinationRackNumber}</tspan>
  //      <tspan x=${offsetX + 75} dy='1em'>Route: ${routeType}</tspan>
  //      <tspan x=${offsetX + 75} dy='1em'>CableType: ${cableType}</tspan>
  //     </tspan>
  //       `,
  //   );

  //   d3.selectAll(`.path-hover-text`).raise();
  // };

  // render highlighted path
  // useEffect(() => {
  //   // remove all previous paths and reset all highlight nodes at first
  //   svgElement.selectAll("path").remove();
  //   svgElement.selectAll(".rack-node-text").remove();

  //   svgElement
  //     .selectAll(".node-group.highlight rect")
  //     .attr("rx", 0)
  //     .attr("ry", 0)
  //     .attr("width", 8)
  //     .attr("height", 8)
  //     .attr("transform", "translate(-4, -4)")
  //     .attr("stroke", "darkgrey")
  //     .attr("fill", "lightgrey");

  //   svgElement.selectAll(".node-group.highlight").classed("highlight", false);
  //   svgElement
  //     .selectAll("g.node-group.node-group-non-rack")
  //     .attr("visibility", "hidden");

  //   if (Object.keys(highlights.items).length) {
  //     svgElement
  //       .selectAll("g.node-group.node-group-rack")
  //       .attr("visibility", "visible");

  //     svgElement.selectAll(".node-group").attr("opacity", "0.3");

  //     svgElement.selectAll(".edge").attr("opacity", "0.1");
  //     const rackIds = new Set<string>();
  //     const processedPolylines: any[] = [];
  //     Object.values(highlights.items)
  //       .flat()
  //       .forEach((connection: PhysicalConnectionSummary) => {
  //         const {
  //           sourceRackNumber,
  //           routeType,
  //           id,
  //           destinationRackNumber,
  //           path,
  //         } = connection;

  //         let polylines = [path];

  //         polylines?.forEach((pl, index) => {
  //           processedPolylines.push({
  //             pl,
  //             id,
  //             routeType,
  //             connection,
  //           } as any);
  //         });

  //         if (sourceRackNumber && destinationRackNumber) {
  //           rackIds.add(sourceRackNumber);
  //           rackIds.add(destinationRackNumber);
  //         }
  //       });

  //     const offsetPolylines = addOffset(
  //       processedPolylines.map((pl) => pl.pl),
  //       graphProp,
  //     );

  //     processedPolylines.forEach((pl: any, index) => {
  //       if (!offsetPolylines || index >= offsetPolylines.length) return;
  //       const isSingle = processedPolylines.length === 1;
  //       const { id, route, connection } = pl;
  //       const routeType = connection.routeType;
  //       const color = getPathColor(routeType, id);

  //       d3.select(".visualizer")
  //         .append("path")
  //         .attr("id", (_d) => `${id}_${routeType}`)
  //         .attr("class", "path")
  //         .attr(
  //           "d",
  //           isSingle
  //             ? generateLine(pl.pl)
  //             : generateLineWithOffset(offsetPolylines[index] as any),
  //         )
  //         .attr("fill", "none")
  //         .attr("stroke", color)
  //         .attr("stroke-width", "1")
  //         .on("mouseover", function (d) {
  //           d3.select(this).transition().duration(100).attr("stroke-width", 5);
  //           renderPathInfo(d, connection, routeType);
  //         })
  //         .on("mouseout", function (_d) {
  //           d3.select(this)
  //             .transition()
  //             .duration(200)
  //             .attr("stroke-width", "1");

  //           d3.selectAll(".path-hover-text").remove();
  //         });
  //     });

  //     // expand source and dest nodes
  //     [...rackIds].forEach((id: string, index: number) => {
  //       svgElement
  //         .selectAll("g#node-group-rack-" + id)
  //         .classed("highlight", true)
  //         .attr("visibility", "visible");

  //       svgElement
  //         .selectAll("g#node-group-rack-" + id)
  //         .select("polygon")
  //         .attr("text", (d: any) => d.id)
  //         .attr("stroke-width", "2")
  //         .attr("opacity", "1");
  //       svgElement
  //         .selectAll("g#node-group-rack-" + id)
  //         .append("text")
  //         .attr("class", "rack-node-text")
  //         .attr("key", (d: any) => d.key)
  //         .attr("x", (d: any) =>
  //           calculateScaledX(d.coordinates[0], graphProp, true),
  //         )
  //         .attr("y", (d: any) =>
  //           calculateScaledY(d.coordinates[1], graphProp, true),
  //         )
  //         .attr("dy", "-5")
  //         .attr("dx", "16")
  //         .attr("font-size", "1em")
  //         .attr("text-anchor", "middle")
  //         .text(id)
  //         .attr("fill", "darkgreen")
  //         .attr("stroke", "dargreen");
  //     });

  //     svgElement.selectAll("text.rack-node-text").raise();
  //     svgElement.selectAll(".path").raise();
  //     svgElement
  //       .selectAll(".node-group.highlight")
  //       .attr("opacity", "1")
  //       .raise();
  //   } else {
  //     // no highlights, so make rack nodes and edges fully visible
  //     svgElement
  //       .selectAll(".node-group.node-group-rack")
  //       .attr("visibility", "visible")
  //       .attr("opacity", "1");

  //     svgElement.selectAll(".edge").attr("opacity", "0.5");
  //   }
  // }, [highlights]);

  const withZoom = (callback: (svgElement: any, zoom: any) => void) => {
    const zoom = zoomBehaviorRef.current;
    if (!zoom || !svgRef.current) return;

    const svgElement = d3.select(svgRef.current as SVGSVGElement);
    callback(svgElement, zoom);
  };

  const handleMove = (x: number, y: number) => {
    withZoom((svgElement, zoom) => {
      const currentTransform = d3.zoomTransform(svgElement.node() as Element);
      svgElement
        .transition()
        .duration(100)
        .call(zoom.transform, currentTransform.translate(x, y));
    });
  };

  return (
    <div className={"svg-viewport"} ref={viewportRef}>
      <div className="oj-md-padding-1x visulization-button">
        <div>
          <div>
            <oj-button
              id="zoom-in-button"
              display="icons"
              onojAction={() => {
                withZoom((svgElement, zoom) => {
                  svgElement.transition().call(zoom.scaleBy as any, 1.2);
                });
              }}
            >
              +
              {/* <span slot="startIcon" class="oj-ux-ico-information"></span> + */}
            </oj-button>
            <oj-button
              id="up-button"
              onojAction={() => {
                handleMove(0, PAN_DISTANCE);
              }}
            >
              ^
            </oj-button>
            <oj-button
              id="zoom-out-button"
              display="icons"
              onojAction={() => {
                withZoom((svgElement, zoom) => {
                  svgElement.transition().call(zoom.scaleBy as any, 0.8);
                });
              }}
            >
              -
              {/* <span slot="startIcon" class="oj-ux-ico-information"></span> - */}
            </oj-button>
          </div>
          <div>
            <oj-button
              id="left-button"
              onojAction={() => {
                handleMove(PAN_DISTANCE, 0);
              }}
            >
              {`<`}
            </oj-button>
            <oj-button
              id="reset-button"
              onojAction={() => {
                withZoom((svgElement, zoom) => {
                  svgElement
                    .transition()
                    .call(
                      zoom.transform as any,
                      d3.zoomIdentity.translate(50, 0),
                    );
                });
              }}
            >
              o
            </oj-button>
            <oj-button
              id="right-button"
              onojAction={() => {
                handleMove(-PAN_DISTANCE, 0);
              }}
            >
              {`>`}
            </oj-button>
          </div>
          <div className={"button-last"}>
            <oj-button
              id="down-button"
              onojAction={() => {
                handleMove(0, -PAN_DISTANCE);
              }}
            >
              v
            </oj-button>
          </div>
        </div>
      </div>
      <svg ref={svgRef} className={"visualizer"} />
    </div>
  );
};

export default PathGraph;
