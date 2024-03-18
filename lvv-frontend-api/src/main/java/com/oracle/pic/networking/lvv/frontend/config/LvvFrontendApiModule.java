package com.oracle.pic.networking.lvv.frontend.config;

import com.google.common.base.Preconditions;
import com.google.inject.AbstractModule;
import com.google.inject.Provides;
import com.google.inject.Singleton;
import com.oracle.bmc.auth.BasicAuthenticationDetailsProvider;
import com.oracle.bmc.auth.InstancePrincipalsAuthenticationDetailsProvider;
import com.oracle.bmc.monitoring.MonitoringClient;
import com.oracle.pic.commons.metrics.naming.FilteringNamingStrategy;
import com.oracle.pic.commons.metrics.naming.SimpleMetricsNamingStrategy;
import com.oracle.pic.commons.ssl.DynamicSslContextProviderConfig;
import com.oracle.pic.networking.lvv.frontend.LvvFrontendApi;
import com.oracle.pic.networking.lvv.frontend.auth.AuthHelper;
import com.oracle.pic.networking.lvv.frontend.auth.PassThruAuthHelper;
import com.oracle.pic.networking.lvv.frontend.health.LvvFrontendApiDeepCheck;
import com.oracle.pic.networking.lvv.frontend.secret.FileBasedSecretRetriever;
import com.oracle.pic.networking.lvv.frontend.secret.SecretRetriever;
import com.oracle.pic.networking.lvv.frontend.secret.SecretServiceBasedSecretRetriever;
import com.oracle.pic.networking.lvv.frontend.service.LvvFrontendService;
import com.oracle.pic.identity.auth.AuthMetricsConstants;
import com.oracle.pic.identity.auth.AuthMetricsFactory;
import com.oracle.pic.identity.authentication.AuthServiceAuthenticationClient;
import com.oracle.pic.identity.authentication.AuthenticatorClient;
import com.oracle.pic.identity.authentication.ServiceAuthenticationClient;
import com.oracle.pic.identity.authentication.entities.X509FederationRequest;
import com.oracle.pic.identity.authentication.supplier.InstancePrincipalCertificateSupplier;
import com.oracle.pic.identity.authorization.sdk.AuthContextRequestFilter;
import com.oracle.pic.identity.authorization.sdk.AuthorizationClient;
import com.oracle.pic.telemetry.overlay.metrics.MetricsModules;
import com.oracle.pic.vault.MockAuthenticationDetailsProvider;
import com.oracle.pic.vault.VaultClient;
import java.net.URI;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;

@Slf4j
public class LvvFrontendApiModule extends AbstractModule {

    private static final int REFRESH_AUTH_TOKEN_BEFORE_SECONDS_TO_EXPIRE = 5;
    private static final String LOCAL = "dummyEndpoint";

    private final LvvFrontendApiConfiguration config;

    public LvvFrontendApiModule(LvvFrontendApiConfiguration config) {
        this.config = config;
    }

    @Override
    protected void configure() {
        log.info("Binding");
        bind(LvvFrontendApiConfiguration.class).toInstance(config);
        bind(AuthConfig.class).toInstance(config.getAuthConfig());
        bind(LvvFrontendService.class).in(Singleton.class);
        for (Class<?> c : LvvFrontendApi.RESOURCE_CLASSES) {
            bind(c).in(Singleton.class);
        }
        bind(LvvFrontendApiDeepCheck.class).in(Singleton.class);
        this.binder().requireExplicitBindings();
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
    public ServiceAuthenticationClient getServiceAuthenticationClient() {

        // Read this guide to learn about Using Instance Principal Certificates for S2S
        // https://confluence.oci.oraclecorp.com/pages/viewpage.action?spaceKey=OCIID&title=How+to+Integrate+with+S2S

        Preconditions.checkArgument(config.getAuthConfig() != null, "AuthConfig is null");
        final InstancePrincipalCertificateSupplier certificateSupplier;
        if (config.getStage().equals("DEVELOPMENT")
                && StringUtils.isNotBlank(config.getAuthConfig().getInstancePrincipalUrl())) {
            certificateSupplier =
                    new InstancePrincipalCertificateSupplier(
                            config.getAuthConfig().getInstancePrincipalUrl());
        } else {
            certificateSupplier = new InstancePrincipalCertificateSupplier();
        }

        // This is used in *overlay* hosts to contact identity, if you are in service enclave, set
        // to null
        DynamicSslContextProviderConfig dynamicSslConfig =
                new DynamicSslContextProviderConfig(
                        null, null, null, config.getAuthConfig().getDefaultTrustStorePath());

        // You can use region in overlay to autodetect the endpoint or use
        // .authServiceEndpoint(config.getAuthConfig().authServiceEndpoint) to specify it yourself.
        return AuthServiceAuthenticationClient.builder()
                .authServiceEndpoint(config.getAuthConfig().getAuthServiceEndpoint())
                .certificateSupplier(certificateSupplier)
                .expirationBufferInSeconds(REFRESH_AUTH_TOKEN_BEFORE_SECONDS_TO_EXPIRE)
                .purpose(X509FederationRequest.Purpose.SERVICE_PRINCIPAL)
                .trustRootConfig(dynamicSslConfig)
                .globalBusinessUnit(config.getAuthConfig().getGlobalBusinessUnit())
                .teamName(config.getAuthConfig().getTeamName())
                .applicationName(config.getAuthConfig().getApplicationName())
                .authMetrics(AuthMetricsFactory.getInstance(AuthMetricsConstants.TELEMETRY_LIB))
                // You can use AuthMetricsConstants.COMMONS_LIB for commons
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

    @Provides
    @Singleton
    public AuthorizationClient getAuthorizationClient(
            ServiceAuthenticationClient serviceAuthenticationClient) {

        return AuthorizationClient.builder()
                .serviceName(config.getAuthConfig().getIdentityWhitelistedName())
                .authorizationEndpoint(config.getAuthConfig().getAuthServiceEndpoint())
                .region(config.getRegion())
                .physicalAD(config.getAvailabilityDomain().getName())
                .serviceAuthenticationClient(serviceAuthenticationClient)
                .rootCertPath(config.getAuthConfig().getDefaultTrustStorePath())
                .authMetrics(AuthMetricsFactory.getInstance(AuthMetricsConstants.TELEMETRY_LIB))
                // You can use AuthMetricsConstants.COMMONS_LIB for commons
                .build();
    }

    @Provides
    @Singleton
    public AuthenticatorClient getAuthenticatorClient(
            ServiceAuthenticationClient serviceAuthenticationClient) {
        return new AuthenticatorClient.Builder()
                .keyServiceUrl(URI.create(config.getAuthConfig().getAuthServiceEndpoint()))
                .serviceAuthenticationClient(serviceAuthenticationClient)
                .rootCertPath(config.getAuthConfig().getDefaultTrustStorePath())
                .authMetrics(AuthMetricsFactory.getInstance(AuthMetricsConstants.TELEMETRY_LIB))
                // You can use AuthMetricsConstants.COMMONS_LIB for commons
                .build();
    }

    @Provides
    @Singleton
    public AuthContextRequestFilter getAuthContextRequestFilter(
            AuthenticatorClient authenticatorClient, AuthorizationClient authorizationClient) {

        return new AuthContextRequestFilter(authenticatorClient, authorizationClient);
    }

    @Provides
    @Singleton
    public SecretRetriever getSecretRetriever() {
        if (config.getStage().equals("DEVELOPMENT")) {
            return new FileBasedSecretRetriever();
        } else {
            VaultClient vaultClient =
                    new VaultClient(
                            config.getSecretServiceConfig(),
                            InstancePrincipalsAuthenticationDetailsProvider.builder().build());
            return new SecretServiceBasedSecretRetriever(vaultClient);
        }
    }

    @Provides
    @Singleton
    public AuthHelper getAuthHelper(AuthorizationClient authorizationClient) {
        if (config.getAuthConfig().getAuthorizationEnabled()) {
            return new AuthHelper(authorizationClient);
        } else {
            return new PassThruAuthHelper(authorizationClient);
        }
    }
}
