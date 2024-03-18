package com.oracle.pic.networking.lvv.frontend.canary.schedulers;

import com.google.common.util.concurrent.AbstractScheduledService;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import com.oracle.pic.networking.lvv.frontend.canary.executers.CanaryTaskExecutor;
import io.dropwizard.lifecycle.Managed;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;

@Singleton
@Slf4j
public class CanaryScheduler extends AbstractScheduledService implements Managed {

    private CanaryTaskExecutor canaryTaskExecutor;

    @Inject
    public CanaryScheduler(CanaryTaskExecutor executor) {
        this.canaryTaskExecutor = executor;
    }

    @Override
    protected void runOneIteration() throws Exception {
        log.info("Starting iteration of Canary Scheduler.");
        canaryTaskExecutor.execute();
    }

    @Override
    protected Scheduler scheduler() {
        return Scheduler.newFixedDelaySchedule(30, 300, TimeUnit.SECONDS);
    }

    @Override
    public void start() throws Exception {
        log.info("Starting CanaryScheduler");
        this.startAsync();
    }

    @Override
    public void stop() throws Exception {
        log.info("Stopping CanaryScheduler");
        canaryTaskExecutor.shutdown();
        this.stopAsync();
    }
}
