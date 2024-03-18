package com.oracle.pic.networking.lvv.frontend.canary.secret;

/** A simple generic secret retriever interface. */
public interface SecretRetriever {

    /**
     * Retrieve secret with the given path
     *
     * @param path of the secret
     * @return byte array representing the secret
     */
    byte[] retrieveSecret(String path) throws SecretRetrieverException;
}
