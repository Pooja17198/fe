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
  const svgElement = d3.select(svgRef.current as Element);

  const viewportRef = useRef<HTMLDivElement>(null);
  function zoomed({ transform }: any) {
    svgElement.attr("transform", transform);
  }

  const zoom = d3Zoom.zoom().scaleExtent([0.8, 10]).on("zoom", zoomed);

  // calculate max, min, scale, range on x/y, and set in GraphProp state
  useEffect(() => {
    svgElement.selectAll("*").remove();
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

    // setup zoom in/zoom out and pan over
    const zoom = d3Zoom
      .zoom()
      .scaleExtent([1, 10])
      .on("zoom", (e) => {
        svgElement.attr("transform", e.transform);
        // let size = NOMINAL_SCALE;
        // let tx = 1;
        // d3.selectAll('.rack-node-text').remove();

        // if (NOMINAL_SCALE * e.transform.k > MAX_SCALE) {
        //   size = MAX_SCALE / e.transform.k;
        //   tx = e.transform.k / MAX_SCALE;
        //   svgElement
        //     .selectAll('g.node-group')
        //     .append('text')
        //     .attr('class', 'rack-node-text')
        //     .attr('key', (d: Node) => d.key)
        //     .attr('x', (d: Node) => calculateScaledX(d.x))
        //     .attr('y', (d: Node) => calculateScaledY(d.y))
        //     .attr('dx', '-3')
        //     .attr('dy', '-1')
        //     .attr('font-size', '0.2em')
        //     .text((d: Node) => d.attributes?.rackAttributes?.rackId || d.id);
        // }
        // d3.selectAll('.rack-node-text').raise();
      });

    svgElement
      .call(zoom)
      // .on("mousedown.zoom", null)
      // .on("touchstart.zoom", null)
      // .on("touchmove.zoom", null)
      // .on("touchend.zoom", null)
      .on("dblclick.zoom", null);
  }, [room]);

  const renderRackInfo = (d: any, node: any) => {
    const rackInfo = node["__data__"].label;
    const { offsetX, offsetY } = d;
    if (!rackInfo) return;
    svgElement
      .append("g")
      .attr("class", "rack-hover-text")
      .attr("key", d.key)
      .append("rect")
      .attr("width", rackInfo.length * 10 + 15)
      .attr("height", 20)
      .attr("stroke", "grey")
      .attr("stroke-width", "1")
      .attr("fill", "lightgrey")
      .attr("x", offsetX + 20)
      .attr("y", offsetY);

    svgElement
      .selectAll("g.rack-hover-text")
      .append("text")
      .attr("x", offsetX + 25)
      .attr("y", offsetY)
      .attr("font-size", "1em")
      .html(
        `<tspan x=${offsetX + 25} dy='1em'>${rackInfo || ""}</tspan>
      `,
      );

    d3.selectAll(`.rack-hover-text`).raise();
  };
  // helper: enlarge a rack polygon and show label, same as mouseover
  const enlargeRackById = (rackId: string) => {
    if (!graphProp) return;
    const sel = svgElement.select(`g#node-group-rack-${rackId} polygon`);
    if (sel.empty()) return;

    const data: any = (sel.node() as any)?.__data__;
    if (!data || !data.coordinates) return;

    sel
      .transition()
      .duration(100)
      .attr("points", (d: any) => {
        const coords = data.coordinates || [];
        const xs = coords.map((c: [number, number]) => c[0]);
        const ys = coords.map((c: [number, number]) => c[1]);

        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        return (coords || [])
          .map((pt: any) => {
            const x = pt[0];
            const y = pt[1];
            const left = x <= (minX + maxX) / 2;
            const top = y <= (minY + maxY) / 2;
            return [
              calculateScaledX(x, graphProp, true) + (left ? -5 : 5),
              calculateScaledY(y, graphProp, true) + (top ? 5 : -5),
            ].join(",");
          })
          .join(" ");
      });

    // approximate mouse position to reuse renderRackInfo; we can take first coordinate
    const first = data.coordinates[0];
    const dLike = {
      offsetX: calculateScaledX(first[0], graphProp, true),
      offsetY: calculateScaledY(first[1], graphProp, true),
    };
    renderRackInfo(dLike, sel.node() as Element);
  };

  // helper: reset rack polygon and remove label, same as mouseout
  const resetRackById = (rackId: string) => {
    if (!graphProp) return;
    const sel = svgElement.select(`g#node-group-rack-${rackId} polygon`);
    if (sel.empty()) return;

    const data: any = (sel.node() as any)?.__data__;
    if (!data || !data.coordinates) return;

    sel
      .transition()
      .duration(200)
      .attr("points", (d: any) => {
        return (data.coordinates || [])
          .map((pt: any) => {
            return [
              calculateScaledX(pt[0], graphProp, true),
              calculateScaledY(pt[1], graphProp, true),
            ].join(",");
          })
          .join(" ");
      });

    d3.selectAll(".rack-hover-text").remove();
  };

  // inital node rendering
  useEffect(() => {
    const svgElement = d3.select(svgRef.current as Element);
    d3.selectAll(".node-group").remove();
    if (!graphProp) return;

    // rack node group handles the mouse over/out event
    svgElement
      .selectAll(".visualizer")
      .data(graphProp?.racks || [])
      .enter()
      .append("g")
      .attr("key", (d) => d.label || d.id || "")
      .attr("class", "node-group node-group-rack")
      .attr("id", (d) => "node-group-rack-" + d.label || d.id || "");

    svgElement
      .selectAll(".visualizer")
      .data(graphProp?.basketTrays || [])
      .enter()
      .append("g")
      .attr("key", (d) => d.label || d.id || "")
      .attr("class", "basket-tray-group")
      .attr("id", (d) => "basket-tray-" + d.id || d.label || "");

    svgElement
      .selectAll("g.node-group")
      .append("polygon")
      .attr("class", "rack-node-rect")
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
          .attr("points", (d: any) => {
            const coords = d.coordinates || [];
            // Determine min/max for x and y across all four points
            const xs = coords.map((c: [number, number]) => c[0]);
            const ys = coords.map((c: [number, number]) => c[1]);

            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            return (d.coordinates || [])
              .map((d: any) => {
                const x = d[0];
                const y = d[1];
                const left = x <= (minX + maxX) / 2;
                const top = y <= (minY + maxY) / 2;
                return [
                  calculateScaledX(x, graphProp, true) + (left ? -5 : 5),
                  calculateScaledY(y, graphProp, true) + (top ? 5 : -5),
                ].join(",");
              })
              .join(" ");
          });
        renderRackInfo(d, d3.select(this).node() as Element);
      })
      .on("mouseout", function (d: any, node: any) {
        if (hoverRackId === (node.label || node.id)) return;
        d3.select(this)
          .transition()
          .duration(200)
          .attr("points", (d: any) => {
            return (d.coordinates || [])
              .map((d: any) => {
                return [
                  calculateScaledX(d[0], graphProp, true),
                  calculateScaledY(d[1], graphProp, true),
                ].join(",");
              })
              .join(" ");
          });
        d3.selectAll(".rack-hover-text").remove();
      });
    // basket trays connections
    svgElement
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

    d3.selectAll(".node-group").raise();
    d3.selectAll(".edge").lower();
    const currentTransform = d3.zoomTransform(svgElement.node() as Element);
    svgElement
      .transition()
      .duration(100)
      .call(zoom.transform, currentTransform.translate(50, 0));
    if (racksWithPhysicalCutsheet.length) {
      racksWithPhysicalCutsheet.forEach((rackId) => {
        svgElement
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
    }
  }, [graphProp]);

  useEffect(() => {
    svgElement
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

  const handleMove = (x: number, y: number) => {
    if (svgElement) {
      const currentTransform = d3.zoomTransform(svgElement.node() as Element);
      // Apply a new transform with a translation to the left
      svgElement
        .transition()
        .duration(100)
        .call(zoom.transform, currentTransform.translate(x, y));
    }
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
                svgElement.transition().call(zoom.scaleBy, 1.2);
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
                svgElement.transition().call(zoom.scaleBy, 0.8);
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
                svgElement
                  .transition()
                  .call(zoom.transform, d3.zoomIdentity.translate(50, 0));
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
