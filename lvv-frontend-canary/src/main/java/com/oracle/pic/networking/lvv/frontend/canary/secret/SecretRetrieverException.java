package com.oracle.pic.networking.lvv.frontend.canary.secret;

import lombok.Getter;

/** Thrown to indicate a secret could not be found by a {@link SecretRetriever}. */
public class SecretRetrieverException extends Exception {

    @Getter private final String secretPath;

    @Getter private final ErrorCode errorCode;

    SecretRetrieverException(String secretPath, ErrorCode errorCode, Exception inner) {
        super(inner);
        this.secretPath = secretPath;
        this.errorCode = errorCode;
    }

    public enum ErrorCode {
        NotFound,
        Forbidden
    }
}
