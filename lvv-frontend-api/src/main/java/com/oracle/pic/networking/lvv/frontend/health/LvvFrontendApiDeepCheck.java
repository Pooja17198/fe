package com.oracle.pic.networking.lvv.frontend.health;

import com.oracle.pic.networking.lvv.frontend.model.LvvFrontendSummary;
import com.oracle.pic.networking.lvv.frontend.service.LvvFrontendService;
import com.oracle.pic.sfw.dal.PaginatedResultSet;
import io.dropwizard.servlets.tasks.Task;
import java.io.PrintWriter;
import java.util.List;
import java.util.Map;

/**
 * This is the extended service health check. It is used to verify that your service passes a
 * deployment validation.
 *
 * <p>This differs from your regular healthcheck because it is not (and should not be) used by your
 * load balancer to determine if this host is ready to accept traffic because this necessarily tests
 * central resource all hosts have in common. Concretely, some load balancers misbehave when all
 * hosts suddenly become unhealthy as a result of that common resource becoming unavailable,
 * dropping all traffic instead of picking a host at random to try serve the request anyway.
 *
 * <p>Dropwizard merges all healthChecks into a single API, so this is implemented as a Task to
 * prevent that.
 *
 * <p>This is registered on the admin API to prevent needing to implement auth in your
 * postDeployValidate.sh to talk to your main API.
 */
public class LvvFrontendApiDeepCheck extends Task {
    private static final String NAME = "deepcheck";
    private static final String TEST_COMPARTMENT_ID =
            "ocid1.compartment.oc1..aaaaaaaa26mceal7cypzsefhbm2l73xtb3yreplacemereplacemereplaceme";
    private static final String TEST_DISPLAY_NAME = "lvvFrontendTest";
    // private static final String lvvFrontendId = "lvvFrontendId";
    private final LvvFrontendService lvvFrontendService;

    protected LvvFrontendApiDeepCheck() {
        super(NAME);
        lvvFrontendService = new LvvFrontendService();
    }

    @Override
    public void execute(Map<String, List<String>> arguments, PrintWriter printWriter) {
        /*
         * Deep check service dependencies by making known safe, small requests to those APIs
         * NOTE: Think through carefully if you want to fail your deployment if the downstream service
         * is down or not.  Specifically, would this dependency being down prevent you from validating
         * the deployment succeeded?
         * NOTE: These need to pass relatively quickly (on the order of a minute) to prevent ODO from
         * failing your deployment due to timeout. If these must run longer, add wait-and-retry logic to your postDeployValidate.sh script
         */

        // List LvvFrontend resource
        listLvvFrontend();

        printWriter.println("LvvFrontendApiDeepCheck Passed");
        printWriter.flush();
    }

    private void listLvvFrontend() {
        PaginatedResultSet<LvvFrontendSummary> lvvFrontendQueryResults =
                lvvFrontendService.queryLvvFrontends(
                        TEST_COMPARTMENT_ID, TEST_DISPLAY_NAME, null, 10, null, null, null);
        for (LvvFrontendSummary summary : lvvFrontendQueryResults.getResults()) {
            if (!summary.getCompartmentId().equals(TEST_COMPARTMENT_ID)
                    || !summary.getDisplayName().equals(TEST_DISPLAY_NAME)) {
                throw new RuntimeException("Failure occurred during listing lvvFrontends");
            }
        }
    }
}
