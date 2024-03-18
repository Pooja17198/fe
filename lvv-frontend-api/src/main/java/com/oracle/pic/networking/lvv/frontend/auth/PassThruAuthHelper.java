package com.oracle.pic.networking.lvv.frontend.auth;

import com.oracle.pic.identity.authorization.sdk.AuthorizationClient;
import com.oracle.pic.identity.authorization.sdk.AuthorizationRequest;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class PassThruAuthHelper extends AuthHelper {

    public PassThruAuthHelper(AuthorizationClient authorizationClient) {
        super(authorizationClient);
    }

    @Override
    public void authorize(AuthorizationRequest authorizationRequest, String compartmentId) {
        log.info("Authorization passing through mode for auth request: {}", authorizationRequest);
    }
}
