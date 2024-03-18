package com.oracle.pic.networking.lvv.frontend.canary.secret;

import com.oracle.bmc.model.BmcException;
import com.oracle.pic.vault.VaultClient;
import java.util.Base64;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.apache.http.HttpStatus;

/** Retrieves secrets from Secret Service. */
@Slf4j
public class SecretServiceBasedSecretRetriever implements SecretRetriever {

    // constants declared as package-private to allow test cases access to those
    static final String VAULT_SECRET_KEY = "secret";

    static final String MISSING_KEY_ERROR =
            "Secret map should contain key '" + VAULT_SECRET_KEY + "'.";
    static final String TOO_MANY_ENTRIES =
            "Secret map should contain only one entry, however there are ";
    static final String UNKNOWN_ERROR = "Error occurred while retrieving secrets";

    private final VaultClient vaultClient;

    /**
     * Construct an instance specifying the {@link VaultClient} to retrieve secrets with.
     *
     * @param vaultClient The specified {@link VaultClient}.
     */
    public SecretServiceBasedSecretRetriever(VaultClient vaultClient) {
        this.vaultClient = vaultClient;
    }

    @Override
    public byte[] retrieveSecret(String path) throws SecretRetrieverException {
        try {
            Map<String, String> rawSecret = vaultClient.getSecret(path).getData();
            // vault client's getSecret returns a map of key-value pairs
            // however, in practice there is only one key which is 'secret'
            if (rawSecret.size() != 1) {
                throw new RuntimeException(TOO_MANY_ENTRIES + rawSecret.size());
            } else if (!rawSecret.containsKey(VAULT_SECRET_KEY)) {
                throw new RuntimeException(MISSING_KEY_ERROR);
            }

            return Base64.getDecoder().decode(rawSecret.get(VAULT_SECRET_KEY));
        } catch (final BmcException ex) {
            final int httpCode = ex.getStatusCode();
            if (httpCode == HttpStatus.SC_NOT_FOUND) {
                throw new SecretRetrieverException(
                        path, SecretRetrieverException.ErrorCode.NotFound, ex);
            } else if (httpCode == HttpStatus.SC_FORBIDDEN) {
                throw new SecretRetrieverException(
                        path, SecretRetrieverException.ErrorCode.Forbidden, ex);
            }
            throw new RuntimeException(UNKNOWN_ERROR, ex);
        }
    }
}
