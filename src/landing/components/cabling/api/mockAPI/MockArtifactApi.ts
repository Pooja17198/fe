import {makeResponseWithData, withDelay} from "./mockServiceHelper";
import artifacts from "./artifacts";
import artifactLink from "./artifactLink";
import { BuildArtifactCollection, ParResponseObject } from "gen/clients/ide-lvv-client";

export class MockArtifactApi {
    public static async getBuildArtifacts(args: {
        roomName?: string;
    }): Promise<{ response: Response; data: BuildArtifactCollection }> {
        return withDelay(() => {
            return makeResponseWithData(artifacts);
        });
    }

    public static  async downloadArtifact(args: {
        roomName?: string;
        filePath?: string;
    }): Promise<{ response: Response; data: ParResponseObject }> {
        return withDelay(() => {
            return makeResponseWithData({ par: artifactLink});
        })
    }
}