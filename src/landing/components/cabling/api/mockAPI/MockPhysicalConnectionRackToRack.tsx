import { makeResponseWithData, withDelay } from "./mockServiceHelper";
import racktorack from "./racktorack_aga5.2";

export class MockPhysicalConnectionRackToRackApi {
  public static async getPhysicalConnectionRackToRack(args: {
    roomName: string, sourceRackNumber: string, destinationRackNumber: string
  }): Promise<{ response: Response; data: any }> {
    return withDelay(() => {
      if (args.roomName) {
        return makeResponseWithData(racktorack);
      } else {
        return makeResponseWithData(undefined);
      }
    });
  }
}
