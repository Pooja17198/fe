import { makeResponseWithData, withDelay } from "./mockServiceHelper";

import room from "./dxf_abl17.1";
import { RoomLayout } from "gen/clients/ide-lvv-client";

export class MockRoomLayoutApi {
  public static async getRoomLayout(args: {
    roomName: string;
  }): Promise<{ response: Response; data: RoomLayout }> {
    return withDelay(() => {
        return makeResponseWithData(room);
    });
  }
}
