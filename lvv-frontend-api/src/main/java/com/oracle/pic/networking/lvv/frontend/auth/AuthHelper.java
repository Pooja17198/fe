package com.oracle.pic.networking.lvv.frontend.auth;

import com.google.common.base.Preconditions;
import com.oracle.pic.identity.authorization.sdk.AuthorizationClient;
import com.oracle.pic.identity.authorization.sdk.AuthorizationRequest;
import com.oracle.pic.identity.authorization.sdk.AuthorizationResponse;
import com.oracle.pic.telemetry.commons.metrics.Metrics;
import javax.ws.rs.NotAuthorizedException;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;

/**
 * https://confluence.oci.oraclecorp.com/display/OCIID/Integrate+with+Identity
 * https://confluence.oci.oraclecorp.com/display/OCIID/Identity+Auth+SDK+Integration+Steps
 */
@Slf4j
public class AuthHelper {

    private final AuthorizationClient authorizationClient;
    private static final String AUTH_ERROR_MESSAGE = "Not Authorized!";

    public AuthHelper(AuthorizationClient authorizationClient) {
        this.authorizationClient = authorizationClient;
    }

    public void authorize(AuthorizationRequest authorizationRequest, String compartmentId) {

        Preconditions.checkArgument(
                authorizationRequest != null, "authorizationRequest can't be null.");
        if (StringUtils.isBlank(compartmentId)) {
            throw new IllegalArgumentException(
                    String.format("Invalid compartment id: %s.", compartmentId));
        }
        authorizationRequest.addCompartmentId(compartmentId);

        log.info(
                "Authorization request received Principal: {}, CompartmentId: {}, Permission: {}",
                authorizationRequest.determinePrimaryPrincipal(),
                authorizationRequest.getTargetCompartmentId(),
                authorizationRequest.getPermissions());
        boolean isAuthorized = makeAuthorizationCall(authorizationRequest);

        if (isAuthorized) {
            Metrics.emit("authorize.authorizedUser", 1d);
        } else {
            Metrics.emit("authorize.unauthorizedUser", 1d);
            log.info(
                    "User Authorization failed for Principal: {}, on Compartment: {}",
                    authorizationRequest.determinePrimaryPrincipal(),
                    authorizationRequest.getTargetCompartmentId());
            throw new NotAuthorizedException(AUTH_ERROR_MESSAGE);
        }
    }

    private boolean makeAuthorizationCall(AuthorizationRequest authorizationRequest) {
        boolean authSucceed = false;
        try {
            final AuthorizationResponse authorizationResponse =
                    authorizationClient.makeAuthorizationCall(authorizationRequest);
            authSucceed = true;
            return authorizationResponse.authorizeAllPermissions();
        } catch (Exception e) {
            throw new RuntimeException(
                    String.format(
                            "Error occurred during makeAuthorizationCall api call: %s",
                            authorizationRequest),
                    e);
        } finally {
            Metrics.emit("authorize.availability", authSucceed ? 1 : 0);
        }
    }
}
