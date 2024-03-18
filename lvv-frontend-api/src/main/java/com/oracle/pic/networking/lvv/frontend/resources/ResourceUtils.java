package com.oracle.pic.networking.lvv.frontend.resources;

import com.oracle.pic.networking.lvv.frontend.utils.RenderableExceptionsGenerator;
import java.security.InvalidParameterException;
import org.apache.commons.lang3.StringUtils;

public class ResourceUtils {

    static void validateRequiredParameter(String parameterName, String parameterValue) {
        if (StringUtils.isBlank(parameterValue)) {
            throw RenderableExceptionsGenerator.generateInvalidParameterException(parameterName);
        }
    }

    static void validateOptionalParameter(String parameterName, String parameterValue) {
        if (parameterValue == null) {
            return;
        }
        if (StringUtils.isBlank(parameterValue)) {
            throw RenderableExceptionsGenerator.generateInvalidParameterException(parameterName);
        }
    }

    static void validateOptionalPositiveIntegerParameter(
            String parameterName, Integer parameterValue) {
        if (parameterValue != null && parameterValue <= 0) {
            throw new InvalidParameterException(parameterName);
        }
    }
}
