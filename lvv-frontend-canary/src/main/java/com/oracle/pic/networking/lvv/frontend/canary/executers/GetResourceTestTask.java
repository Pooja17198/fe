package com.oracle.pic.networking.lvv.frontend.canary.executers;

import com.oracle.bmc.model.BmcException;
import com.oracle.pic.networking.lvv.frontend.LvvFrontendClient;
import com.oracle.pic.networking.lvv.frontend.canary.client.ExampleClientProvider;
import com.oracle.pic.networking.lvv.frontend.canary.util.LvvFrontendsUtils;
import com.oracle.pic.networking.lvv.frontend.responses.CreateLvvFrontendResponse;
import com.oracle.pic.networking.lvv.frontend.responses.GetLvvFrontendResponse;
import com.oracle.pic.telemetry.commons.metrics.Metrics;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class GetResourceTestTask implements Runnable {
    private static final String GET_LVV_FRONTEND_CALL_METRIC_KEY =
            "lvv-frontend-canary.getLvvFrontendCall";
    private static final String INVALID_OPC_REQUEST_ID = "";
    private static final String TEST_DISPLAY_NAME = "lvvFrontendTest";

    private final ExampleClientProvider exampleClientProvider;
    private final String canaryTestCompartmentId;
    private final LvvFrontendsUtils lvvFrontendsUtils;

    public GetResourceTestTask(
            ExampleClientProvider provider, String canaryTestCompartmentId, String endpoint)
            throws Exception {
        this.exampleClientProvider = provider;
        this.canaryTestCompartmentId = canaryTestCompartmentId;
        this.lvvFrontendsUtils = new LvvFrontendsUtils(endpoint);
    }

    @Override
    public void run() {
        try {
            executeGetLvvFrontend();
            log.info("Get lvvFrontend test succeeded.");
        } catch (Exception e) {
            log.error("Error occurred while executing GetLvvFrontend test", e);
        }
    }

    private void executeGetLvvFrontend() {
        LvvFrontendClient client = exampleClientProvider.getClient();

        CreateLvvFrontendResponse createLvvFrontendResponse =
                lvvFrontendsUtils.createLvvFrontend(
                        client, canaryTestCompartmentId, TEST_DISPLAY_NAME);
        if (createLvvFrontendResponse == null) {
            log.error("Create LvvFrontend call failed");
            return;
        }

        // Get LvvFrontend
        String lvvFrontendId = createLvvFrontendResponse.getLvvFrontend().getId();
        GetLvvFrontendResponse getLvvFrontendResponse =
                lvvFrontendsUtils.getLvvFrontend(
                        client, lvvFrontendId, createLvvFrontendResponse.getOpcRequestId());
        if (getLvvFrontendResponse != null
                && getLvvFrontendResponse.getLvvFrontend().getId().equals(lvvFrontendId)) {
            log.info("GetLvvFrontend call succeeded.");
        } else {
            Metrics.emit(GET_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
            log.error("GetLvvFrontend call failed.");
            return;
        }

        // Get LvvFrontend with invalid parameters.
        try {
            GetLvvFrontendResponse response =
                    lvvFrontendsUtils.getLvvFrontend(client, lvvFrontendId, INVALID_OPC_REQUEST_ID);
            if (response != null) {
                Metrics.emit(GET_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
                log.error("GetLvvFrontend with invalid compartmentId test failed.");
                return;
            }
        } catch (BmcException ex) {
            if (ex.getStatusCode() != 400) {
                Metrics.emit(GET_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
                log.error(
                        "GetLvvFrontend call with invalid opcRequestID failed, get status code {}, expected status code {}",
                        ex.getStatusCode(),
                        400,
                        ex);
                return;
            }
            Metrics.emit(GET_LVV_FRONTEND_CALL_METRIC_KEY, 1d);
            log.info("GetLvvFrontend call with invalid opcRequestID succeeded.");
        }

        // Clean up
        lvvFrontendsUtils.deleteLvvFrontend(
                client, lvvFrontendId, createLvvFrontendResponse.getOpcRequestId());
    }
}
