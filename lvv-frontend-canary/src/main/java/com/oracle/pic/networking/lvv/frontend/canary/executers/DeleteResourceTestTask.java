package com.oracle.pic.networking.lvv.frontend.canary.executers;

import com.oracle.bmc.model.BmcException;
import com.oracle.pic.networking.lvv.frontend.LvvFrontendClient;
import com.oracle.pic.networking.lvv.frontend.canary.client.ExampleClientProvider;
import com.oracle.pic.networking.lvv.frontend.canary.util.LvvFrontendsUtils;
import com.oracle.pic.networking.lvv.frontend.responses.CreateLvvFrontendResponse;
import com.oracle.pic.networking.lvv.frontend.responses.DeleteLvvFrontendResponse;
import com.oracle.pic.telemetry.commons.metrics.Metrics;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;

@Slf4j
public class DeleteResourceTestTask implements Runnable {
    private static final String DELETE_LVV_FRONTEND_CALL_METRIC_KEY =
            "lvv-frontend-canary.deleteLvvFrontendCall";
    private static final String INVALID_OPC_REQUEST_ID = "";
    private static final String TEST_DISPLAY_NAME = "lvvFrontendTest";

    private final ExampleClientProvider exampleClientProvider;
    private final String canaryTestCompartmentId;
    private final LvvFrontendsUtils lvvFrontendsUtils;

    public DeleteResourceTestTask(
            ExampleClientProvider provider, String canaryTestCompartmentId, String endpoint)
            throws Exception {
        this.exampleClientProvider = provider;
        this.canaryTestCompartmentId = canaryTestCompartmentId;
        this.lvvFrontendsUtils = new LvvFrontendsUtils(endpoint);
    }

    @Override
    public void run() {
        try {
            executeDeleteResourceTest();
            log.info("Delete lvvFrontend test succeeded.");
        } catch (Exception e) {
            log.error("Error occurred while executing delete lvvFrontend test", e);
        }
    }

    private void executeDeleteResourceTest() {
        LvvFrontendClient client = exampleClientProvider.getClient();

        CreateLvvFrontendResponse createLvvFrontendResponse =
                lvvFrontendsUtils.createLvvFrontend(
                        client, canaryTestCompartmentId, TEST_DISPLAY_NAME);
        if (createLvvFrontendResponse == null) {
            log.error("Create LvvFrontend call failed");
            return;
        }

        // Delete LvvFrontend
        String lvvFrontendId = createLvvFrontendResponse.getLvvFrontend().getId();
        DeleteLvvFrontendResponse deleteLvvFrontendResponse =
                lvvFrontendsUtils.deleteLvvFrontend(
                        client, lvvFrontendId, createLvvFrontendResponse.getOpcRequestId());
        if (deleteLvvFrontendResponse != null
                && StringUtils.isNotBlank(deleteLvvFrontendResponse.getOpcRequestId())) {
            log.info("DeleteLvvFrontend call succeeded.");
        } else {
            Metrics.emit(DELETE_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
            log.info("DeleteLvvFrontend call failed.");
            return;
        }

        // delete LvvFrontend with invalid parameters.
        try {
            DeleteLvvFrontendResponse response =
                    lvvFrontendsUtils.deleteLvvFrontend(client, lvvFrontendId, INVALID_OPC_REQUEST_ID);
            if (response != null) {
                Metrics.emit(DELETE_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
                log.error("DeleteLvvFrontend with invalid compartmentId test failed.");
                return;
            }
        } catch (BmcException ex) {
            if (ex.getStatusCode() != 400) {
                Metrics.emit(DELETE_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
                log.error(
                        "DeleteLvvFrontend call with invalid opcRequestId failed, get status code {}, expected status code {}",
                        ex.getStatusCode(),
                        400,
                        ex);
                return;
            }
            Metrics.emit(DELETE_LVV_FRONTEND_CALL_METRIC_KEY, 1d);
            log.info("DeleteLvvFrontend call with invalid opcRequestId succeeded.");
        }
    }
}
