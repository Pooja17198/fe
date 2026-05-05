import * as d3 from 'd3';
import {
  ConnectionGroups,
  Node,
  FlattenedConnection,
  GraphProp,
  PathsOverrideStatus,
} from './types';

export const getColorByEdge = (
  edgeType: string | undefined,
  muted: boolean,
): string => {
  if (muted) {
    switch (edgeType) {
      case 'JOIN':
      case 'NORMAL':
      case 'RACK':
        return '#d1cfcfff';
      case 'AVENUE':
        return '#adf9adff';
      case 'AVENUE_SPLICE':
        return '#f9f9b2ff';
      case 'STREET':
        return '#aaaafcff';
      case 'STREET_LOW_POP':
        return '#a3d9faff';
      case 'BRIDGE':
        return '#f8b0b0ff';
      case 'PATH_AVOID':
        return '#babafdff';
      case 'DISALLOW':
        return '#fabafaff';
      default:
        return '#babaf9ff';
    }
  }
  switch (edgeType) {
    case 'JOIN':
    case 'NORMAL':
    case 'RACK':
      return '#999999';
    case 'AVENUE':
      return '#00FF00';
    case 'AVENUE_SPLICE':
      return '#FFFF00';
    case 'STREET':
      return '#0000FF';
    case 'STREET_LOW_POP':
      return '#22AAFF';
    case 'BRIDGE':
      return '#FF0000';
    case 'PATH_AVOID':
      return '#4444FF';
    case 'DISALLOW':
      return '#FF00FF';
    default:
      return '#4444FF';
  }
};

const SINGLE_PATH_COLOR_SCHEME = [
  '#0000ffff',
  '#47aacbff',
  '#008ab8ff',
  '#00bfffff',
  '#57a2fdff',
  '#2c8afdff',
  '#0073ffff',
  '#4d4dfbff',
  '#3131fdff',
  '#2f2ffeff',
];
const sum = (a: Number[]) => eval(a.join('+'));

export const getPathColor = (
  route: string | undefined,
  id?: string,
): string => {
  switch (route) {
    case 'SINGLE':
      if (!id) return SINGLE_PATH_COLOR_SCHEME[0];
      const getIndexFromId =
        sum(
          id
            .replace(/\D/g, '')
            .split('')
            .map((digit) => new Number(digit)),
        ) % 10;
      return SINGLE_PATH_COLOR_SCHEME[getIndexFromId];
    case 'A':
      return '#ffd800';
    case 'B':
      return 'red';
    default:
      return 'blue';
  }
};

export const calculateScaledX = (
  x: number,
  graphProp: GraphProp | undefined,
  convertToMM?: boolean,
): number => {
  if (graphProp) {
    x = x * (convertToMM ? 25.4 : 1); // convert to mm
    let actualX = x - graphProp.minX; // 0..pointX actual
    actualX -= graphProp.sizeRangeX * 0.5;
    const imageX = actualX * graphProp.scale; // 0..pointX image
    const cenX = graphProp.imageWidth / 2.0;
    return cenX + imageX; // centered in image, within 0..image X
  }
  return 0;
};

export const calculateScaledY = (
  y: number,
  graphProp: GraphProp | undefined,
  convertToMM?: boolean,
): number => {
  // flip Y
  // computer graphics: +Y = down
  // drawing:           +Y = up
  if (graphProp) {
    y = y * (convertToMM ? 25.4 : 1); // convert to mm
    let actualY = y - graphProp.minY; // 0..Y actual (flipped)
    actualY -= graphProp.sizeRangeY * 0.5;
    const imageY = actualY * graphProp.scale; // 0..Y image
    const cenY = graphProp.imageHeight / 2.0;
    return cenY + imageY; // centered in image, within 0..image Y
  }
  return 0;
};

export const flattenConnections = (
  connectionGroups: ConnectionGroups[] | undefined,
): {flattenedConnections: FlattenedConnection[],
  srcRackSet: Set<string>,
  destRackSet: Set<string>,
  rackMapping: Map<string, Set<string>>
} => {
  const flattenedConnections: FlattenedConnection[] = [];
  const srcRackSet: Set<string> = new Set();
  const destRackSet: Set<string> = new Set(); 
  const rackMapping: Map<string, Set<string>> = new Map(); 
  const result = {
    flattenedConnections,
    srcRackSet,
    destRackSet,
    rackMapping
  };
  if (!connectionGroups || !connectionGroups.length)
    return result;
  connectionGroups.forEach((group, groupIndex) => {
    if (!group.connections) return;
    group.connections.forEach((connection: any, entryIndex: number) => {
      if (!connection.computedPaths?.length) return;
      connection.computedPaths.forEach((computedPath: any, computedPathIndex: number) => {
        const { sourceRackId, paths, destinationRackIds } = computedPath;

        if (!paths.length || !destinationRackIds.length) return;
        const destinationRackId = destinationRackIds[0];
        const flattenedConnection: FlattenedConnection = {
          id: `${sourceRackId}-${destinationRackId}-${groupIndex}-${entryIndex}-${computedPathIndex}`,
          logicalConnection: connection.logicalConnection,
          sourceRackId: sourceRackId,
          destinationRackId: destinationRackId,
          cableType: connection.cable.cableType,
          cableCount: connection.cable.cableCount,
          paths: paths,
          isAbPathRequired: connection.isAbPathRequired,
          isAvenuePreferred: connection.isAvenuePreferred,
          pathsOverrideStatus: PathsOverrideStatus.NoOverride,
        };
        flattenedConnections.push(flattenedConnection);
        srcRackSet.add(sourceRackId);
        destRackSet.add(destinationRackId);

        if(!rackMapping.has(sourceRackId)) {
          rackMapping.set(sourceRackId, new Set<string>());}
        if(!rackMapping.has(destinationRackId)) {
          rackMapping.set(destinationRackId, new Set<string>());}
        rackMapping.get(sourceRackId)?.add(destinationRackId);
        rackMapping.get(destinationRackId)?.add(sourceRackId);
      });
    });
  });
  return result;
};

export const findNodeById = (nodes: Node[], id: string, isRack: boolean) => {
  if (isRack) {
    return nodes.find((node) => node.attributes?.rackAttributes?.rackId === id);
  } else {
    nodes.find((node) => node.key === id);
  }
};


export const addOffset = (
  polylines: {
    pointX: number;
    pointY: number;
  }[][],
  graphProp: GraphProp | undefined,
) => {
  if (polylines.length <= 1) return polylines;
  const series = polylines.map((lines, seriesIndex) => {
    return {
      p: lines.map((xy: any) => {
        return {
          id: xy.pointX + '_' + xy.pointY,
          pointX: calculateScaledX(xy.pointX, graphProp),
          pointY: calculateScaledY(xy.pointY, graphProp),
          series: [] as any,
          children: [] as any,
        };
      }),
      pWithOffset: {} as any,
      leafNode: null,
      seriesIndex: seriesIndex,
    };
  });

  var root = {
    pointX: series[0].p[0].pointX,
    pointY: series[0].p[0].pointY,
    series: [] as any[],
    direction: -Math.PI / 2,
    children: [] as any[],
  };

  const offsetNodeMap = new Map();
  offsetNodeMap.set('root', root);
  let index = 0;
  //create nodes, link each series to the corresponding leaf
  series.forEach((s) => {
    s.pWithOffset = {}; //this will be filled later on

    var parent = root;
    s.p.forEach(function (d, index) {
      var n = offsetNodeMap.get(d.id);
      if (!n) {
        //create node at given coordinates if does not exist
        n = {
          index: index++,
          id: d.id,
          pointX: d.pointX,
          pointY: d.pointY,
          parent: parent,
          series: [],
          // direction: Math.atan2(d.y - parent.y,d.pointX - parent.pointX),
          visted: false,
          setOffset: false,
        };
        offsetNodeMap.set(n.id, n);
      }

      //add node to the parent's children
      if (!parent.children) parent.children = [];

      parent.children.push(n);
      //this node is the parent of the next one
      parent = n;
    });
    //last node is the leaf of this series
    s.leafNode = parent as any;
    parent.series.push(s);
  });

  // //sort children by direction
  // Object.values(offsetNodeMap).forEach(function (n) {
  //   if (!n.children?.length) return;
  //   n.children.sort(function (a: any, b: any) {
  //     if (a.direction > n.direction) return a.direction - b.direction;
  //   });
  // });

  //recursively list all series through each node (bottom-up)
  const listSeries = (n: any) => {
    if (!n.children?.length || n.visted) return n.series;
    n.visted = true;
    const childrenSeries = n.children.map(listSeries);
    const set = new Set(
      d3.merge(
        n.children.map(function (c: any) {
          return c.series;
        }, childrenSeries),
      ),
    );
    n.series = Array.from(set);
    return n.series;
  };
  listSeries(root);
  //compute offsets for each series in each node, and add them as a list to the corresponding series
  //in a first time, this is not centered

  // const offsetNodes = new Set<string>();
  // const listOffsets = (n: any) => {
  //   if(offsetNodes.has(n.index)) return;
  //   offsetNodes.add(n.index);
  //   var newOffset = 0;
  //   n.series.forEach((s: any) => {
  //     s.pWithOffset[n.id] = { node: n, offset: newOffset + 1 };
  //     newOffset += 2;
  //   });
  //   n.totalOffset = newOffset;
  //   // if (n.setOffset) return;
  //   // n.setOffset = true;
  //   if (n.children) {
  //     n.children.forEach((child: any) => {
  //       if(!offsetNodes.has(child.index)) {
  //         listOffsets(child);
  //       }
  //     });
  //   }
  //   offsetNodes.delete(n.index);
  // };

  const listOffsets = (rootNode: any) => {
    rootNode.children.forEach((child: any) => {
      child.series.forEach((s: any, index: number) => {
        s.p.forEach((n: any) => {
          s.pWithOffset[n.id] = { node: n, offset: index * 2 + 1 };
          n.totalOffset = n.series.length * 2;
        });
      });
    });
  };

  listOffsets(root);

  const newPolyLines = series.map((s) => {
    return s.p.map((p) => {
      const offsetP = s.pWithOffset[p.id];
      if (!offsetP) {
        return {
          pointX: p.pointX,
          pointY: p.pointY,
        };
      }
      const node = (offsetP as any).node;
      const offset = (offsetP as any).offset;
      const isOdd = s.seriesIndex % 2 === 0;
      if (isOdd) {
        return {
          pointX: node.pointX + (offset - node.totalOffset / 2),
          pointY: node.pointY - (offset - node.totalOffset / 2),
        };
      }

      return {
        pointX: node.pointX - (offset - node.totalOffset / 2),
        pointY: node.pointY + (offset - node.totalOffset / 2),
      };
    });
  });

  return newPolyLines;
};
