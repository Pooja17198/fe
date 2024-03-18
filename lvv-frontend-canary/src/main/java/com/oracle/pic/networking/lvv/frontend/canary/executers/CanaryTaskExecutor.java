package com.oracle.pic.networking.lvv.frontend.canary.executers;

import com.google.inject.Inject;
import com.oracle.pic.networking.lvv.frontend.canary.client.ExampleClientProvider;
import com.oracle.pic.networking.lvv.frontend.canary.config.LvvFrontendCanaryConfiguration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;

@Slf4j
/** CanaryTaskExecutor is responsible to execute canary task asynchronously */
public class CanaryTaskExecutor {

    private final ExampleClientProvider exampleClientProvider;
    private final String canaryTestCompartmentId;
    private final String endpoint;
    private final ExecutorService executorService;

    @Inject
    public CanaryTaskExecutor(
            ExampleClientProvider exampleClientProvider, LvvFrontendCanaryConfiguration config) {
        this.exampleClientProvider = exampleClientProvider;
        this.canaryTestCompartmentId = config.getCanaryTestCompartmentId();
        this.endpoint = config.getLvvFrontendEndpoint();
        executorService = Executors.newCachedThreadPool();
    }

    public void execute() throws Exception {
        executorService.submit(
                new CreateResourceTestTask(
                        exampleClientProvider, canaryTestCompartmentId, endpoint));
        executorService.submit(
                new GetResourceTestTask(exampleClientProvider, canaryTestCompartmentId, endpoint));
        executorService.submit(
                new UpdateResourceTestTask(
                        exampleClientProvider, canaryTestCompartmentId, endpoint));
        executorService.submit(
                new ListResourceTestTask(exampleClientProvider, canaryTestCompartmentId, endpoint));
        executorService.submit(
                new DeleteResourceTestTask(
                        exampleClientProvider, canaryTestCompartmentId, endpoint));
        executorService.submit(
                new StaleResourceCleaner(exampleClientProvider, canaryTestCompartmentId, endpoint));
    }

    public void shutdown() {
        executorService.shutdownNow();

        try {
            executorService.awaitTermination(120, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            System.out.println("Executor shutdown interrupted");
            e.printStackTrace();
        }
    }
}
