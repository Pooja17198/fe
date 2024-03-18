package com.oracle.pic.networking.lvv.frontend.secret;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

/** Retrieves secrets from a file system. */
public class FileBasedSecretRetriever implements SecretRetriever {

    @Override
    public byte[] retrieveSecret(String path) throws SecretRetrieverException {
        try {
            return getFileContent(path);
        } catch (final IOException ex) {
            throw new SecretRetrieverException(
                    path, SecretRetrieverException.ErrorCode.NotFound, ex);
        }
    }

    // package-private to allow mocking (Mockito cannot mock static methods)
    byte[] getFileContent(String path) throws IOException {
        return Files.readAllBytes(Paths.get(path));
    }
}
