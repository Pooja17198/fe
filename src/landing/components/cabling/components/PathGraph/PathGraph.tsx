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
import { RoomLayout } from "gen/clients/ide-lvv-client";

const IMAGE_WIDTH = 1000;
const IMAGE_HEIGHT = 800;
const IMAGE_BORDER_SPACE = 100;
const PAN_DISTANCE = 50;
const RACK_HOVER_SCALE = 2;
const RACK_HOVER_TEXT_OFFSET_X = 15;

interface PathGraphProps {
  room: RoomLayout;
  racksWithPhysicalCutsheet: string[];
  onRackClick: (rackId: string, hasCutsheet: boolean) => void;
  hoverRackId: string | null;
  // highlights: HighlightsInfo;
}

export const PathGraph = ({
  room,
  racksWithPhysicalCutsheet,
  onRackClick,
  hoverRackId,
}: PathGraphProps) => {
  const [graphProp, setGraphProp] = useState<GraphProp>();
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
  const zoomBehaviorRef = useRef<
    d3Zoom.ZoomBehavior<SVGSVGElement, unknown> | null
  >(null);
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
    const basketTrays: RoomObject[] = [];
    room?.layout?.room?.objects.forEach((item: any, index: number) => {
      if (item.type.startsWith("BasketTray")) {
        basketTrays.push({
          ...item,
          id: index + "",
        });
      } else if (item.type.endsWith("Rack")) {
        racks.push(item);
      }
    });
    if (!racks.length) {
      setGraphProp(undefined);
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    racks.forEach((rack) => {
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
      basketTrays,
    });
  }, [room]);

  const renderRackInfo = (node: any) => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;
    const rackData = node?.["__data__"];
    const rackInfo = rackData?.label || rackData?.id || "";
    const bounds = getRackBounds(rackData?.coordinates || []);
    if (!bounds) return;

    const hoverX = bounds.maxX + RACK_HOVER_TEXT_OFFSET_X;
    const hoverY = bounds.minY + (bounds.maxY - bounds.minY - 20) / 2;
    if (!rackInfo) return;
    graphLayer
      .append("g")
      .attr("class", "rack-hover-text")
      .attr("key", rackData?.key || rackData?.label || rackData?.id || "")
      .append("rect")
      .attr("width", rackInfo.length * 10 + 15)
      .attr("height", 20)
      .attr("stroke", "grey")
      .attr("stroke-width", "1")
      .attr("fill", "lightgrey")
      .attr("x", hoverX)
      .attr("y", hoverY);

    graphLayer
      .selectAll("g.rack-hover-text")
      .append("text")
      .attr("x", hoverX + 5)
      .attr("y", hoverY)
      .attr("font-size", "1em")
      .html(
        `<tspan x=${hoverX + 5} dy='1em'>${rackInfo || ""}</tspan>
      `,
      );

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
  const raiseCutsheetRacks = () => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;

    racksWithPhysicalCutsheet.forEach((rackId) => {
      graphLayer.select(`g#node-group-rack-${rackId}`).raise();
    });
  };

  // inital node rendering
  useEffect(() => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;
    graphLayer.selectAll("*").remove();
    if (!graphProp) return;

    // rack node group handles the mouse over/out event
    graphLayer
      .selectAll("g.node-group-rack")
      .data(graphProp?.racks || [])
      .enter()
      .append("g")
      .attr("key", (d) => d.label || d.id || "")
      .attr("class", "node-group node-group-rack")
      .attr("id", (d) => "node-group-rack-" + d.label || d.id || "");

    graphLayer
      .selectAll("g.basket-tray-group")
      .data(graphProp?.basketTrays || [])
      .enter()
      .append("g")
      .attr("key", (d) => d.label || d.id || "")
      .attr("class", "basket-tray-group")
      .attr("id", (d) => "basket-tray-" + d.id || d.label || "");

    graphLayer
      .selectAll("g.node-group")
      .append("polygon")
      .attr("class", "rack-node-rect")
      .attr("id", (d: any) => d.id)
      .attr("points", (d: any) => getRackPolygonPoints(d.coordinates || []))
      .attr("stroke", (d: any) => {
        const rackId = d.label || d.id || "";
        if (racksWithPhysicalCutsheet.includes(rackId)) {
          return "darkgreen";
        }
        return "darkgrey";
      })
      .attr("fill", (d: any) => {
        const rackId = d.label || d.id || "";
        if (racksWithPhysicalCutsheet.includes(rackId)) {
          return "green";
        }
        return "lightblue";
      })
      .attr("stroke-width", "0.6")
      .attr("opacity", (d: any) => {
        const rackId = d.label || d.id || "";
        if (racksWithPhysicalCutsheet.includes(rackId)) {
          return "0.9";
        }
        return "0.8";
      })
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
          .attr("points", (d: any) => getRackPolygonPoints(d.coordinates || []));
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
      .attr("opacity", "0.3");

    graphLayer.selectAll(".node-group").raise();
    graphLayer.selectAll(".edge").lower();
    if (racksWithPhysicalCutsheet.length) {
      racksWithPhysicalCutsheet.forEach((rackId) => {
        graphLayer
          .selectAll("g#node-group-rack-" + rackId + " polygon")
          .attr("stroke", "darkgreen")
          .attr("fill", "green")
          .attr("opacity", "0.9")
          .on("click", function (_event, d: any) {
            const rackId = d.label || d.id || "";
            const hasCutsheet = racksWithPhysicalCutsheet.includes(rackId);
            onRackClick(rackId, hasCutsheet);
          });
      });
      raiseCutsheetRacks();
    }
  }, [graphProp]);

  useEffect(() => {
    const graphLayer = getGraphLayer();
    if (graphLayer.empty()) return;

    graphLayer
      .selectAll("g.node-group polygon")
      .attr("stroke", (d: any) => {
        const rackId = d.label || d.id || "";
        if (racksWithPhysicalCutsheet.includes(rackId)) {
          return "darkgreen";
        }
        return "darkgrey";
      })
      .attr("fill", (d: any) => {
        const rackId = d.label || d.id || "";
        if (racksWithPhysicalCutsheet.includes(rackId)) {
          return "green";
        }
        return "lightblue";
      })
      .attr("opacity", "0.9")
      .on("click", function (_event, d: any) {
        const rackId = d.label || d.id || "";
        const hasCutsheet = racksWithPhysicalCutsheet.includes(rackId);
        onRackClick(rackId, hasCutsheet);
      });

    raiseCutsheetRacks();
  }, [racksWithPhysicalCutsheet]);

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
                    .call(zoom.transform as any, d3.zoomIdentity.translate(50, 0));
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
