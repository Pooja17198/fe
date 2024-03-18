package com.oracle.pic.networking.lvv.frontend.auth;

import com.oracle.pic.identity.authorization.sdk.AuthorizationClient;
import com.oracle.pic.identity.authorization.sdk.AuthorizationRequest;
import com.oracle.pic.identity.authorization.sdk.AuthorizationResponse;
import javax.ws.rs.NotAuthorizedException;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class AuthHelperTest {
    private static final String COMPARTMENT_ID = "test-compartment";
    private AuthorizationClient authClient;
    private AuthHelper authHelper;
    private AuthorizationRequest authorizationRequest;
    AuthorizationResponse response = Mockito.mock(AuthorizationResponse.class);

    @BeforeEach
    void setup() throws Exception {
        authClient = Mockito.mock(AuthorizationClient.class);
        authHelper = new AuthHelper(authClient);
        authorizationRequest = Mockito.mock(AuthorizationRequest.class);
        Mockito.when(authClient.makeAuthorizationCall(Mockito.any(AuthorizationRequest.class)))
                .thenReturn(response);
        Mockito.when(response.authorizeAllPermissions()).thenReturn(true);
    }

    @Test
    public void authorizationTest() {
        authHelper.authorize(authorizationRequest, COMPARTMENT_ID);
    }

    @Test
    public void authFailedTest() {
        Mockito.when(response.authorizeAllPermissions()).thenReturn(false);
        Assertions.assertThrows(
                NotAuthorizedException.class,
                () -> authHelper.authorize(authorizationRequest, COMPARTMENT_ID));
    }

    @Test
    public void authErrorTest() throws Exception {
        Mockito.when(authClient.makeAuthorizationCall(Mockito.any(AuthorizationRequest.class)))
                .thenThrow(new RuntimeException());
        Assertions.assertThrows(
                RuntimeException.class,
                () -> authHelper.authorize(authorizationRequest, COMPARTMENT_ID));
    }

    @Test
    public void authWithBlankCompartmentIdTest() {
        Assertions.assertThrows(
                IllegalArgumentException.class,
                () -> authHelper.authorize(authorizationRequest, ""));
    }

    @Test
    public void authWithNullRequest() {
        Assertions.assertThrows(
                IllegalArgumentException.class, () -> authHelper.authorize(null, COMPARTMENT_ID));
    }
}
