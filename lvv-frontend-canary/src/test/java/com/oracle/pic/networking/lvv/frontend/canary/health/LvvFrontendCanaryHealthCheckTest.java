package com.oracle.pic.networking.lvv.frontend.canary.health;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.codahale.metrics.health.HealthCheck.Result;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class LvvFrontendCanaryHealthCheckTest {

    private LvvFrontendCanaryHealthCheck health;

    @BeforeEach
    public void setup() {
        health = new LvvFrontendCanaryHealthCheck();
    }

    @Test
    public void testCheck() throws Exception {
        Result result = health.check();

        assertTrue(!result.isHealthy());
    }
}
