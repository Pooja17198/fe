package com.oracle.pic.networking.lvv.frontend.canary.executers;

import com.oracle.bmc.model.BmcException;
import com.oracle.pic.networking.lvv.frontend.LvvFrontendClient;
import com.oracle.pic.networking.lvv.frontend.canary.client.ExampleClientProvider;
import com.oracle.pic.networking.lvv.frontend.canary.util.LvvFrontendsUtils;
import com.oracle.pic.networking.lvv.frontend.responses.CreateLvvFrontendResponse;
import com.oracle.pic.networking.lvv.frontend.responses.UpdateLvvFrontendResponse;
import com.oracle.pic.telemetry.commons.metrics.Metrics;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;

@Slf4j
public class UpdateResourceTestTask implements Runnable {
    private static final String UPDATE_LVV_FRONTEND_CALL_METRIC_KEY =
            "lvv-frontend-canary.updateLvvFrontendCall";
    private static final String TEST_DISPLAY_NAME_1 = "lvvFrontendTest";
    private static final String TEST_DISPLAY_NAME_2 = "lvvFrontendTest2";
    private static final String INVALID_NAME = "";

    private final ExampleClientProvider exampleClientProvider;
    private final String canaryTestCompartmentId;
    private final LvvFrontendsUtils lvvFrontendsUtils;

    public UpdateResourceTestTask(
            ExampleClientProvider provider, String canaryTestCompartmentId, String endpoint)
            throws Exception {
        this.exampleClientProvider = provider;
        this.canaryTestCompartmentId = canaryTestCompartmentId;
        this.lvvFrontendsUtils = new LvvFrontendsUtils(endpoint);
    }

    @Override
    public void run() {
        try {
            executeUpdateLvvFrontend();
            log.info("Update lvvFrontend test succeeded.");
        } catch (Exception e) {
            log.error("Error occurred while executing UpdateLvvFrontend test", e);
        }
    }

    private void executeUpdateLvvFrontend() {
        LvvFrontendClient client = exampleClientProvider.getClient();

        CreateLvvFrontendResponse createLvvFrontendResponse =
                lvvFrontendsUtils.createLvvFrontend(
                        client, canaryTestCompartmentId, TEST_DISPLAY_NAME_1);
        if (createLvvFrontendResponse == null) {
            log.error("Create LvvFrontend call failed");
            return;
        }

        // Update LvvFrontend
        String lvvFrontendId = createLvvFrontendResponse.getLvvFrontend().getId();
        UpdateLvvFrontendResponse updateLvvFrontendResponse =
                lvvFrontendsUtils.updateLvvFrontend(client, lvvFrontendId, TEST_DISPLAY_NAME_2);
        if (updateLvvFrontendResponse != null
                && StringUtils.isNotBlank(updateLvvFrontendResponse.getOpcRequestId())
                && updateLvvFrontendResponse.getLvvFrontend().getId().equals(lvvFrontendId)
                && updateLvvFrontendResponse
                        .getLvvFrontend()
                        .getDisplayName()
                        .equals(TEST_DISPLAY_NAME_2)) {
            log.info("UpdateLvvFrontend call succeeded.");
        } else {
            Metrics.emit(UPDATE_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
            log.info("UpdateLvvFrontend call failed.");
            return;
        }
        // update LvvFrontend with invalid parameters.
        try {
            UpdateLvvFrontendResponse response =
                    lvvFrontendsUtils.updateLvvFrontend(client, lvvFrontendId, INVALID_NAME);
            if (response != null) {
                Metrics.emit(UPDATE_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
                log.error("UpdateLvvFrontend with invalid compartmentId test failed.");
                return;
            }
        } catch (BmcException ex) {
            if (ex.getStatusCode() != 400) {
                Metrics.emit(UPDATE_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
                log.error(
                        "UpdateLvvFrontend call with invalid displayName failed, get status code {}, expected status code {}",
                        ex.getStatusCode(),
                        400,
                        ex);
                return;
            }
            Metrics.emit(UPDATE_LVV_FRONTEND_CALL_METRIC_KEY, 1d);
            log.info("UpdateLvvFrontend call with invalid displayName succeeded.");
        }

        // Clean up
        lvvFrontendsUtils.deleteLvvFrontend(
                client, lvvFrontendId, createLvvFrontendResponse.getOpcRequestId());
    }
}
