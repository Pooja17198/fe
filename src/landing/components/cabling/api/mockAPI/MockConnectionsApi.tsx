import { makeResponseWithData, withDelay } from "./mockServiceHelper";

import connections from "./connection_abl17.1";

export class MockConnectionsApi {
  public static async getConnections(args: {
    roomName: string;
  }): Promise<{ response: Response; data: any }> {
    return withDelay(() => {
      if (args.roomName) {
        return makeResponseWithData(connections);
      } else {
        return makeResponseWithData(undefined);
      }
    });
  }
}
