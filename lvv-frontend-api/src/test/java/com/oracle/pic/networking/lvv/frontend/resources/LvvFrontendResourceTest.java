package com.oracle.pic.networking.lvv.frontend.resources;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.oracle.pic.commons.service.model.PaginatedCollectionResponse;
import com.oracle.pic.commons.service.model.TaggedResponse;
import com.oracle.pic.networking.lvv.frontend.auth.AuthHelper;
import com.oracle.pic.networking.lvv.frontend.model.CreateLvvFrontendDetails;
import com.oracle.pic.networking.lvv.frontend.model.LvvFrontend;
import com.oracle.pic.networking.lvv.frontend.model.LvvFrontendCollection;
import com.oracle.pic.networking.lvv.frontend.model.LvvFrontendSummary;
import com.oracle.pic.networking.lvv.frontend.model.LifecycleState;
import com.oracle.pic.networking.lvv.frontend.model.SortOrders;
import com.oracle.pic.networking.lvv.frontend.model.UpdateLvvFrontendDetails;
import com.oracle.pic.networking.lvv.frontend.service.LvvFrontendService;
import com.oracle.pic.identity.authentication.Principal;
import com.oracle.pic.identity.authorization.sdk.AuthorizationRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;

public class LvvFrontendResourceTest {
    private final String compartmentId =
            "ocid1.compartment.oc1..aaaaaaaa26mceal7cypzsefhbm2l73xtb3yreplacemereplacemereplaceme";
    private final String displayName = "lvvFrontendTest";
    private final String lvvFrontendId = "lvvFrontendId";
    private final String ifMatch = "lvvFrontendId";
    private LvvFrontendResource resource;

    @Mock LifecycleState lifecycleState;

    @Mock private AuthHelper mockAuthorizationHelper;

    @Mock private Principal mockPrincipal;

    @Mock private AuthorizationRequest mockAuthorizationRequest;

    @BeforeEach
    public void setup() {
        MockitoAnnotations.initMocks(this);
        resource = new LvvFrontendResource(mockAuthorizationHelper, new LvvFrontendService());
        doNothing()
                .when(mockAuthorizationHelper)
                .authorize(any(AuthorizationRequest.class), anyString());
    }

    @Test
    public void createLvvFrontendTest() {
        CreateLvvFrontendDetails createLvvFrontendDetails =
                CreateLvvFrontendDetails.builder()
                        .compartmentId(compartmentId)
                        .displayName(displayName)
                        .build();
        TaggedResponse<LvvFrontend> lvvFrontend =
                resource.createLvvFrontend(
                        createLvvFrontendDetails,
                        "retryToken",
                        "requestId",
                        mockPrincipal,
                        mockAuthorizationRequest);
        assertEquals(lvvFrontend.getResult().getCompartmentId(), compartmentId);
        assertEquals(lvvFrontend.getResult().getDisplayName(), displayName);
    }

    @Test
    public void listLvvFrontendTest() {

        final PaginatedCollectionResponse<LvvFrontendCollection> lvvFrontendQueryResults =
                resource.listLvvFrontends(
                        compartmentId,
                        displayName,
                        10,
                        "1",
                        lifecycleState,
                        SortOrders.Desc,
                        "time",
                        "requestId",
                        mockPrincipal,
                        mockAuthorizationRequest);
        for (LvvFrontendSummary summary : lvvFrontendQueryResults.getCollection().getItems()) {
            assertEquals(summary.getCompartmentId(), compartmentId);
            assertEquals(summary.getDisplayName(), displayName);
        }
    }

    @Test
    public void getLvvFrontend() {
        TaggedResponse<LvvFrontend> lvvFrontend =
                resource.getLvvFrontend(
                        lvvFrontendId, "requestId", mockPrincipal, mockAuthorizationRequest);
        assertEquals(lvvFrontend.getResult().getId(), lvvFrontendId);
    }

    @Test
    public void updateLvvFrontend() {
        UpdateLvvFrontendDetails lvvFrontendDetails =
                UpdateLvvFrontendDetails.builder().displayName(displayName).build();

        TaggedResponse<LvvFrontend> lvvFrontend =
                resource.updateLvvFrontend(
                        lvvFrontendId,
                        lvvFrontendDetails,
                        null,
                        "requestId",
                        mockPrincipal,
                        mockAuthorizationRequest);
        assertEquals(lvvFrontend.getResult().getId(), lvvFrontendId);
        assertEquals(lvvFrontendDetails.getDisplayName(), displayName);
    }

    @Test
    public void deleteLvvFrontend() {
        resource.deleteLvvFrontend(
                lvvFrontendId, null, "requestId", mockPrincipal, mockAuthorizationRequest);
        verify(mockAuthorizationHelper, times(1)).authorize(any(), Mockito.anyString());
    }
}
