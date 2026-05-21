import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import "oj-c/button";
import DeviceAccordion from "./DeviceAccordion";
import { useRackValidation } from "./hooks/useRackValidation";
import { RackProps } from "./types";

const NcpRackTab = (props: RackProps) => {
  const [hideUnsupported, setHideUnsupported] = useState(true);
  const [hideNotReadyDeviceErrors, setHideNotReadyDeviceErrors] = useState(true);
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
    isDownloading,
    eligibleDeviceNames,
    eligibleDeviceCount,
    rackValidationAllowed,
    rackValidationTooltip,
    periodicValidationEnabled,
    periodicValidationDeviceNames,
    resolveAllowed,
    resolveTooltip,
    validate,
    resolve,
    downloadExcel,
  } = useRackValidation(props, { viewMode: "ncp" });

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

  const handleResolve = useCallback(async () => {
    const result = await resolve();
    if (!(result as any)?.ok) {
      const msg = (result as any)?.message;
      if (msg && msg !== "Cancelled") {
        showToast(String(msg));
      }
    }
  }, [resolve, showToast]);

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
      {isValidating && (
        <div className="alert alert-warning" aria-live="polite" role="status">
          <span className="alert-icon" aria-hidden="true">⏳</span>
          Validation in progress...
        </div>
      )}

      {jobErrorDetails && (
        <div className="alert alert-danger" role="alert">
          <span className="alert-icon" aria-hidden="true">⚠️</span>
          <div>Validation failed!</div>
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
          disabled={isValidating || eligibleDeviceCount === 0 || !rackValidationAllowed}
          title={
            isValidating
              ? ""
              : !rackValidationAllowed
              ? rackValidationTooltip
              : eligibleDeviceCount === 0
              ? "Validation is available only for monitored and deployed devices."
              : ""
          }
        ></oj-c-button>
        <oj-c-button
          chroming="callToAction"
          size="sm"
          label="Resolve"
          onojAction={handleResolve}
          disabled={isValidating || !resolveAllowed}
          title={isValidating ? "" : resolveTooltip}
        ></oj-c-button>
        <oj-c-button
          chroming="callToAction"
          size="sm"
          label="Download Excel"
          onojAction={downloadExcel}
          style="margin-left: 8px;"
          disabled={isValidating || isDownloading || totalFailureRows === 0}
        ></oj-c-button>

        <label>
          <input
            type="checkbox"
            checked={hideUnsupported}
            onChange={(e) => setHideUnsupported((e.target as HTMLInputElement).checked)}
          />
          Hide Unsupported LLDP errors
        </label>

        {props.isGpuRack && (
          <label>
            <input
              type="checkbox"
              checked={hideNotReadyDeviceErrors}
              onChange={(e) =>
                setHideNotReadyDeviceErrors((e.target as HTMLInputElement).checked)
              }
            />
            Hide Not Ready Device Errors
          </label>
        )}

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
        isPeriodicValidationRefreshing={false}
        onRefreshPeriodicValidation={() => Promise.resolve({ ok: false as const, message: "Validation Service is not available in NCP." })}
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
        hideNotReadyDeviceErrors={hideNotReadyDeviceErrors}
        rackValidationAllowed={rackValidationAllowed}
        rackValidationTooltip={rackValidationTooltip}
        periodicValidationEnabled={periodicValidationEnabled}
        viewMode="ncp"
        showSelection={true}
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

export default NcpRackTab;
