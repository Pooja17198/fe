import { makeResponseWithData, withDelay } from "./mockServiceHelper";

import room from "./dxf_abl17.1";
import { RoomLayout, RoomPlatform } from "gen/clients/ide-lvv-client";
import roomRackMetadata from "./roomRackMetadata.json";

const roomPlatformData = roomRackMetadata as RoomPlatform[];

export class MockRoomLayoutApi {
  public static async getRoomLayout(args: {
    roomName: string;
  }): Promise<{ response: Response; data: RoomLayout }> {
    return withDelay(() => {
        return makeResponseWithData(room);
    });
  }
}

export class MockRoomPlatformApi {
  public static async getPlatformListByRoom(
    _args: { roomName: string },
  ): Promise<{ response: Response; data: RoomPlatform[] }> {
    return withDelay(() => makeResponseWithData(roomPlatformData));
  }
}
