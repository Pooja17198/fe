import { useQuery } from "@ehrc/preact-hooks";
import {MockArtifactApi} from "../mockAPI/MockArtifactApi";
import { BuildArtifactsApiClient } from "../apiClients";
import { BuildArtifactCollection, ParResponseObject } from "gen/clients/ide-lvv-client";

export const useBuildartifacts = (mockData?: boolean)=> {
    return useQuery<BuildArtifactCollection, [string]>(
        {
            queryFn: mockData
                ? (roomName: string) =>
                    MockArtifactApi.getBuildArtifacts({ roomName })
                        .then(response => response.data)
                : (roomName: string) =>
                    BuildArtifactsApiClient.listBuildArtifacts({ roomName })
                        .then(response => response.data),
            enabled: false,
        }
    )
}

export const useDownloadArtifact = (
    mockData?: boolean,
    onSuccess?: () => void
) => {
    return useQuery<ParResponseObject, [string, string]>(
        {
            queryFn: mockData
                ? (queryRoomName: string, queryFilePath: string) =>
                    MockArtifactApi.downloadArtifact({
                        roomName: queryRoomName,
                        filePath: queryFilePath
                    }).then(res => res.data)
                : (queryRoomName: string, queryFilePath: string) =>
                    BuildArtifactsApiClient.downloadBuildArtifact({
                        roomName: queryRoomName,
                        filePath: queryFilePath
                    }).then(response => response.data),
            enabled: false,
            onSuccess: () => onSuccess && onSuccess()
        }
    )
}