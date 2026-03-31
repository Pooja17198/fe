import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import "oj-c/button";
import DeviceAccordion from "./DeviceAccordion";
import { useRackValidation } from "./hooks/useRackValidation";
import { RackProps } from "./types";
import { isGpuComputeDevice } from "./utils";

const Rack = (props: RackProps) => {
  const isFirstRender = useRef(true);
  const [hideUnsupported, setHideUnsupported] = useState(true);
  const [externalExpandedKeys, setExternalExpandedKeys] = useState<Set<string>>(new Set());
  const [externalExpandedKeysNonce, setExternalExpandedKeysNonce] = useState(0);

  const {
    deviceStatuses,
    devicesLoading,
    validationFailuresByDevice,
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
    resolveFeatureEnabled,
    resolveAllowed,
    resolveTooltip,
    validate,
    resolve,
    downloadExcel,
  } = useRackValidation(props);

  // Lightweight toast for non-intrusive errors
  const [toastMsg, setToastMsg] = useState<string>("");
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const toastTimerRef = useRef<number | null>(null);

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

  // Log reason when Resolve is disabled
  useEffect(() => {
    if (!resolveFeatureEnabled) {
      const reason = (props as any)?.resolveDisabledReason;
      const msg = reason && String(reason).trim() !== "" ? reason : "(no reason provided by backend)";
      console.info("Resolve disabled for this rack:", msg);
    }
  }, [resolveFeatureEnabled, (props as any)?.resolveDisabledReason]);

  const handleResolve = useCallback(async () => {
    const result = await resolve();
    if (!(result as any)?.ok) {
      const msg = (result as any)?.message;
      if (msg && msg !== "Cancelled") {
        showToast(String(msg));
      }
    }
  }, [resolve, showToast]);

  // When region changes, go to home page (except on initial mount)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    props.onPageChanged({ path: "home" });
  }, [props.region]);

  // Expand/Collapse all controls for device accordion
  const handleExpandAll = useCallback(() => {
    const deviceNamesWithFailures = new Set(
        Object.values(validationFailuresByDevice)
            .filter((device) => {
              const hasVisibleLldp = hideUnsupported
                  ? device.tests.lldp.some((row) => String(row.linkStatus).toUpperCase() !== "UNSUPPORTED")
                  : device.tests.lldp.length > 0;
              if (isGpuComputeDevice(device.deviceName, props.isGpuRack)) {
                return (
                    hasVisibleLldp ||
                    device.tests.optics.length > 0 ||
                    device.tests.interfaces.length > 0 ||
                    device.tests.fecBer.length > 0
                );
              }
              return (
                  hasVisibleLldp ||
                  device.tests.optics.length > 0 ||
                  device.tests.interfaces.length > 0 ||
                  device.tests.fecBer.length > 0 ||
                  device.tests.fans.length > 0
              );
            })
            .map((device) => device.deviceName)
    );

    const keys = deviceStatuses
        .filter((device) => deviceNamesWithFailures.has(device.deviceName))
        .map((d) => d._key);
    setExternalExpandedKeys(new Set(keys));
    setExternalExpandedKeysNonce((n) => n + 1);
  }, [hideUnsupported, validationFailuresByDevice, deviceStatuses, props.isGpuRack]);

  const handleCollapseAll = useCallback(() => {
    setExternalExpandedKeys(new Set());
    setExternalExpandedKeysNonce((n) => n + 1);
  }, []);

  return (
      <div class="rack-page">
        <div class="rack-title-box">
          {/* <span role="img" className="oj-icon rack-img-icon" title="Rack Image" alt="Rack Image"></span> */}
          <span role="img" className="oj-icon rack-img-icon" title="Rack Image" ></span>
          <h2 class="rack-title-headline">
            <span className="rack-title-key">Building:</span>
            <span className="rack-title-value">{props.building}</span>
            <span className="rack-title-key">Block:</span>
            <span className="rack-title-value">{props.block}</span>
            <span className="rack-title-key">Rack:</span>
            <span className="rack-title-value">{props.rack}</span>
            <span className="rack-title-key">Serial:</span>
            <span className="rack-title-value">{props.rack_serial}</span>
          </h2>
        </div>

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

        <div style={{ margin: "18px 0 32px 0" }}>
          <div className="device-accordion-toolbar">
            {/*Title*/}
            <h3 className="device-accordion-summary-title">
              {/* <span role="img" className="oj-icon validation-summary-icon" title="Validation Summary Image" alt="Validation Summary Image"></span> */}
              <span role="img" className="oj-icon validation-summary-icon" title="Validation Summary Image"></span>
              Validation Summary
            </h3>

            <div className="flex-spacer" />

            {/* Primary actions */}
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

            {/*Unsupported errors checkbox*/}
            <label>
              <input
                  type="checkbox"
                  checked={hideUnsupported}
                  onChange={(e) => setHideUnsupported((e.target as HTMLInputElement).checked)}
              />
              Hide Unsupported LLDP errors
            </label>

            {/*Expand All/Collapse All button*/}
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
              validationFailuresByDevice={validationFailuresByDevice}
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
      </div>
  );
};

export default Rack;