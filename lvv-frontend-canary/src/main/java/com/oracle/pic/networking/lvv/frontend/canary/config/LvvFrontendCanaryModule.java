package com.oracle.pic.networking.lvv.frontend.canary.config;

import com.google.inject.AbstractModule;
import com.google.inject.Provides;
import com.google.inject.Singleton;
import com.google.inject.name.Named;
import com.oracle.bmc.auth.BasicAuthenticationDetailsProvider;
import com.oracle.bmc.auth.InstancePrincipalsAuthenticationDetailsProvider;
import com.oracle.bmc.auth.SimpleAuthenticationDetailsProvider;
import com.oracle.bmc.monitoring.MonitoringClient;
import com.oracle.pic.commons.metrics.naming.FilteringNamingStrategy;
import com.oracle.pic.commons.metrics.naming.SimpleMetricsNamingStrategy;
import com.oracle.pic.commons.s2s.util.OfflineAuth;
import com.oracle.pic.networking.lvv.frontend.canary.client.SecretServicePrivateKeySupplier;
import com.oracle.pic.networking.lvv.frontend.canary.secret.FileBasedSecretRetriever;
import com.oracle.pic.networking.lvv.frontend.canary.secret.SecretRetriever;
import com.oracle.pic.networking.lvv.frontend.canary.secret.SecretServiceBasedSecretRetriever;
import com.oracle.pic.telemetry.overlay.metrics.MetricsModules;
import com.oracle.pic.vault.MockAuthenticationDetailsProvider;
import com.oracle.pic.vault.VaultClient;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class LvvFrontendCanaryModule extends AbstractModule {
    private static final String LOCAL = "dummyEndpoint";

    private final LvvFrontendCanaryConfiguration config;

    public LvvFrontendCanaryModule(LvvFrontendCanaryConfiguration config) {
        this.config = config;
    }

    @Override
    protected void configure() {
        log.info("Binding");
        bind(LvvFrontendCanaryConfiguration.class).toInstance(config);
        install(
                new MetricsModules.Builder()
                        .config(config.getMetricsConfig())
                        .namingStrategy(
                                FilteringNamingStrategy.byLevel(
                                        new SimpleMetricsNamingStrategy(), 3))
                        .monitoringClient(getMonitoringClient())
                        .shouldOverrideMetricKeys(false)
                        .build());
    }

    @Provides
    @Singleton
    public SecretRetriever getSecretRetriever(LvvFrontendCanaryConfiguration configuration) {
        if (configuration.getStage().equals("DEVELOPMENT")) {
            return new FileBasedSecretRetriever();
        } else {
            return new SecretServiceBasedSecretRetriever(
                    new VaultClient(
                            configuration.getSecretServiceConfig(),
                            InstancePrincipalsAuthenticationDetailsProvider.builder().build()));
        }
    }

    @Provides
    @Singleton
    @Named("user1")
    public BasicAuthenticationDetailsProvider getAuthProvider(
            LvvFrontendCanaryConfiguration configuration, SecretRetriever secretRetriever) {
        if (configuration.getStage().equals("DEVELOPMENT")) {
            return OfflineAuth.authProvider();
        }

        String privateKeyPath = config.getPrivateKey();
        SecretServicePrivateKeySupplier privateKeySupplier =
                new SecretServicePrivateKeySupplier(secretRetriever, privateKeyPath);

        return SimpleAuthenticationDetailsProvider.builder()
                .tenantId(config.getTenantId())
                .userId(config.getUserId())
                .fingerprint(config.getFingerPrint())
                .privateKeySupplier(privateKeySupplier)
                .build();
    }

    @Provides
    @Singleton
    public MonitoringClient getMonitoringClient() {
        BasicAuthenticationDetailsProvider authProvider;
        String t2IngestionEndpoint = LOCAL;

        if (config.getStage().equals("DEVELOPMENT")) {
            authProvider = new MockAuthenticationDetailsProvider();
        } else {
            t2IngestionEndpoint = config.getMetricsConfig().getT2Config().getEndpointOverride();
            authProvider = InstancePrincipalsAuthenticationDetailsProvider.builder().build();
        }

        MonitoringClient monitoringClient = new MonitoringClient(authProvider, null);

        log.info("t2IngestionEndpoint: {}", t2IngestionEndpoint);

        monitoringClient.setEndpoint(t2IngestionEndpoint);
        return monitoringClient;
    }
}
