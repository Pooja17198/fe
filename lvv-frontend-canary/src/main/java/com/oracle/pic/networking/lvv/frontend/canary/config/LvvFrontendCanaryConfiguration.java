package com.oracle.pic.networking.lvv.frontend.canary.config;

import com.oracle.pic.commons.configuration.location.Location;
import com.oracle.pic.commons.configuration.location.LocationOverride;
import com.oracle.pic.commons.service.configuration.ServiceConfiguration;
import com.oracle.pic.commons.service.metrics.jersey.MetricsConfiguration;
import com.oracle.pic.commons.util.AvailabilityDomain;
import com.oracle.pic.commons.util.Realm;
import com.oracle.pic.commons.util.Region;
import com.oracle.pic.vault.SecretServiceConfig;
import javax.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import org.apache.commons.lang3.Validate;

/**
 * {@code LvvFrontendCanaryConfiguration} stores the configuration for the LvvFrontendCanary.
 */
@Getter
@Setter
@ToString
public class LvvFrontendCanaryConfiguration extends ServiceConfiguration {

    // Because our use of Typesafe Config can't ignore properties.
    @NotNull private String logdir;

    @NotNull private MetricsConfiguration metricsConfig;

    private boolean adMappingDisabled;

    public void validateAdAndRegionConfiguration() {
        Validate.isTrue(getLocation().isValid());
    }

    @Getter(AccessLevel.NONE)
    @Setter(AccessLevel.NONE)
    private Location location;

    @Getter(AccessLevel.NONE)
    private LocationOverride locationOverride;

    /**
     * Allow config to override the region and AD so we don't look them up from /etc/region and
     * /etc/availability-domain.
     *
     * @return Location
     */
    private Location resolveLocation() {
        return (locationOverride == null)
                ? Location.fromEnvironmentFiles()
                : Location.fromLocationOverride(locationOverride);
    }

    private Location getLocation() {
        if (location == null) {
            location = resolveLocation();
        }
        return location;
    }

    public Region getRegion() {
        return getLocation().getRegion();
    }

    public Realm getRealm() {
        return getRegion().getRealm();
    }

    public AvailabilityDomain getAvailabilityDomain() {
        return getLocation().getAvailabilityDomain();
    }

    @NotNull private String userId;
    @NotNull private String fingerPrint;
    @NotNull private String tenantId;
    @NotNull private String privateKey;
    @NotNull private String canaryTestCompartmentId;
    @NotNull private String lvvFrontendEndpoint;

    @NotNull private SecretServiceConfig secretServiceConfig;
}
