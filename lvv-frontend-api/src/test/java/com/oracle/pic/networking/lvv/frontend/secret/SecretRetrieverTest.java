package com.oracle.pic.networking.lvv.frontend.secret;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import com.oracle.bmc.model.BmcException;
import com.oracle.pic.networking.lvv.frontend.secret.SecretRetrieverException.ErrorCode;
import com.oracle.pic.vault.VaultClient;
import com.oracle.pic.vault.model.GetSecretResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.apache.http.HttpStatus;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import org.mockito.Mockito;

class SecretRetrieverTest {

    // paths against which expectations have been set for the secret service based retriever
    private static final String PATH_TO_MY_SECRET1 = "mySecret/latest";
    private static final String PATH_TO_MY_SECRET2 = "myOtherSecret/latest";
    private static final String PATH_TO_NOT_FOUND = "missingSecret/latest";
    private static final String PATH_TO_FORBIDDEN = "forbidden/latest";
    private static final String PATH_TO_BAD_REQUEST = "badRequest/latest";
    private static final String PATH_TO_MANY_ENTRIES = "manyEntries/latest";
    private static final String PATH_TO_NO_ENTRIES = "noEntries/latest";
    private static final String PATH_TO_MISSING_KEY = "missingKey/latest";
    private static final String PATH_TO_NON_EXISTENT_FILE = "/non/existent/file";
    private static final String PATH_TO_TEST_SECRET_FILE = "src/test/test-data/testSecret";

    // Exceptions used for verification
    private static final BmcException NOT_FOUND_EX =
            new BmcException(
                    HttpStatus.SC_NOT_FOUND, "Not found", "Error message1", null, (Throwable) null);
    private static final BmcException NOT_ALLOWED_EX =
            new BmcException(
                    HttpStatus.SC_FORBIDDEN,
                    "Not allowed",
                    "Error message2",
                    null,
                    (Throwable) null);
    private static final BmcException BAD_REQUEST_EX =
            new BmcException(
                    HttpStatus.SC_BAD_REQUEST,
                    "Bad request",
                    "Error message3",
                    null,
                    (Throwable) null);

    // Values of secrets used
    private static final String TEST_PASSWORD = "testPassword";
    private static final String OTHER_SECRET = "otherSecret";

    // Bad and Good paths for retrieveSecret
    @TestFactory
    Stream<DynamicTest> testSecretRetriever() throws IOException {
        SecretRetriever ssBasedRetriever = setupSecretRetriever();
        FileBasedSecretRetriever fileBasedRetriever = Mockito.spy(new FileBasedSecretRetriever());
        IOException ioException = new IOException();
        Mockito.doThrow(ioException)
                .when(fileBasedRetriever)
                .getFileContent(PATH_TO_NON_EXISTENT_FILE);

        List<DynamicTest> tests = new LinkedList<>();
        tests.add(
                dynamicTest(
                        PATH_TO_NOT_FOUND,
                        () ->
                                testSecretRetrieverExceptionThrown(
                                        ssBasedRetriever,
                                        PATH_TO_NOT_FOUND,
                                        NOT_FOUND_EX,
                                        ErrorCode.NotFound)));

        tests.add(
                dynamicTest(
                        PATH_TO_FORBIDDEN,
                        () ->
                                testSecretRetrieverExceptionThrown(
                                        ssBasedRetriever,
                                        PATH_TO_FORBIDDEN,
                                        NOT_ALLOWED_EX,
                                        ErrorCode.Forbidden)));

        tests.add(
                dynamicTest(
                        PATH_TO_BAD_REQUEST,
                        () ->
                                testRuntimeExceptionThrown(
                                        ssBasedRetriever,
                                        PATH_TO_BAD_REQUEST,
                                        BAD_REQUEST_EX,
                                        SecretServiceBasedSecretRetriever.UNKNOWN_ERROR)));

        tests.add(
                dynamicTest(
                        PATH_TO_NO_ENTRIES,
                        () ->
                                testRuntimeExceptionThrown(
                                        ssBasedRetriever,
                                        PATH_TO_NO_ENTRIES,
                                        null,
                                        SecretServiceBasedSecretRetriever.TOO_MANY_ENTRIES + "0")));

        tests.add(
                dynamicTest(
                        PATH_TO_MANY_ENTRIES,
                        () ->
                                testRuntimeExceptionThrown(
                                        ssBasedRetriever,
                                        PATH_TO_MANY_ENTRIES,
                                        null,
                                        SecretServiceBasedSecretRetriever.TOO_MANY_ENTRIES + "2")));

        tests.add(
                dynamicTest(
                        PATH_TO_MISSING_KEY,
                        () ->
                                testRuntimeExceptionThrown(
                                        ssBasedRetriever,
                                        PATH_TO_MISSING_KEY,
                                        null,
                                        SecretServiceBasedSecretRetriever.MISSING_KEY_ERROR)));

        tests.add(
                dynamicTest(
                        PATH_TO_MY_SECRET1,
                        () ->
                                testRetrieveSecret(
                                        ssBasedRetriever, PATH_TO_MY_SECRET1, TEST_PASSWORD)));

        tests.add(
                dynamicTest(
                        PATH_TO_MY_SECRET2,
                        () ->
                                testRetrieveSecret(
                                        ssBasedRetriever, PATH_TO_MY_SECRET2, OTHER_SECRET)));

        tests.add(
                dynamicTest(
                        PATH_TO_TEST_SECRET_FILE,
                        () ->
                                testRetrieveSecret(
                                        fileBasedRetriever,
                                        PATH_TO_TEST_SECRET_FILE,
                                        "MyTestSecret_123" + System.lineSeparator())));

        tests.add(
                dynamicTest(
                        PATH_TO_NON_EXISTENT_FILE,
                        () ->
                                testSecretRetrieverExceptionThrown(
                                        fileBasedRetriever,
                                        PATH_TO_NON_EXISTENT_FILE,
                                        ioException,
                                        ErrorCode.NotFound)));

        return tests.stream();
    }

    // Positive check
    private static void testRetrieveSecret(
            SecretRetriever secretRetriever, String path, String expected)
            throws SecretRetrieverException {
        byte[] secretBytes = secretRetriever.retrieveSecret(path);
        String secretValue = new String(secretBytes, StandardCharsets.UTF_8);
        assertEquals(expected, secretValue);
    }

    // When expecting a runtime exception
    private static void testRuntimeExceptionThrown(
            SecretRetriever secretRetriever, String path, Exception cause, String errorMessage) {
        RuntimeException ex =
                assertThrows(RuntimeException.class, () -> secretRetriever.retrieveSecret(path));
        assert errorMessage.equals(ex.getMessage()) && ex.getCause() == cause;
    }

    // When expecting a secret retriever exception
    private static void testSecretRetrieverExceptionThrown(
            SecretRetriever secretRetriever, String path, Exception cause, ErrorCode errorCode) {
        SecretRetrieverException ex =
                assertThrows(
                        SecretRetrieverException.class, () -> secretRetriever.retrieveSecret(path));
        assert ex.getErrorCode() == errorCode
                && ex.getCause() == cause
                && path.equals(ex.getSecretPath());
    }

    private static SecretServiceBasedSecretRetriever setupSecretRetriever() {
        final Map<String, String> emptyMap = Collections.emptyMap();

        final Map<String, String> tooManyKeys = new HashMap<>();
        tooManyKeys.put(SecretServiceBasedSecretRetriever.VAULT_SECRET_KEY, "secretValue");
        tooManyKeys.put("foo", "bar");

        final Map<String, String> missingKey = new HashMap<>();
        missingKey.put("foo", "bar");

        VaultClient vaultClient = Mockito.mock(VaultClient.class);

        // Error cases when a value is returned
        Mockito.when(vaultClient.getSecret(PATH_TO_NO_ENTRIES))
                .thenReturn(getSecretResponse(emptyMap));
        Mockito.when(vaultClient.getSecret(PATH_TO_MANY_ENTRIES))
                .thenReturn(getSecretResponse(tooManyKeys));
        Mockito.when(vaultClient.getSecret(PATH_TO_MISSING_KEY))
                .thenReturn(getSecretResponse(missingKey));
        // Error cases when an exception is thrown
        Mockito.when(vaultClient.getSecret(PATH_TO_NOT_FOUND)).thenThrow(NOT_FOUND_EX);
        Mockito.when(vaultClient.getSecret(PATH_TO_FORBIDDEN)).thenThrow(NOT_ALLOWED_EX);
        Mockito.when(vaultClient.getSecret(PATH_TO_BAD_REQUEST)).thenThrow(BAD_REQUEST_EX);
        // Successful cases
        Mockito.when(vaultClient.getSecret(PATH_TO_MY_SECRET1))
                .thenReturn(getSecretResponse(TEST_PASSWORD));
        Mockito.when(vaultClient.getSecret(PATH_TO_MY_SECRET2))
                .thenReturn(getSecretResponse(OTHER_SECRET));

        return new SecretServiceBasedSecretRetriever(vaultClient);
    }

    private static GetSecretResponse getSecretResponse(String secret) {
        Map<String, String> rawSecret = new HashMap<>();
        rawSecret.put(
                SecretServiceBasedSecretRetriever.VAULT_SECRET_KEY,
                Base64.getEncoder().encodeToString(secret.getBytes(StandardCharsets.UTF_8)));

        return getSecretResponse(rawSecret);
    }

    private static GetSecretResponse getSecretResponse(Map<String, String> rawSecret) {
        return GetSecretResponse.builder().data(rawSecret).build();
    }
}
