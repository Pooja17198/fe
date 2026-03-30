import { makeResponseWithData, withDelay } from "./mockServiceHelper";

import materials from "./materials";

export class MockMaterialApi {
  public static async listMaterial(args: any): Promise<{ response: Response; data: any }> {
    return withDelay(() => {
      return makeResponseWithData(materials);
    });
  }
}