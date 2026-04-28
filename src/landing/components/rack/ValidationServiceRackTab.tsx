import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import "oj-c/button";
import DeviceAccordion from "./DeviceAccordion";
import { useRackValidation } from "./hooks/useRackValidation";
import { RackProps } from "./types";

type RefreshIntervalOption = {
  value: number;
  label: string;
};

const PERIODIC_REFRESH_INTERVAL_OPTIONS: RefreshIntervalOption[] = [
  { value: 10_000, label: "10s" },
  { value: 30_000, label: "30s" },
  { value: 60_000, label: "1m" },
  { value: 120_000, label: "2m" },
];

const ValidationServiceRackTab = (props: RackProps) => {
  const summaryTitle = props.userType === "master" ? "Streaming" : "Validation Service";
  const [hideUnsupported, setHideUnsupported] = useState(true);
  const [externalExpandedKeys, setExternalExpandedKeys] = useState<Set<string>>(new Set());
  const [externalExpandedKeysNonce, setExternalExpandedKeysNonce] = useState(0);
  const [toastMsg, setToastMsg] = useState<string>("");
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const toastTimerRef = useRef<number | null>(null);

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
    rackValidationAllowed,
    rackValidationTooltip,
    periodicValidationEnabled,
    periodicValidationDeviceNames,
    periodicRefreshIntervalMs,
    setPeriodicRefreshIntervalMs,
    refreshPeriodicValidationResults,
  } = useRackValidation(props, { viewMode: "validationService" });

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
      toastTimerRef.current = null;
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleRefreshPeriodicValidation = useCallback(async () => {
    const result = await refreshPeriodicValidationResults();
    if (!(result as any)?.ok) {
      const msg = (result as any)?.message;
      if (msg) {
        showToast(String(msg));
      }
    }
  }, [refreshPeriodicValidationResults, showToast]);

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

  return (
    <div style={{ margin: "18px 0 32px 0" }}>
      {jobErrorDetails && (
        <div className="alert alert-danger" role="alert">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
          <div>Validation Service refresh failed!</div>
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
          {summaryTitle}
        </h3>

        <div className="flex-spacer" />

        <oj-c-button
          chroming="callToAction"
          size="sm"
          label={isPeriodicValidationRefreshing ? "Refreshing..." : "Refresh"}
          onojAction={handleRefreshPeriodicValidation}
          style="margin-left: 8px;"
          disabled={isPeriodicValidationRefreshing || periodicValidationDeviceNames.size === 0}
          title={periodicValidationDeviceNames.size === 0 ? "No devices are enabled for Validation Service." : ""}
        ></oj-c-button>

        <div className="device-periodic-refresh-interval">
          <select
            id="validationServiceRefreshInterval"
            className="device-periodic-refresh-native"
            value={String(periodicRefreshIntervalMs)}
            title="Validation Service refresh interval"
            aria-label="Validation Service refresh interval"
            onChange={(event) => {
              const nextValue = Number((event.target as HTMLSelectElement).value);
              if (Number.isFinite(nextValue) && nextValue > 0) {
                setPeriodicRefreshIntervalMs(nextValue);
              }
            }}
          >
            {PERIODIC_REFRESH_INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

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

      {toastVisible && (
        <div
          role="status"
          aria-live="polite"
          onClick={() => setToastVisible(false)}
          style={{
            position: "fixed",
            right: "16px",
            bottom: "16px",
            background: "#1f2937",
            color: "#fff",
            padding: "10px 12px",
            borderRadius: "6px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            cursor: "pointer",
            maxWidth: "360px",
            zIndex: 9999,
          }}
          title="Click to dismiss"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
};

export default ValidationServiceRackTab;
