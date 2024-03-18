package com.oracle.pic.networking.lvv.frontend.config;

import javax.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class AuthConfig {

    @NotNull private Boolean authorizationEnabled;

    @NotNull private String tenantId;

    @NotNull private String identityWhitelistedName;

    @NotNull private String authServiceEndpoint;

    @NotNull private String defaultTrustStorePath;

    // Used with authN/Z for local testing; see README for more details.
    String instancePrincipalUrl;

    @NotNull private String teamName;

    @NotNull private String globalBusinessUnit;

    @NotNull private String applicationName;
}
