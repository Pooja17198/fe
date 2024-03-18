package com.oracle.pic.networking.lvv.frontend.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.oracle.pic.commons.exceptions.server.ErrorCode;
import com.oracle.pic.commons.exceptions.server.RenderableException;
import org.junit.jupiter.api.Test;

class RenderableExceptionsGeneratorTest {

    @Test
    void generateInvalidParameterException() {
        RenderableException ex =
                RenderableExceptionsGenerator.generateInvalidParameterException("test");
        assertEquals(ex.getErrorCode(), ErrorCode.InvalidParameter);
    }

    @Test
    void generateNotFoundOrNotAuthorizedException() {
        RenderableException ex =
                RenderableExceptionsGenerator.generateNotFoundOrNotAuthorizedException(
                        "resourceId");
        assertEquals(ex.getErrorCode(), ErrorCode.NotAuthorizedOrNotFound);
    }

    @Test
    void generateEtagMismatchException() {
        RenderableException ex =
                RenderableExceptionsGenerator.generateEtagMismatchException("etag", "resourceId");
        assertEquals(ex.getErrorCode(), ErrorCode.NoEtagMatch);
    }

    @Test
    void generateConflictDueToCurrentStateException() {
        RenderableException ex =
                RenderableExceptionsGenerator.generateConflictDueToCurrentStateException("test");
        assertEquals(ex.getErrorCode(), ErrorCode.Conflict);
    }

    @Test
    void generateInternalServerErrorException() {
        RenderableException ex =
                RenderableExceptionsGenerator.generateInternalServerErrorException();
        assertEquals(ex.getErrorCode(), ErrorCode.InternalError);
    }

    @Test
    void testGenerateInternalServerErrorException() {
        RenderableException ex =
                RenderableExceptionsGenerator.generateInternalServerErrorException(
                        "test", new Exception());
        assertEquals(ex.getErrorCode(), ErrorCode.InternalError);
    }
}
