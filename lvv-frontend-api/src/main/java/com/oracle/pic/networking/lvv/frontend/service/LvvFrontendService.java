package com.oracle.pic.networking.lvv.frontend.service;

import com.google.inject.Inject;
import com.oracle.pic.commons.service.tagging.EtagUtils;
import com.oracle.pic.networking.lvv.frontend.etag.EtagMismatchException;
import com.oracle.pic.networking.lvv.frontend.model.CreateLvvFrontendDetails;
import com.oracle.pic.networking.lvv.frontend.model.LvvFrontend;
import com.oracle.pic.networking.lvv.frontend.model.LvvFrontendSummary;
import com.oracle.pic.networking.lvv.frontend.model.SortOrders;
import com.oracle.pic.networking.lvv.frontend.model.UpdateLvvFrontendDetails;
import com.oracle.pic.sfw.dal.PageableResultSet;
import com.oracle.pic.sfw.dal.PaginatedResultSet;
import java.util.Collections;
import java.util.Date;
import java.util.Random;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;

/** A dummy example class for illustration purposes. */
@Slf4j
public class LvvFrontendService {
    private final Random rand = new Random();

    @Inject
    public LvvFrontendService() {}

    public PaginatedResultSet<LvvFrontendSummary> queryLvvFrontends(
            String compartmentId,
            String displayName,
            String lifecycleState,
            int limit,
            String page,
            SortOrders sortOrder,
            String sortBy) {
        // todo: implement lvvFrontend query logic here.
        return new PageableResultSet<>(
                Collections.singletonList(
                        getTestLvvFrontendSummaryObject(compartmentId, displayName)),
                null,
                null,
                rand.nextInt());
    }

    public LvvFrontend createLvvFrontend(CreateLvvFrontendDetails createLvvFrontendDetails) {
        // todo: implement lvvFrontend creation logic here.
        String lvvFrontendId = UUID.randomUUID().toString();
        return getTestLvvFrontendObject(
                createLvvFrontendDetails.getCompartmentId(),
                createLvvFrontendDetails.getDisplayName(),
                lvvFrontendId);
    }

    public LvvFrontend getLvvFrontend(String lvvFrontendId) {
        // todo: implement service logic to retrieve lvvFrontend here.
        return getTestLvvFrontendObject(null, null, lvvFrontendId);
    }

    public LvvFrontend updateLvvFrontend(
            String compartmentId,
            String lvvFrontendId,
            UpdateLvvFrontendDetails updateLvvFrontendDetails,
            String ifMatch)
            throws EtagMismatchException {
        // todo: implement update functionality here
        if (!EtagUtils.etagMatches(lvvFrontendId, ifMatch)) {
            throw new EtagMismatchException(ifMatch);
        }

        return getTestLvvFrontendObject(
                compartmentId, updateLvvFrontendDetails.getDisplayName(), lvvFrontendId);
    }

    public void deleteLvvFrontend(String lvvFrontendId, String ifMatch) throws EtagMismatchException {
        if (!EtagUtils.etagMatches(lvvFrontendId, ifMatch)) {
            throw new EtagMismatchException(ifMatch);
        }
        // todo: implement lvvFrontend deletion logic here.
    }

    // Test method to return a test LvvFrontend object
    private LvvFrontendSummary getTestLvvFrontendSummaryObject(
            String compartmentId, String displayName) {
        return LvvFrontendSummary.builder()
                .compartmentId(compartmentId)
                .timeCreated(new Date())
                .displayName(displayName)
                .build();
    }

    // Test method to return a test LvvFrontendSummary object
    private LvvFrontend getTestLvvFrontendObject(
            String compartmentId, String displayName, String id) {
        // TODO: This is a dummy test compartmentId, pls replace with your implementation.
        if (compartmentId == null) {
            compartmentId =
                    "ocid1.compartment.oc1..aaaaaaaa26mceal7cypzsefhbm2l73xtb3yreplacemereplacemereplaceme";
        }
        return LvvFrontend.builder()
                .compartmentId(compartmentId)
                .displayName(displayName)
                .id(id)
                .timeCreated(new Date())
                .build();
    }
}
