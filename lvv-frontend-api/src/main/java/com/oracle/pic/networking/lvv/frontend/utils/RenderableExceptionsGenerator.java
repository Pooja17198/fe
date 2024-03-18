package com.oracle.pic.networking.lvv.frontend.utils;

import com.oracle.pic.commons.exceptions.server.ErrorCode;
import com.oracle.pic.commons.exceptions.server.RenderableException;

public class RenderableExceptionsGenerator {

    /**
     * Generate a renderable exception that a parameter is invalid.
     *
     * @param name the name of the parameter
     * @return an exception indicating that the parameter is invalid
     */
    public static RenderableException generateInvalidParameterException(String name) {
        return new RenderableException(ErrorCode.InvalidParameter, "Invalid %s", name);
    }

    /**
     * Generate a renderable exception that the resource is not found or the user is not authorized
     * to access it.
     *
     * @param resourceId the resource Id that could not be reached
     * @return an exception indicating that the resource id could not be reached.
     */
    public static RenderableException generateNotFoundOrNotAuthorizedException(String resourceId) {
        return new RenderableException(
                ErrorCode.NotAuthorizedOrNotFound,
                String.format("Unknown resource %s", resourceId));
    }

    /**
     * Generate a renderable exception that the value has changed.
     *
     * @param ifMatch the etag provided with the if-match header.
     * @param resourceId the resource Id.
     * @return an exception indicating that the value is no longer the same as the last user view.
     */
    public static RenderableException generateEtagMismatchException(
            String ifMatch, String resourceId) {
        String userMessage =
                String.format(
                        "The specified If-Match header does not match the ETag of the image config "
                                + "If-Match header: %1$s , image id: %2$s",
                        ifMatch, resourceId);
        return new RenderableException(ErrorCode.NoEtagMatch, userMessage);
    }

    public static RenderableException generateConflictDueToCurrentStateException(String message) {
        return new RenderableException(ErrorCode.Conflict, message);
    }

    public static RenderableException generateInternalServerErrorException() {
        return new RenderableException(
                ErrorCode.InternalError, ErrorCode.InternalError.getDefaultMessage());
    }

    public static RenderableException generateInternalServerErrorException(
            String message, Throwable throwable) {
        return new RenderableException(ErrorCode.InternalError, message, throwable);
    }
}
