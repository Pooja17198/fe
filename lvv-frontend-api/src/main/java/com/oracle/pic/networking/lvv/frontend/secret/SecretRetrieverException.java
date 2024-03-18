package com.oracle.pic.networking.lvv.frontend.secret;

import lombok.Getter;

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
