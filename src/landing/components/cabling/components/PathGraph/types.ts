// import { PhysicalConnectionSummary } from "gen/clients/ide-bom-client";

import { RoomObject } from "../../types";

export interface RackSummary {
  type: string;
  count: number;
}

export interface RacksInfo {
  id: string;
  name: string;
  type: string;
  roomName: string;
  opticSku: string;
}

export interface ConnectionGroupRackLayout {
  summary: RackSummary[];
  racks: RacksInfo[];
}

export interface ConnectionGroups {
  type: string;
  subType: string;
  id: string;
  isEnabled?: boolean;
  fabricOptions?: FabricType[];
  fabricType?: FabricType;
  rackLayout?: ConnectionGroupRackLayout;
  connections?: Connection[];
  skuOpticOptions?: OpticOption[];
}
export interface FabricType {
  id: string;
  name: string;
}

export interface OpticOption {
  id: string;
  name: string;
}

export interface PathEntry {
  destinationRackId: string;
  length: number;
  route: string;
  polyline: { x: number; y: number }[];
}

export interface OrginalNode {
  id?: number;
  x: number;
  y: number;
  attributes?: any;
}

export interface OrginalAdjacentEdge {
  weight?: number;
  widthMm?: number;
  trayFill?: any;
  edgeType: string[];
}

export interface Node extends OrginalNode {
  key: string;
}

export interface AdjacentEdge extends OrginalAdjacentEdge {
  src: string;
  des: string;
}

export interface RoomGraph {
  nodes: { [key: number]: OrginalNode };
  adjacencyList: { [key: number]: { [key: number]: OrginalAdjacentEdge } };
}

export interface Connection {
  id: string;
  roomName: string;
  sourceRackId: string;
  destinationRackId: string;
  timeCreated: string;
  status: string;
  cableType: string;
  cableCount: number;
  route: string;
  polyline: { x: number; y: number }[];
}

export enum PathsOverrideStatus {
  NoOverride = "0",
  OnlyPathOne = "1",
  OnlyPathTwo = "2",
  BothPaths = "3",
}

export interface FlattenedConnection {
  id: string;
  sourceRackId: string;
  destinationRackId: string;
  cableType: string;
  cableCount: number;
  paths: PathEntry[];
  isAbPathRequired: boolean;
  isAvenuePreferred: boolean;
  logicalConnection: string;
  pathsOverrideStatus: PathsOverrideStatus;
}

export interface OverrideInfo {
  overridenConnection: FlattenedConnection | null;
  selectedNodes: Node[];
  isOverriding: boolean;
  overridingBOrA: boolean; // only true for B, false for A andS Single
  awaitingConfirm: boolean;
  newNodelist: string[][];
  newPolyline: { x: number; y: number }[];
  overridenPaths: { [key: string]: FlattenedConnection };
}

export type HighlightsInfo = {
  // items: { [key: string]: PhysicalConnectionSummary[] };
  groupedByIds?: boolean;
  groupedBySrc?: boolean;
  groupedByDest?: boolean;
  isExpandSingle?: boolean;
};

export type GraphProp = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  scale: number;
  sizeRangeX: number;
  sizeRangeY: number;
  imageWidth: number;
  imageHeight: number;
  racks: RoomObject[];
  ohrRacks: RoomObject[];
  basketTrays: RoomObject[];
};

export interface RoomBomLayout {
  id: string;
  project: RoomProject;
  location: RoomLocation;
  market: SiteMarket;
  connectionLayout: ConnectionLayout;
}

export interface RoomProject {
  type: string;
  designType: string;
  roomDesignImages?: RoomDesignImage[];
  roomGraph?: any;
}

export interface RoomDesignImage {
  id: string;
  base64Content: string;
}

export interface RoomLocation {
  regionId: string;
  buildingId: string;
  roomId: string;
}

export interface SiteMarket {
  id: string;
  name: string;
}

export interface ConnectionLayout {
  connectionGroups: ConnectionGroups[];
}

export interface DxfRackAttribute {
  rackNumber: string;
  blockName: string;
  type: string;
  locationType: string;
  podNumber: string;
}

export interface DxfRack {
  id: string;
  layer: string;
  attributes: DxfRackAttribute;
  rotation: number;
  location_data: OrginalNode[];
  bottom_left: OrginalNode;
  top_right: OrginalNode;
}

export interface DxfBusketTrayAttribute {
  basketTrayType: string;
  name: string;
  metadata: string;
}

export interface DxfBusketTray {
  id: string;
  attributes: DxfBusketTrayAttribute;
  rotation: number;
  location_data: OrginalNode[];
  bottom_left: OrginalNode;
  top_right: OrginalNode;
}
