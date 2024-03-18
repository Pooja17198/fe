package com.oracle.pic.networking.lvv.frontend.canary;

import com.google.inject.Guice;
import com.google.inject.Injector;
import com.oracle.pic.commons.configuration.EnvironmentTypeSafeReader;
import com.oracle.pic.commons.configuration.TypeSafeFileReader;
import com.oracle.pic.commons.configuration.TypeSafeReader;
import com.oracle.pic.commons.crypto.JCEProviders;
import com.oracle.pic.commons.service.configuration.ServiceCoreModule;
import com.oracle.pic.commons.service.configuration.TypesafeConfigProvider;
import com.oracle.pic.commons.service.environment.ServiceConfigurator;
import com.oracle.pic.networking.lvv.frontend.canary.config.LvvFrontendCanaryConfiguration;
import com.oracle.pic.networking.lvv.frontend.canary.config.LvvFrontendCanaryModule;
import com.oracle.pic.networking.lvv.frontend.canary.health.LvvFrontendCanaryHealthCheck;
import com.oracle.pic.networking.lvv.frontend.canary.schedulers.CanaryScheduler;
import io.dropwizard.Application;
import io.dropwizard.lifecycle.Managed;
import io.dropwizard.setup.Bootstrap;
import io.dropwizard.setup.Environment;
import lombok.extern.slf4j.Slf4j;

/** {@code LvvFrontendCanary} */
@Slf4j
public class LvvFrontendCanary extends Application<LvvFrontendCanaryConfiguration> {
    private static final String SERVICE_NAME = "LvvFrontendCanary";

    /*
     * Install JCE providers.
     *
     * JCE providers should be loaded before any code is executed,
     * in particular before SecureRandom instance is created.
     * To enable FIPS approve-only mode we have to use SecureRandom provided by BouncyCastle-FIPS provider.
     * Since SecureRandom is often created in the static context (during class loading)
     * JCE providers should be installed before that time, hence installing them in the static{} block.
     * https://confluence.oci.oraclecorp.com/display/Compliance/Java+FIPS+Option+-++Bouncy+Castle
     */
    static {
        JCEProviders.load();
    }

    @Override
    public String getName() {
        return SERVICE_NAME;
    }

    @Override
    public void initialize(Bootstrap<LvvFrontendCanaryConfiguration> bootstrap) {
        TypeSafeReader<String> reader = new EnvironmentTypeSafeReader(new TypeSafeFileReader());
        bootstrap.setConfigurationSourceProvider(new TypesafeConfigProvider(reader));
    }

    /**
     * Add providers, resources, etc. for your application.
     *
     * @param config the parsed {@link LvvFrontendCanaryConfiguration} object
     * @param environment the application's {@link Environment}
     */
    @Override
    public void run(LvvFrontendCanaryConfiguration config, Environment environment) {
        config.validateAdAndRegionConfiguration();
        log.info("Initializing LvvFrontendCanary...");
        log.debug("Realm: {}", config.getRealm());
        log.debug("Region: {}", config.getRegion());
        log.debug("Stage: {}", config.getStage());

        try {

            // Configure dependency injection
            log.info("Configuring Guice Injector");
            Injector injector =
                    Guice.createInjector(
                            new ServiceCoreModule(config), new LvvFrontendCanaryModule(config));
            new ServiceConfigurator().configure(environment, injector, config.getMetricsConfig());

            // Register resources and health checks
            registerHealthChecks(environment);

            manage(environment, injector, CanaryScheduler.class);

            log.info("LvvFrontendCanary initialization completed");
        } catch (Throwable t) {
            log.error("LvvFrontendCanary failed to start", t);
            throw t;
        }
    }

    private void manage(
            Environment environment, Injector injector, Class<? extends Managed> clazz) {
        Managed managed = injector.getInstance(clazz);
        environment.lifecycle().manage(managed);
    }

    private void registerHealthChecks(Environment environment) {
        log.info("Registering health checks");
        environment
                .healthChecks()
                .register(
                        LvvFrontendCanaryHealthCheck.getName(),
                        new LvvFrontendCanaryHealthCheck());
    }

    /** The entry point of the service. */
    public static void main(String[] args) throws Exception {
        log.info("Starting LvvFrontendCanary....");
        new LvvFrontendCanary().run(args);
    }
}
