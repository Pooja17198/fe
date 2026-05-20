import { useCallback, useState } from "preact/hooks";
import "oj-c/button";
import DeviceAccordion from "./DeviceAccordion";
import { useRackValidation } from "./hooks/useRackValidation";
import { RackProps } from "./types";
import { downloadStreamingTabExcel } from "./streamingTabExcelDownloader";

const ValidationServiceRackTab = (props: RackProps) => {
  const [hideUnsupported, setHideUnsupported] = useState(true);
  const [externalExpandedKeys, setExternalExpandedKeys] = useState<Set<string>>(new Set());
  const [externalExpandedKeysNonce, setExternalExpandedKeysNonce] = useState(0);
  const [isMergedDownloadInProgress, setIsMergedDownloadInProgress] = useState(false);

  const {
    deviceStatuses,
    devicesLoading,
    validationFailuresByDevice,
    deviceRefreshTimestampsByName,
    patchPanelByDevicePort,
    totalFailureRows,
    totalLinkFailureRows,
    powerFailureDevices,
    selectedLinkKeys,
    setSelectedLinkKeys,
    isValidating,
    jobErrorDetails,
    isPeriodicValidationRefreshing,
    eligibleDeviceNames,
    onDemandValidationDeviceCount,
    rackValidationAllowed,
    rackValidationTooltip,
    periodicValidationEnabled,
    periodicValidationDeviceNames,
    validate,
    refreshPeriodicValidationResults,
  } = useRackValidation(props, { viewMode: "validationService" });

  const handleExpandAll = useCallback(() => {
    const deviceNamesWithFailures = new Set(
      Object.values(validationFailuresByDevice)
        .filter((device) => {
          return device.sectionOrder.some((sectionKey) => {
            const section = device.sections[sectionKey];
            if (!section) return false;
            if (String(section.title || "").trim().toLowerCase() === "lldp errors") {
              return hideUnsupported
                ? section.rows.some((row) => String(row.linkStatus).toUpperCase() !== "UNSUPPORTED")
                : section.rows.length > 0;
            }
            return section.rows.length > 0;
          });
        })
        .map((device) => device.deviceName)
    );

    const keys = deviceStatuses
      .filter((device) => deviceNamesWithFailures.has(device.deviceName))
      .map((d) => d._key);
    setExternalExpandedKeys(new Set(keys));
    setExternalExpandedKeysNonce((n) => n + 1);
  }, [hideUnsupported, validationFailuresByDevice, deviceStatuses]);

  const handleCollapseAll = useCallback(() => {
    setExternalExpandedKeys(new Set());
    setExternalExpandedKeysNonce((n) => n + 1);
  }, []);

  const handleStreamingTabDownload = useCallback(async () => {
    setIsMergedDownloadInProgress(true);
    try {
      await downloadStreamingTabExcel(props);
    } catch (error: any) {
      const message = error?.message ? String(error.message) : "Unknown error";
      window.alert(`Streaming tab Excel download failed: ${message}`);
    } finally {
      setIsMergedDownloadInProgress(false);
    }
  }, [props]);

  return (
    <div style={{ margin: "18px 0 32px 0" }}>
      {jobErrorDetails && (
        <div className="alert alert-danger" role="alert">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
          <div>Validation action failed!</div>
          {jobErrorDetails.code && (
            <div>
              <b>Code:</b> {jobErrorDetails.code}
            </div>
          )}
          {jobErrorDetails.message && (
            <div>
              <b>Message:</b> {jobErrorDetails.message}
            </div>
          )}
        </div>
      )}

      <div className="device-accordion-toolbar">
        <h3 className="device-accordion-summary-title">
          <span role="img" className="oj-icon validation-summary-icon" title="Validation Summary Image"></span>
          Validation Summary
        </h3>

        <div className="flex-spacer" />

        <oj-c-button
          chroming="callToAction"
          size="sm"
          label="Validate"
          onojAction={validate}
          style="margin-left: 8px; margin-right: 8px;"
          disabled={isValidating || onDemandValidationDeviceCount === 0 || !rackValidationAllowed}
          title={
            !rackValidationAllowed
              ? rackValidationTooltip
              : onDemandValidationDeviceCount === 0
                ? "No devices on this tab are enabled for on-demand validation."
                : ""
          }
        ></oj-c-button>
        <oj-c-button
          chroming="callToAction"
          size="sm"
          label={isMergedDownloadInProgress ? "Preparing Excel..." : "Download Excel"}
          onojAction={handleStreamingTabDownload}
          style="margin-left: 8px;"
          disabled={isMergedDownloadInProgress}
        ></oj-c-button>

        <label>
          <input
            type="checkbox"
            checked={hideUnsupported}
            onChange={(e) => setHideUnsupported((e.target as HTMLInputElement).checked)}
          />
          Hide Unsupported LLDP errors
        </label>

        <oj-c-button chroming="outlined" label="✚" tooltip="Expand All" onojAction={handleExpandAll} size="sm" class="action-btn"></oj-c-button>
        <oj-c-button chroming="outlined" label="－" tooltip="Collapse All" onojAction={handleCollapseAll} size="sm" class="action-btn"></oj-c-button>
      </div>

      <DeviceAccordion
        devices={deviceStatuses}
        eligibleDeviceNames={eligibleDeviceNames}
        building={props.building}
        block={props.block}
        rack={props.rack}
        rack_serial={props.rack_serial}
        isGpuRack={props.isGpuRack}
        region={props.region}
        periodicValidationDeviceNames={periodicValidationDeviceNames}
        isPeriodicValidationRefreshing={isPeriodicValidationRefreshing}
        onRefreshPeriodicValidation={refreshPeriodicValidationResults}
        validationFailuresByDevice={validationFailuresByDevice}
        deviceRefreshTimestampsByName={deviceRefreshTimestampsByName}
        patchPanelByDevicePort={patchPanelByDevicePort}
        totalFailureRows={totalFailureRows}
        totalLinkFailureRows={totalLinkFailureRows}
        powerFailureDevices={powerFailureDevices}
        selectedLinkKeys={selectedLinkKeys}
        setSelectedLinkKeys={setSelectedLinkKeys}
        loading={devicesLoading}
        isValidating={isValidating}
        hideUnsupported={hideUnsupported}
        rackValidationAllowed={rackValidationAllowed}
        rackValidationTooltip={rackValidationTooltip}
        periodicValidationEnabled={periodicValidationEnabled}
        viewMode="validationService"
        showSelection={false}
        externalExpandedKeys={externalExpandedKeys}
        externalExpandedKeysNonce={externalExpandedKeysNonce}
      />
    </div>
  );
};

export default ValidationServiceRackTab;
