package com.oracle.pic.networking.lvv.frontend.canary.executers;

import com.oracle.bmc.model.BmcException;
import com.oracle.pic.networking.lvv.frontend.LvvFrontendClient;
import com.oracle.pic.networking.lvv.frontend.canary.client.ExampleClientProvider;
import com.oracle.pic.networking.lvv.frontend.canary.util.LvvFrontendsUtils;
import com.oracle.pic.networking.lvv.frontend.model.LvvFrontendSummary;
import com.oracle.pic.networking.lvv.frontend.responses.CreateLvvFrontendResponse;
import com.oracle.pic.networking.lvv.frontend.responses.ListLvvFrontendsResponse;
import com.oracle.pic.telemetry.commons.metrics.Metrics;
import java.util.List;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class ListResourceTestTask implements Runnable {
    private static final String LIST_LVV_FRONTEND_CALL_METRIC_KEY =
            "lvv-frontend-canary.listLvvFrontendCall";
    private static final String TEST_DISPLAY_NAME = "lvvFrontendTest";
    private static final String INVALID_COMPARTMENT = "";

    private final ExampleClientProvider exampleClientProvider;
    private final String canaryTestCompartmentId;
    private final LvvFrontendsUtils lvvFrontendsUtils;

    public ListResourceTestTask(
            ExampleClientProvider provider, String canaryTestCompartmentId, String endpoint)
            throws Exception {
        this.exampleClientProvider = provider;
        this.canaryTestCompartmentId = canaryTestCompartmentId;
        this.lvvFrontendsUtils = new LvvFrontendsUtils(endpoint);
    }

    @Override
    public void run() {
        try {
            executeListLvvFrontend();
            log.info("List lvvFrontend test succeeded.");
        } catch (Exception e) {
            log.error("Error occurred while executing ListLvvFrontend test", e);
        }
    }

    private void executeListLvvFrontend() {
        LvvFrontendClient client = exampleClientProvider.getClient();

        CreateLvvFrontendResponse createLvvFrontendResponse =
                lvvFrontendsUtils.createLvvFrontend(
                        client, canaryTestCompartmentId, TEST_DISPLAY_NAME);
        if (createLvvFrontendResponse == null) {
            log.error("Create LvvFrontend call failed");
            return;
        }

        // List LvvFrontend
        ListLvvFrontendsResponse listLvvFrontendsResponse =
                lvvFrontendsUtils.listLvvFrontend(client, canaryTestCompartmentId);
        List<LvvFrontendSummary> lvvFrontendSummaries =
                listLvvFrontendsResponse.getLvvFrontendCollection().getItems();
        boolean listLvvFrontendSuccess = true;
        for (LvvFrontendSummary summary : lvvFrontendSummaries) {
            if (!summary.getCompartmentId().equals(canaryTestCompartmentId)
                    || !summary.getDisplayName().equals(TEST_DISPLAY_NAME)) {
                listLvvFrontendSuccess = false;
                break;
            }
        }
        log.info("ListLvvFrontend call {}", listLvvFrontendSuccess ? "succeeded." : "failed.");
        if (!listLvvFrontendSuccess) {
            Metrics.emit(LIST_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
            return;
        }

        // list LvvFrontend with invalid parameters.
        try {
            ListLvvFrontendsResponse response =
                    lvvFrontendsUtils.listLvvFrontend(client, INVALID_COMPARTMENT);
            if (response != null) {
                Metrics.emit(LIST_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
                log.error("ListLvvFrontend with invalid compartmentId test failed.");
                return;
            }
        } catch (BmcException ex) {
            if (ex.getStatusCode() != 400) {
                Metrics.emit(LIST_LVV_FRONTEND_CALL_METRIC_KEY, 0d);
                log.error(
                        "ListLvvFrontend call with invalid compartmentId failed, get status code {}, expected status code {}",
                        ex.getStatusCode(),
                        400,
                        ex);
                return;
            }
            Metrics.emit(LIST_LVV_FRONTEND_CALL_METRIC_KEY, 1d);
            log.info("ListLvvFrontend call with invalid compartmentId succeeded.");
        }

        // Clean up
        String lvvFrontendId = createLvvFrontendResponse.getLvvFrontend().getId();
        lvvFrontendsUtils.deleteLvvFrontend(
                client, lvvFrontendId, createLvvFrontendResponse.getOpcRequestId());
    }
}
