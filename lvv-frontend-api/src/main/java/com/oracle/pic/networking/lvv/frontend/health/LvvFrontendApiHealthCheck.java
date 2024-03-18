package com.oracle.pic.networking.lvv.frontend.health;

import com.codahale.metrics.health.HealthCheck;

/**
 * This is the default service health check. Any number of health checks can exist by creating a
 * class that extends HealthCheck.
 *
 * <p>Access the health check on the admin endpoint and port defined in the base.conf followed by
 * /healthcheck.
 *
 * <p>Example: http://127.0.0.1:18081/healthcheck
 *
 * <p>Append ?pretty to pretty print: /healthcheck?pretty
 */
public class LvvFrontendApiHealthCheck extends HealthCheck {
    static final String NAME = "lvv-frontend-api";

    public static String getName() {
        return NAME;
    }

    @Override
    protected Result check() throws Exception {
        return Result.unhealthy("You need to update the Default healthcheck to correctly reflect application health");
    }
}
