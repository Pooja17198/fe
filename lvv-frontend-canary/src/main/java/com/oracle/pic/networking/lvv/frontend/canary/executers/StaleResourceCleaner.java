package com.oracle.pic.networking.lvv.frontend.canary.executers;

import com.oracle.pic.networking.lvv.frontend.LvvFrontendClient;
import com.oracle.pic.networking.lvv.frontend.canary.client.ExampleClientProvider;
import com.oracle.pic.networking.lvv.frontend.canary.util.LvvFrontendsUtils;
import com.oracle.pic.networking.lvv.frontend.model.LvvFrontendSummary;
import com.oracle.pic.networking.lvv.frontend.responses.ListLvvFrontendsResponse;
import java.util.Date;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.time.DateUtils;

@Slf4j
public class StaleResourceCleaner implements Runnable {
    private final ExampleClientProvider exampleClientProvider;
    private final String canaryTestCompartmentId;
    private final LvvFrontendsUtils lvvFrontendsUtils;

    private static final int ELIGIBLE_AGE_IN_HOURS = 1; // The eligible age of lvvFrontend, 1h.

    public StaleResourceCleaner(
            ExampleClientProvider provider, String canaryTestCompartmentId, String endpoint)
            throws Exception {
        this.exampleClientProvider = provider;
        this.canaryTestCompartmentId = canaryTestCompartmentId;
        this.lvvFrontendsUtils = new LvvFrontendsUtils(endpoint);
    }

    @Override
    public void run() {
        try {
            cleanupStaledResources();
            log.info("Cleaned all staled resources.");
        } catch (Exception e) {
            log.error("Error occurred while executing clean stale resource", e);
        }
    }

    private void cleanupStaledResources() {
        LvvFrontendClient client = exampleClientProvider.getClient();

        ListLvvFrontendsResponse listLvvFrontendsResponse =
                lvvFrontendsUtils.listLvvFrontend(client, canaryTestCompartmentId);
        List<LvvFrontendSummary> lvvFrontendSummaries =
                listLvvFrontendsResponse.getLvvFrontendCollection().getItems();

        for (LvvFrontendSummary summary : lvvFrontendSummaries) {
            Date creationDate = summary.getTimeCreated();
            if (DateUtils.addHours(creationDate, ELIGIBLE_AGE_IN_HOURS).before(new Date())) {
                try {
                    lvvFrontendsUtils.deleteLvvFrontend(client, summary.getId(), null);
                } catch (final Exception ex) {
                    log.error("Failed to delete the resource.", ex);
                }
            }
        }
    }
}
