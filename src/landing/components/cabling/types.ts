export interface AdrBuilding {
  /**
   * Region Display Name
   */
  regionDisplayName: string;
  /**
   * Availability Domain Canonical Short Name
   */
  availabilityDomainCanonicalShortCode: string;
  /**
   * Building Canonical Name
   */
  buildingCanonicalName: string;
  /**
   * Room Canonical Name
   */
  roomCanonicalName: string;
}

export interface DataCenterRackRow {
  /**
   * Row number of the rack row.
   */
  rowNumber: string;
  /**
   * List of rack ranges
   */
  rackRange?: Array<string>;
}

export interface DataCenterRoom {
  /**
   * Data Center Room Name
   */
  roomName: string;
  /**
   * Data Center Region
   */
  region?: string;
  /**
   * Data Center Availability Domain
   */
  availabilityDomain?: string;
  /**
   * Data Center Building
   */
  building?: string;
  /**
   * Data Center Room Power
   */
  roomPower?: string;
  /**
   * Data Center Rack Rows
   */
  rackRows?: Array<DataCenterRackRow>;
}

export interface RoomObject {
  coordinates: [number, number][];
  type: string;
  label?: string;
  id?: string;
}

export interface Room {
  building_name: string;
  canonical_name: string;
  display_name: string;
  name: string;
  objects: RoomObject[];
  tile_offset: number[];
  tile_size: number;
  walls: [number, number][];
}

export interface RawAtlasRoomData {
  name: string;
  room: Room;
  ticket: string;
  updated_at: string;
  updated_by: string;
  version: string;
}
