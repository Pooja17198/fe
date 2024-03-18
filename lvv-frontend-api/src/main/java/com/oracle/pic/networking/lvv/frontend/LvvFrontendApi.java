package com.oracle.pic.networking.lvv.frontend;

import com.google.common.collect.ImmutableList;
import com.google.inject.Guice;
import com.google.inject.Injector;
import com.oracle.pic.commons.configuration.EnvironmentTypeSafeReader;
import com.oracle.pic.commons.configuration.TypeSafeFileReader;
import com.oracle.pic.commons.configuration.TypeSafeReader;
import com.oracle.pic.commons.crypto.JCEProviders;
import com.oracle.pic.commons.service.configuration.ServiceCoreModule;
import com.oracle.pic.commons.service.configuration.TypesafeConfigProvider;
import com.oracle.pic.commons.service.environment.ServiceConfigurator;
import com.oracle.pic.networking.lvv.frontend.config.LvvFrontendApiConfiguration;
import com.oracle.pic.networking.lvv.frontend.config.LvvFrontendApiModule;
import com.oracle.pic.networking.lvv.frontend.health.LvvFrontendApiDeepCheck;
import com.oracle.pic.networking.lvv.frontend.health.LvvFrontendApiHealthCheck;
import com.oracle.pic.networking.lvv.frontend.resources.LvvFrontendResource;
import com.oracle.pic.identity.authorization.sdk.AuthContextBinder;
import com.oracle.pic.identity.authorization.sdk.AuthContextRequestFilter;
import com.oracle.pic.sfw.internal.GeneratedApplicationHeartbeater;
import com.oracle.pic.sherlock.collector.dropwizard.AuditFilterInstaller;
import io.dropwizard.Application;
import io.dropwizard.bundles.assets.ConfiguredAssetsBundle;
import io.dropwizard.jersey.setup.JerseyEnvironment;
import io.dropwizard.lifecycle.Managed;
import io.dropwizard.setup.Bootstrap;
import io.dropwizard.setup.Environment;
import java.util.HashMap;
import java.util.List;
import lombok.extern.slf4j.Slf4j;

/** {@code LvvFrontendApi} */
@Slf4j
public class LvvFrontendApi extends Application<LvvFrontendApiConfiguration> {
    private static final String SERVICE_NAME = "LvvFrontendApi";

    /**
     * The Service Framework team would appreciate it if you left this heartbeater in place. It
     * provides usage data for the Service Generator and Service Framework Library that informs our
     * development road map.
     *
     * <p>Resource consumption is negligible. The instance is configured to emit a heartbeat metric
     * once an hour by default. It uses a scheduled executor that is driven by a single thread, and
     * shared by any other heartbeater instances.
     *
     * <p>You are welcome to increase the heartbeat frequency by providing your own configuration on
     * construction.
     */
    private static final GeneratedApplicationHeartbeater HEARTBEATER =
            GeneratedApplicationHeartbeater.forApplicationNamed(SERVICE_NAME);

    // Add your resources to this list.
    public static final List<Class<?>> RESOURCE_CLASSES =
            ImmutableList.<Class<?>>builder().add(LvvFrontendResource.class).build();

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
        log.info("Loading JCE providers...");
        JCEProviders.load();
        log.info("Loaded JCE providers.");
    }

    @Override
    public String getName() {
        return SERVICE_NAME;
    }

    @Override
    public void initialize(Bootstrap<LvvFrontendApiConfiguration> bootstrap) {
        TypeSafeReader<String> reader = new EnvironmentTypeSafeReader(new TypeSafeFileReader());
        bootstrap.setConfigurationSourceProvider(new TypesafeConfigProvider(reader));
        bootstrap.addBundle(
                new ConfiguredAssetsBundle(new HashMap<String, String>(), "index.html", "ui"));

        log.info("Spec and API explorer: \n\n    SPEC    /spec/api.json\n    UI      /ui\n");
    }

    /**
     * Add providers, resources, etc. for your application.
     *
     * @param config the parsed {@link LvvFrontendApiConfiguration} object
     * @param environment the application's {@link Environment}
     * @throws Exception if something goes wrong
     */
    @Override
    public void run(LvvFrontendApiConfiguration config, Environment environment)
            throws Exception {
        config.validateAdAndRegionConfiguration();
        log.info("Initializing LvvFrontendApi...");

        try {

            // Lifecycle management for objects which need to be started and stopped as the service
            // is started or
            // stopped.
            environment
                    .lifecycle()
                    .manage(
                            new Managed() {
                                @Override
                                public void start() {
                                    // Start here
                                }

                                @Override
                                public void stop() {
                                    // Stop here
                                }
                            });

            // Configure dependency injection
            log.info("Configuring Guice Injector");
            Injector injector =
                    Guice.createInjector(
                            new ServiceCoreModule(config), new LvvFrontendApiModule(config));
            new ServiceConfigurator().configure(environment, injector, config.getMetricsConfig());

            // Register resources and health checks
            registerResources(environment, injector);
            registerHealthChecks(environment);
            registerAuth(environment, config, injector);
            registerAuditFilter(config, environment);
            environment.admin().addTask(injector.getInstance(LvvFrontendApiDeepCheck.class));
            log.info("{} initialization completed", SERVICE_NAME);
        } catch (Throwable t) {
            log.error("{} failed to start", SERVICE_NAME, t);
            throw t;
        }
    }

    private void registerResources(Environment environment, Injector injector) {
        JerseyEnvironment jersey = environment.jersey();
        for (Class<?> clazz : RESOURCE_CLASSES) {
            log.info("Registering resource {}", clazz.getSimpleName());
            jersey.register(injector.getInstance(clazz));
        }
    }

    private void registerHealthChecks(Environment environment) {
        log.info("Registering health checks");
        environment
                .healthChecks()
                .register(
                        LvvFrontendApiHealthCheck.getName(), new LvvFrontendApiHealthCheck());
    }

    private void registerAuth(
            Environment environment, LvvFrontendApiConfiguration config, Injector injector) {

        if (config.getAuthConfig().getAuthorizationEnabled()) {
            environment.jersey().register(injector.getInstance(AuthContextRequestFilter.class));
            log.info("Authorization is enabled");
        } else {
            // if ("PRODUCTION".equalsIgnoreCase(config.getStage())) {
            //    throw new IllegalArgumentException("Authorization disabled in prod? Probably a
            // mistake.");
            // }
            log.warn(
                    "\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
                            + "\n!! Attention: Running with authorization disabled!  !!"
                            + "\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        }
        environment.jersey().register(new AuthContextBinder());
    }

    /**
     * Registers the AuditFilter (also known as Sherlock Collector) as a Jersey filter. Note: Only
     * OCI Services (that have Service Principal) are allowed to emit Audit events.
     */
    private void registerAuditFilter(
            final LvvFrontendApiConfiguration config, final Environment environment) {
        AuditFilterInstaller.install(config.getAuditConfig(), environment);
        log.info("AuditFilter (Sherlock Collector) is installed");
    }

    /** The entry point of the service. */
    public static void main(String[] args) throws Exception {
        log.info("Starting {}....", SERVICE_NAME);
        new LvvFrontendApi().run(args);
    }
}
