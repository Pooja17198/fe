package com.oracle.pic.networking.lvv.frontend.canary.executers;

import com.oracle.bmc.model.BmcException;
import com.oracle.pic.networking.lvv.frontend.LvvFrontendClient;
import com.oracle.pic.networking.lvv.frontend.canary.client.ExampleClientProvider;
import com.oracle.pic.networking.lvv.frontend.canary.util.LvvFrontendsUtils;
import com.oracle.pic.networking.lvv.frontend.responses.CreateLvvFrontendResponse;
import com.oracle.pic.telemetry.commons.metrics.Metrics;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;

@Slf4j
public class CreateResourceTestTask implements Runnable {
    private static final String CREATE_LVV_FRONTEND_CALL_METRIC_KEY =
            "lvv-frontend-canary.createLvvFrontendCall";
    private static final String TEST_DISPLAY_NAME = "lvvFrontendTest";
    private static final String INVALID_COMPARTMENT = "";

    private final ExampleClientProvider exampleClientProvider;
    private final String canaryTestCompartmentId;
    private final LvvFrontendsUtils lvvFrontendsUtils;

    public CreateResourceTestTask(
            ExampleClientProvider provider, String canaryTestCompartmentId, String endpoint)
            throws Exception {
        this.exampleClientProvider = provider;
        this.canaryTestCompartmentId = canaryTestCompartmentId;
        this.lvvFrontendsUtils = new LvvFrontendsUtils(endpoint);
    }

    @Override
    public void run() {
        try {
            executeCreateResourceTest();
            log.info("Create lvvFrontend test succeeded.");
        } catch (Exception e) {
            log.error("Error occurred while executing create lvvFrontend test", e);
        }
    }

    private void executeCreateResourceTest() {
        LvvFrontendClient client = exampleClientProvider.getClient();

        // Create LvvFrontend
        CreateLvvFrontendResponse createLvvFrontendResponse =
                lvvFrontendsUtils.createLvvFrontend(
                        client, canaryTestCompartmentId, TEST_DISPLAY_NAME);
        if (createLvvFrontendResponse != null
                && StringUtils.isNotBlank(createLvvFrontendResponse.getOpcRequestId())
                && createLvvFrontendResponse
                        .getLvvFrontend()
                        .getCompartmentId()
                        .equals(canaryTestCompartmentId)
                && createLvvFrontendResponse
                        .getLvvFrontend()
                        .getDisplayName()
                        .equals(TEST_DISPLAY_NAME)) {

            log.info("CreateLvvFrontend call succeeded.");
        } else {
            Metrics.emit(CREATE_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
            log.error("CreateLvvFrontend call failed.");
            return;
        }

        // Create LvvFrontend with invalid parameters
        try {
            // Expect to throw an error.
            CreateLvvFrontendResponse response =
                    lvvFrontendsUtils.createLvvFrontend(
                            client, INVALID_COMPARTMENT, TEST_DISPLAY_NAME);
            if (response != null) {
                Metrics.emit(CREATE_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
                log.error("CreateLvvFrontend with invalid compartmentId test failed.");
                return;
            }
        } catch (BmcException ex) {
            if (ex.getStatusCode() != 400) {
                Metrics.emit(CREATE_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
                log.error(
                        "CreateLvvFrontend call with invalid compartmentId failed, get status code {}, expected status code {}",
                        ex.getStatusCode(),
                        400,
                        ex);
                return;
            }
            Metrics.emit(CREATE_LVV_FRONTEND_CALL_METRIC_KEY, 1d);
            log.info("CreateLvvFrontend call with invalid compartmentId succeeded.");
        }
        // Clean up
        String lvvFrontendId = createLvvFrontendResponse.getLvvFrontend().getId();
        lvvFrontendsUtils.deleteLvvFrontend(
                client, lvvFrontendId, createLvvFrontendResponse.getOpcRequestId());
    }
}
