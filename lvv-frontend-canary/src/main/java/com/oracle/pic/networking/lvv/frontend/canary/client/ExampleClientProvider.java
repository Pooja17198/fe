package com.oracle.pic.networking.lvv.frontend.canary.client;

import com.google.inject.Inject;
import com.google.inject.Singleton;
import com.google.inject.name.Named;
import com.oracle.bmc.auth.BasicAuthenticationDetailsProvider;
import com.oracle.pic.networking.lvv.frontend.LvvFrontendClient;
import com.oracle.pic.networking.lvv.frontend.canary.config.LvvFrontendCanaryConfiguration;
import lombok.extern.slf4j.Slf4j;

@Singleton
/*
 * since this class defined as singleton and client is initialized in the constructor,
 * there will be only one client during the execution of the service (which is recommended usage)
 */
@Slf4j
public class ExampleClientProvider {

    private final LvvFrontendCanaryConfiguration config;
    private final BasicAuthenticationDetailsProvider authenticationDetailsProvider;

    @Inject
    public ExampleClientProvider(
            LvvFrontendCanaryConfiguration config,
            @Named("user1") BasicAuthenticationDetailsProvider authProvider) {
        this.config = config;
        this.authenticationDetailsProvider = authProvider;
    }

    public LvvFrontendClient getClient() {
        log.info("Creating lvvFrontendClient...");

        log.info("TenantId:{}", config.getTenantId());
        log.info("UserId:{}", config.getUserId());
        log.info("FingerPrint:{}", config.getFingerPrint());
        log.info("PrivateKey:{}", config.getPrivateKey());
        log.info("ApiEndPoint:{}", config.getLvvFrontendEndpoint());

        LvvFrontendClient client = new LvvFrontendClient(authenticationDetailsProvider, null, null);
        client.setEndpoint(config.getLvvFrontendEndpoint());

        return client;
    }
}
