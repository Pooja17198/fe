package com.oracle.pic.networking.lvv.frontend.canary.client;

import com.google.common.base.Supplier;
import com.oracle.pic.networking.lvv.frontend.canary.secret.SecretRetriever;
import com.oracle.pic.networking.lvv.frontend.canary.secret.SecretRetrieverException;
import java.io.ByteArrayInputStream;
import java.io.InputStream;

/**
 * This is a customer secret service based implementation of SimplePrivateKeySupplier {@link
 * com.oracle.bmc.auth.SimplePrivateKeySupplier}.
 */
public class SecretServicePrivateKeySupplier implements Supplier<InputStream> {

    private SecretRetriever secretRetriever;
    private String path;

    public SecretServicePrivateKeySupplier(SecretRetriever secretRetriever, String path) {
        this.secretRetriever = secretRetriever;
        this.path = path;
    }

    public InputStream get() {
        try {
            byte[] secret = secretRetriever.retrieveSecret(path);
            return new ByteArrayInputStream(secret);
        } catch (SecretRetrieverException ex) {
            throw new IllegalArgumentException("Could not find private key: " + path, ex);
        }
    }

    public String toString() {
        return "SimplePrivateKeySupplier(pemFilePath=" + this.path + ")";
    }
}
