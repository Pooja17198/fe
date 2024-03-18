package com.oracle.pic.networking.lvv.frontend.resources;

import static org.apache.commons.lang3.StringUtils.isBlank;

import com.google.inject.Inject;
import com.oracle.pic.commons.service.metrics.context.ServiceName;
import com.oracle.pic.commons.service.model.PaginatedCollectionResponse;
import com.oracle.pic.commons.service.model.TaggedResponse;
import com.oracle.pic.networking.lvv.frontend.api.AbstractLvvFrontendResource;
import com.oracle.pic.networking.lvv.frontend.auth.AuthHelper;
import com.oracle.pic.networking.lvv.frontend.auth.AuthVerbs;
import com.oracle.pic.networking.lvv.frontend.etag.EtagMismatchException;
import com.oracle.pic.networking.lvv.frontend.model.CreateLvvFrontendDetails;
import com.oracle.pic.networking.lvv.frontend.model.LvvFrontend;
import com.oracle.pic.networking.lvv.frontend.model.LvvFrontendCollection;
import com.oracle.pic.networking.lvv.frontend.model.LvvFrontendSummary;
import com.oracle.pic.networking.lvv.frontend.model.LifecycleState;
import com.oracle.pic.networking.lvv.frontend.model.SortOrders;
import com.oracle.pic.networking.lvv.frontend.model.UpdateLvvFrontendDetails;
import com.oracle.pic.networking.lvv.frontend.service.LvvFrontendService;
import com.oracle.pic.networking.lvv.frontend.utils.RenderableExceptionsGenerator;
import com.oracle.pic.identity.authentication.Principal;
import com.oracle.pic.identity.authorization.permissions.annotations.AuthorizationPermission;
import com.oracle.pic.identity.authorization.permissions.annotations.VariableOperationName;
import com.oracle.pic.identity.authorization.sdk.AuthorizationRequest;
import com.oracle.pic.identity.authorization.sdk.context.AuthorizationRequestContext;
import com.oracle.pic.identity.authorization.sdk.context.PrincipalContext;
import com.oracle.pic.sfw.dal.PaginatedResultSet;
import java.security.InvalidParameterException;
import javax.servlet.http.HttpServletResponse;
import javax.ws.rs.DELETE;
import javax.ws.rs.GET;
import javax.ws.rs.HeaderParam;
import javax.ws.rs.POST;
import javax.ws.rs.PUT;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.Context;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/*
* NOTE: when creating new resources, don't forget to add it to the list of resources in
* com.oracle.pic.networking.lvv.frontend.LvvFrontendApi

* NOTE: All resource methods defined in class are configured to have the 2XX, 4xx, 5xx, and
* time metrics automatically instrumented and emitted (by setting resourcePackagePrefix in metricsConfig)
* Don't forget to update resourcePackagePrefix if you update the package.
* See https://confluence.oci.oraclecorp.com/x/ThJuBQ for details.
*
* The @ServiceName value is part of the Observability Standardization, for more details
* and guidance on the value to use for this annotation, see
* https://confluence.oci.oraclecorp.com/display/OBSRV/Observability+Standardization+Onboarding
*/

@Slf4j
@Path("/20180828")
@Produces({"application/json"})
@ServiceName("lvv-frontend")
public class LvvFrontendResource extends AbstractLvvFrontendResource {

    private static final String SORT_BY_ENUM_TIMECREATED = "timeCreated";
    private static final String SORT_BY_ENUM_DISPLAYNAME = "displayName";
    private static final int DEFAULT_PAGE_SIZE = 100;

    private final AuthHelper authorizationHelper;
    private final LvvFrontendService lvvFrontendService;

    @Context
    @Getter(AccessLevel.PRIVATE)
    private HttpServletResponse httpServletResponse;

    @Inject
    protected LvvFrontendResource(
            AuthHelper authorizationHelper, LvvFrontendService lvvFrontendService) {
        this.authorizationHelper = authorizationHelper;
        this.lvvFrontendService = lvvFrontendService;
    }

    @Override
    @POST
    @Path("/lvvFrontends")
    @Produces({"application/json"})
    @AuthorizationPermission(AuthVerbs.LVV_FRONTEND_CREATE)
    @VariableOperationName("createLvvFrontend")
    public TaggedResponse<LvvFrontend> createLvvFrontend(
            CreateLvvFrontendDetails createLvvFrontendDetails,
            @HeaderParam("opc-retry-token") String opcRetryToken,
            @HeaderParam("opc-request-id") String opcRequestId,
            @PrincipalContext Principal principal,
            @AuthorizationRequestContext AuthorizationRequest authorizationRequest) {

        log.info(
                "Attempting to create resource: displayName {}, freeformTags {}, definedTags {}",
                createLvvFrontendDetails.getDisplayName(),
                createLvvFrontendDetails.getFreeformTags(),
                createLvvFrontendDetails.getDefinedTags());

        // Validate Inputs
        // TODO: Consider integrating parameter validation into the Bean validation step.
        ResourceUtils.validateRequiredParameter(
                "Compartment Id", createLvvFrontendDetails.getCompartmentId());
        ResourceUtils.validateRequiredParameter(
                "Display Name", createLvvFrontendDetails.getDisplayName());
        ResourceUtils.validateOptionalParameter("opcRetryToken", opcRetryToken);
        ResourceUtils.validateOptionalParameter("opcRequestId", opcRequestId);

        // Authorize
        authorizationHelper.authorize(
                authorizationRequest, createLvvFrontendDetails.getCompartmentId());

        final LvvFrontend lvvFrontend = lvvFrontendService.createLvvFrontend(createLvvFrontendDetails);

        try {
            // TODO: When updating operations that modify the preexisting resource at the
            //  service level, select a different etag value based on the fields that might change.
            //  lvvFrontendId will not change on update/modify operations and as such is not an
            //  appropriate value for an etag
            return new TaggedResponse<>(lvvFrontend, lvvFrontend.getId());
        } catch (InvalidParameterException ex) {
            throw RenderableExceptionsGenerator.generateInternalServerErrorException();
        }
    }

    @Override
    @GET
    @Path("/lvvFrontends")
    @Produces({"application/json"})
    @AuthorizationPermission(AuthVerbs.LVV_FRONTEND_INSPECT)
    @VariableOperationName("listLvvFrontend")
    public PaginatedCollectionResponse<LvvFrontendCollection> listLvvFrontends(
            @QueryParam("compartmentId") String compartmentId,
            @QueryParam("displayName") String displayName,
            @QueryParam("limit") Integer limit,
            @QueryParam("page") String page,
            @QueryParam("lifecycleState") LifecycleState lifecycleState,
            @QueryParam("sortOrder") SortOrders sortOrder,
            @QueryParam("sortBy") String sortBy,
            @HeaderParam("opc-request-id") String opcRequestId,
            @PrincipalContext Principal principal,
            @AuthorizationRequestContext AuthorizationRequest authorizationRequest) {
        // Log the call.
        log.info(
                "Attempting to list resources, compartmentId {}, limit {}, displayName {}, sortOrder {}, sortBy {}",
                compartmentId,
                limit,
                displayName,
                sortOrder,
                sortBy);

        // Validate Compartment Id, sortOrder, sortBy etc.
        ResourceUtils.validateRequiredParameter("compartmentId", compartmentId);
        ResourceUtils.validateOptionalParameter("displayName", displayName);
        ResourceUtils.validateOptionalParameter("opcRequestId", opcRequestId);
        ResourceUtils.validateOptionalParameter("page", page);
        ResourceUtils.validateOptionalParameter("sortBy", sortBy);
        ResourceUtils.validateOptionalPositiveIntegerParameter("limit", limit);

        // for valid authz you need to pass the correct compartment id
        authorizationHelper.authorize(authorizationRequest, compartmentId);

        sortBy = getSortBy(sortBy);

        // Query Service for result
        final PaginatedResultSet<LvvFrontendSummary> lvvFrontendQueryResults =
                lvvFrontendService.queryLvvFrontends(
                        compartmentId,
                        displayName,
                        lifecycleState == null ? null : lifecycleState.getValue(),
                        limit != null ? limit : DEFAULT_PAGE_SIZE,
                        page,
                        getInternalSortOrder(sortOrder, sortBy),
                        sortBy);

        final LvvFrontendCollection lvvFrontendCollection =
                LvvFrontendCollection.builder().items(lvvFrontendQueryResults.getResults()).build();
        return lvvFrontendQueryResults.hasNext()
                ? new PaginatedCollectionResponse<>(
                        lvvFrontendCollection,
                        lvvFrontendQueryResults.getNextPageToken().getSerializedToken())
                : new PaginatedCollectionResponse<>(lvvFrontendCollection);
    }

    @Override
    @DELETE
    @Path("/lvvFrontends/{lvvFrontendId}")
    @Produces({"application/json"})
    @AuthorizationPermission(AuthVerbs.LVV_FRONTEND_DELETE)
    @VariableOperationName("deleteLvvFrontend")
    public void deleteLvvFrontend(
            @PathParam("lvvFrontendId") String lvvFrontendId,
            @HeaderParam("if-match") String ifMatch,
            @HeaderParam("opc-request-id") String opcRequestId,
            @PrincipalContext Principal principal,
            @AuthorizationRequestContext AuthorizationRequest authorizationRequest) {
        log.info("Attempting to delete resource: resourceId {}", lvvFrontendId);

        // Validate Inputs
        ResourceUtils.validateRequiredParameter("lvvFrontendId", lvvFrontendId);
        ResourceUtils.validateOptionalParameter("opcRequestId", opcRequestId);

        final LvvFrontend lvvFrontend = lvvFrontendService.getLvvFrontend(lvvFrontendId);
        ResourceUtils.validateRequiredParameter("compartmentId", lvvFrontend.getCompartmentId());

        // TODO: For valid AuthZ you need to pass the correct compartment id. So please implement
        // your getLvvFrontend first.
        authorizationHelper.authorize(authorizationRequest, lvvFrontend.getCompartmentId());
        try {
            lvvFrontendService.deleteLvvFrontend(lvvFrontendId, ifMatch);
        } catch (EtagMismatchException ex) {
            throw RenderableExceptionsGenerator.generateEtagMismatchException(
                    ex.getEtag(), lvvFrontendId);
        }

        log.info("Successfully deleted resource: resourceId {}", lvvFrontendId);
    }

    @Override
    @GET
    @Path("/lvvFrontends/{lvvFrontendId}")
    @Produces({"application/json"})
    @AuthorizationPermission(AuthVerbs.LVV_FRONTEND_READ)
    @VariableOperationName("getLvvFrontend")
    public TaggedResponse<LvvFrontend> getLvvFrontend(
            @PathParam("lvvFrontendId") String lvvFrontendId,
            @HeaderParam("opc-request-id") String opcRequestId,
            @PrincipalContext Principal principal,
            @AuthorizationRequestContext AuthorizationRequest authorizationRequest) {
        log.info("GET resource resourceId:{}", lvvFrontendId);

        // Validate Inputs
        ResourceUtils.validateRequiredParameter("LvvFrontendId", lvvFrontendId);
        ResourceUtils.validateOptionalParameter("opcRequestId", opcRequestId);

        final LvvFrontend lvvFrontend = lvvFrontendService.getLvvFrontend(lvvFrontendId);
        ResourceUtils.validateRequiredParameter("compartmentId", lvvFrontend.getCompartmentId());

        // TODO: For valid AuthZ you need to pass the correct compartment id. So please implement
        // your getLvvFrontend first.
        authorizationHelper.authorize(authorizationRequest, lvvFrontend.getCompartmentId());

        try {
            // TODO: When updating operations that modify the preexisting resource at the
            //  service level, select a different etag value based on the fields that might change.
            //  lvvFrontendId will not change on update/modify operations and as such is not an
            //  appropriate value for an etag
            return new TaggedResponse<>(lvvFrontend, lvvFrontendId);
        } catch (InvalidParameterException ex) {
            throw RenderableExceptionsGenerator.generateInternalServerErrorException();
        }
    }

    @Override
    @PUT
    @Path("/lvvFrontends/{lvvFrontendId}")
    @Produces({"application/json"})
    @AuthorizationPermission(AuthVerbs.LVV_FRONTEND_UPDATE)
    @VariableOperationName("updateLvvFrontend")
    public TaggedResponse<LvvFrontend> updateLvvFrontend(
            @PathParam("lvvFrontendId") String lvvFrontendId,
            UpdateLvvFrontendDetails updateLvvFrontendDetails,
            @HeaderParam("if-match") String ifMatch,
            @HeaderParam("opc-request-id") String opcRequestId,
            @PrincipalContext Principal principal,
            @AuthorizationRequestContext AuthorizationRequest authorizationRequest) {

        log.info(
                "Attempting to update resource: resourceId {}, displayName {}, freeformTags {}, definedTags {}",
                lvvFrontendId,
                updateLvvFrontendDetails.getDisplayName(),
                updateLvvFrontendDetails.getFreeformTags(),
                updateLvvFrontendDetails.getDefinedTags());

        // Validate Inputs
        ResourceUtils.validateRequiredParameter("LvvFrontendId", lvvFrontendId);
        ResourceUtils.validateRequiredParameter(
                "Display Name", updateLvvFrontendDetails.getDisplayName());
        ResourceUtils.validateOptionalParameter("opcRequestId", opcRequestId);

        final LvvFrontend lvvFrontend = lvvFrontendService.getLvvFrontend(lvvFrontendId);
        ResourceUtils.validateRequiredParameter("compartmentId", lvvFrontend.getCompartmentId());

        // TODO: For valid AuthZ you need to pass the correct compartment id. So please implement
        // your getLvvFrontend first.
        authorizationHelper.authorize(authorizationRequest, lvvFrontend.getCompartmentId());

        try {
            final LvvFrontend updatedLvvFrontend =
                    lvvFrontendService.updateLvvFrontend(
                            lvvFrontend.getCompartmentId(),
                            lvvFrontendId,
                            updateLvvFrontendDetails,
                            ifMatch);
            // TODO: When updating operations that modify the preexisting resource at the
            //  service level, select a different etag value based on the fields that might change.
            //  lvvFrontendId will not change on update/modify operations and as such is not an
            //  appropriate value for an etag
            return new TaggedResponse<>(updatedLvvFrontend, lvvFrontendId);
        } catch (EtagMismatchException ex) {
            throw RenderableExceptionsGenerator.generateEtagMismatchException(
                    ex.getEtag(), lvvFrontendId);
        } catch (InvalidParameterException ex) {
            throw RenderableExceptionsGenerator.generateInternalServerErrorException();
        }
    }

    private String getSortBy(String sortBy) {
        if (isBlank(sortBy) || sortBy.toLowerCase().contains("time")) {
            return SORT_BY_ENUM_TIMECREATED;
        } else if (sortBy.toLowerCase().contains("display")) {
            return SORT_BY_ENUM_DISPLAYNAME;
        }

        throw RenderableExceptionsGenerator.generateInvalidParameterException("SortBy");
    }

    private SortOrders getInternalSortOrder(SortOrders sortOrder, String sortBy) {
        if (sortOrder == null) {
            return sortBy.equals(SORT_BY_ENUM_DISPLAYNAME) ? SortOrders.Asc : SortOrders.Desc;
        }

        if (sortOrder == SortOrders.Asc) {
            return SortOrders.Asc;
        } else if (sortOrder == SortOrders.Desc) {
            return SortOrders.Desc;
        }

        throw RenderableExceptionsGenerator.generateInvalidParameterException("SortOrder");
    }
}
