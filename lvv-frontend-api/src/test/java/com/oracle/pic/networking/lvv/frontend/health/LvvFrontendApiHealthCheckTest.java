package com.oracle.pic.networking.lvv.frontend.health;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.codahale.metrics.health.HealthCheck.Result;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class LvvFrontendApiHealthCheckTest {

    private LvvFrontendApiHealthCheck health;

    @BeforeEach
    public void setup() {
        health = new LvvFrontendApiHealthCheck();
    }

    @Test
    public void testCheck() throws Exception {
        Result result = health.check();

        assertTrue(!result.isHealthy());
    }

    @Test
    void getName() {
        Assertions.assertEquals(
                LvvFrontendApiHealthCheck.NAME, LvvFrontendApiHealthCheck.getName());
    }

    @Test
    void check() throws Exception {
        Assertions.assertEquals(Result.unhealthy("You need to update the Default healthcheck to correctly reflect application health"), health.check());
    }
}
