package com.oracle.pic.networking.lvv.frontend.config;

import com.oracle.pic.commons.configuration.location.Location;
import com.oracle.pic.commons.configuration.location.LocationOverride;
import com.oracle.pic.commons.service.configuration.ServiceConfiguration;
import com.oracle.pic.commons.service.metrics.jersey.MetricsConfiguration;
import com.oracle.pic.commons.util.AvailabilityDomain;
import com.oracle.pic.commons.util.Realm;
import com.oracle.pic.commons.util.Region;
import com.oracle.pic.sherlock.collector.AuditConfig;
import com.oracle.pic.vault.SecretServiceConfig;
import io.dropwizard.bundles.assets.AssetsBundleConfiguration;
import io.dropwizard.bundles.assets.AssetsConfiguration;
import javax.validation.constraints.NotNull;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import org.apache.commons.lang3.Validate;

/** {@code LvvFrontendApiConfiguration} stores the configuration for the LvvFrontendApi. */
@Getter
@Setter
@ToString
public class LvvFrontendApiConfiguration extends ServiceConfiguration
        implements AssetsBundleConfiguration {

    // Because our use of Typesafe Config can't ignore properties.
    @NotNull private String logdir;

    @NotNull private MetricsConfiguration metricsConfig;

    private boolean adMappingDisabled;

    private AuditConfig auditConfig;

    @NotNull private AuthConfig authConfig;

    public void validateAdAndRegionConfiguration() {
        Validate.isTrue(getLocation().isValid());
    }

    @Getter(AccessLevel.NONE)
    @Setter(AccessLevel.NONE)
    private Location location;

    @Getter(AccessLevel.NONE)
    private LocationOverride locationOverride;

    @NotNull private AssetsConfiguration assets;

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

    public Realm getRealm() {
        return getRegion().getRealm();
    }

    public Region getRegion() {
        return getLocation().getRegion();
    }

    public AvailabilityDomain getAvailabilityDomain() {
        return getLocation().getAvailabilityDomain();
    }

    @Override
    public AssetsConfiguration getAssetsConfiguration() {
        return assets;
    }

    @NotNull private SecretServiceConfig secretServiceConfig;
}
