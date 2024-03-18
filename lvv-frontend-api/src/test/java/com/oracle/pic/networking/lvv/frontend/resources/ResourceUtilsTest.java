package com.oracle.pic.networking.lvv.frontend.resources;

import com.oracle.pic.commons.exceptions.server.ErrorCode;
import com.oracle.pic.commons.exceptions.server.RenderableException;
import java.security.InvalidParameterException;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

class ResourceUtilsTest {
    private static final String PARAMETER_NAME = "NAME";
    private static final String PARAMETER_VALUE = "VALUE";

    @Test
    void validateRequiredParameter() {
        // Invalid test cases
        RenderableException ex =
                Assertions.assertThrows(
                        RenderableException.class,
                        () -> ResourceUtils.validateRequiredParameter(PARAMETER_NAME, ""));
        Assertions.assertEquals(ex.getErrorCode(), ErrorCode.InvalidParameter);
        Assertions.assertTrue(ex.getMessage().contains(PARAMETER_NAME));

        ex =
                Assertions.assertThrows(
                        RenderableException.class,
                        () -> ResourceUtils.validateRequiredParameter(PARAMETER_NAME, null));
        Assertions.assertEquals(ex.getErrorCode(), ErrorCode.InvalidParameter);
        Assertions.assertTrue(ex.getMessage().contains(PARAMETER_NAME));

        // Valid test cases
        ResourceUtils.validateRequiredParameter(PARAMETER_NAME, PARAMETER_VALUE);
    }

    @Test
    void validateOptionalParameter() {
        // Invalid test cases
        RenderableException ex =
                Assertions.assertThrows(
                        RenderableException.class,
                        () -> ResourceUtils.validateOptionalParameter(PARAMETER_NAME, ""));
        Assertions.assertEquals(ex.getErrorCode(), ErrorCode.InvalidParameter);
        Assertions.assertTrue(ex.getMessage().contains(PARAMETER_NAME));

        // Valid test cases
        ResourceUtils.validateOptionalParameter(PARAMETER_NAME, null);
    }

    @Test
    void validateOptionalPositiveIntegerParameter() {
        // Invalid test cases
        InvalidParameterException ex =
                Assertions.assertThrows(
                        InvalidParameterException.class,
                        () ->
                                ResourceUtils.validateOptionalPositiveIntegerParameter(
                                        PARAMETER_NAME, -1));
        Assertions.assertTrue(ex.getMessage().contains(PARAMETER_NAME));

        ex =
                Assertions.assertThrows(
                        InvalidParameterException.class,
                        () ->
                                ResourceUtils.validateOptionalPositiveIntegerParameter(
                                        PARAMETER_NAME, 0));
        Assertions.assertTrue(ex.getMessage().contains(PARAMETER_NAME));

        // Valid test cases
        ResourceUtils.validateOptionalPositiveIntegerParameter(PARAMETER_NAME, 1);
        ResourceUtils.validateOptionalPositiveIntegerParameter(PARAMETER_NAME, null);
    }
}
