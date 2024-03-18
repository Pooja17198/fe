package com.oracle.pic.networking.lvv.frontend.canary.util;

import com.oracle.pic.networking.lvv.frontend.LvvFrontendClient;
import com.oracle.pic.networking.lvv.frontend.model.CreateLvvFrontendDetails;
import com.oracle.pic.networking.lvv.frontend.model.UpdateLvvFrontendDetails;
import com.oracle.pic.networking.lvv.frontend.requests.CreateLvvFrontendRequest;
import com.oracle.pic.networking.lvv.frontend.requests.DeleteLvvFrontendRequest;
import com.oracle.pic.networking.lvv.frontend.requests.GetLvvFrontendRequest;
import com.oracle.pic.networking.lvv.frontend.requests.ListLvvFrontendsRequest;
import com.oracle.pic.networking.lvv.frontend.requests.UpdateLvvFrontendRequest;
import com.oracle.pic.networking.lvv.frontend.responses.CreateLvvFrontendResponse;
import com.oracle.pic.networking.lvv.frontend.responses.DeleteLvvFrontendResponse;
import com.oracle.pic.networking.lvv.frontend.responses.GetLvvFrontendResponse;
import com.oracle.pic.networking.lvv.frontend.responses.ListLvvFrontendsResponse;
import com.oracle.pic.networking.lvv.frontend.responses.UpdateLvvFrontendResponse;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class LvvFrontendsUtils {
    private static final String TEST_DISPLAY_NAME = "lvvFrontendTest";

    public LvvFrontendsUtils(String endpoint) {
        log.debug("Endpoint: {}", endpoint);
    }

    public CreateLvvFrontendResponse createLvvFrontend(
            LvvFrontendClient client, String compartmentId, String name) {

        CreateLvvFrontendDetails createLvvFrontendDetails =
                CreateLvvFrontendDetails.builder()
                        .compartmentId(compartmentId)
                        .displayName(name)
                        .build();

        CreateLvvFrontendRequest createLvvFrontendRequest =
                CreateLvvFrontendRequest.builder()
                        .createLvvFrontendDetails(createLvvFrontendDetails)
                        .build();
        return client.createLvvFrontend(createLvvFrontendRequest);
    }

    public GetLvvFrontendResponse getLvvFrontend(
            LvvFrontendClient client, String lvvFrontendId, String opcRequestId) {
        GetLvvFrontendRequest getLvvFrontendRequest =
                GetLvvFrontendRequest.builder()
                        .lvvFrontendId(lvvFrontendId)
                        .opcRequestId(opcRequestId)
                        .build();
        return client.getLvvFrontend(getLvvFrontendRequest);
    }

    public UpdateLvvFrontendResponse updateLvvFrontend(
            LvvFrontendClient client, String lvvFrontendId, String name) {
        UpdateLvvFrontendDetails updateLvvFrontendDetails =
                UpdateLvvFrontendDetails.builder().displayName(name).build();

        UpdateLvvFrontendRequest updateLvvFrontendRequest =
                UpdateLvvFrontendRequest.builder()
                        .lvvFrontendId(lvvFrontendId)
                        .updateLvvFrontendDetails(updateLvvFrontendDetails)
                        .build();
        return client.updateLvvFrontend(updateLvvFrontendRequest);
    }

    public ListLvvFrontendsResponse listLvvFrontend(LvvFrontendClient client, String compartmentId) {

        ListLvvFrontendsRequest listLvvFrontendsRequest =
                ListLvvFrontendsRequest.builder()
                        .compartmentId(compartmentId)
                        .displayName(TEST_DISPLAY_NAME)
                        .build();
        return client.listLvvFrontends(listLvvFrontendsRequest);
    }

    public DeleteLvvFrontendResponse deleteLvvFrontend(
            LvvFrontendClient client, String lvvFrontendId, String opcRequestId) {

        DeleteLvvFrontendRequest deleteLvvFrontendRequest =
                DeleteLvvFrontendRequest.builder()
                        .lvvFrontendId(lvvFrontendId)
                        .opcRequestId(opcRequestId)
                        .build();
        return client.deleteLvvFrontend(deleteLvvFrontendRequest);
    }
}
