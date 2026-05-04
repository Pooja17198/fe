import { useState, useEffect } from "preact/hooks";
import "ojs/ojaccordion";
import "ojs/ojcollapsible";
import "oj-c/button";
import "oj-c/conveyor-belt";
import { useRackView } from "../api/hooks/materialApi";
import { UseMockData } from "./GraphView";
import {
  RackDeviceSummary,
  PatchPanelPortSummary,
} from "gen/clients/ide-lvv-client";

interface PhysicalCutsheetProps {
  gpuRacks: string[];
  roomName: string | undefined;
  initialSelectedRack?: string | null;
  onRackHover?: (rackId: string | null) => void;
  disableBackButton?: boolean;
}

const escapeCsvCell = (value: unknown) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

const buildRackViewEasyMarkRows = (
  devices: RackDeviceSummary[],
): string[] =>
  devices.flatMap((device) =>
    (device.patchPanel ?? [])
      .flat()
      .map((port) =>
        (port.easyMark ?? [])
          .filter((easyMark) => easyMark.trim().length > 0)
          .join("\n"),
      )
      .filter((easyMarkBlock) => easyMarkBlock.length > 0),
  );

const downloadEasyMarkCsv = (
  easyMarkRows: string[],
  roomName: string | undefined,
  rackNumber: string,
) => {
  const csvRows = easyMarkRows.map((easyMark) => escapeCsvCell(easyMark));

  const blob = new Blob([`\ufeff${csvRows.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = `${roomName ?? "room"}-rack-${rackNumber}-easymark.csv`
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_");
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const PhysicalCutsheetPanel = ({
  gpuRacks,
  roomName,
  initialSelectedRack,
  onRackHover,
  disableBackButton,
}: PhysicalCutsheetProps) => {
  const {
    data: rackViewData,
    isFetching: rackViewLoading,
    refetch: refetchRackView,
    error: physicalCutsheetsError,
  } = useRackView(UseMockData);

  const [selectedRack, setSelectedRack] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPort, setDialogPort] = useState<{
    port: PatchPanelPortSummary;
    deviceName: string;
  } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const handlePortClick = (port: PatchPanelPortSummary, deviceName: string) => {
    setDialogPort({ port, deviceName });
    setDialogOpen(true);
  };
  // const parseKeyValueErrorString = (raw: string): Record<string, string> => {
  //   const text = raw.trim();
  //   const withoutBraces =
  //     text.startsWith("{") && text.endsWith("}") ? text.slice(1, -1) : text;

  //   const result: Record<string, string> = {};
  //   // Split on ", " at top level – safe for current mock format
  //   const parts = withoutBraces.split(/,\s*/);

  //   for (const part of parts) {
  //     const eqIndex = part.indexOf("=");
  //     if (eqIndex === -1) continue;
  //     const key = part.slice(0, eqIndex).trim();
  //     const value = part.slice(eqIndex + 1).trim();
  //     result[key] = value;
  //   }
  //   return result;
  // };

  // const renderFormattedError = (raw: string, idx: number) => {
  //   const parsed = parseKeyValueErrorString(raw);
  //   const keys = Object.keys(parsed);

  //   // If parsing didn't really work (no keys), just show the raw string.
  //   if (!keys.length) {
  //     return (
  //       <div key={idx} style={{ marginBottom: "8px" }}>
  //         {raw}
  //       </div>
  //     );
  //   }

  //   return (
  //     <div
  //       key={idx}
  //       className="gpu-error-entry"
  //       style={{ marginBottom: "8px" }}
  //     >
  //       {keys.map((key) => (
  //         <div key={key} className="gpu-error-kv-line">
  //           <span className="gpu-error-kv-key" style={{ fontWeight: "bold" }}>
  //             {key}:
  //           </span>{" "}
  //           <span className="gpu-error-kv-value">{parsed[key]}</span>
  //         </div>
  //       ))}
  //     </div>
  //   );
  // };

  useEffect(() => {
    if (initialSelectedRack) {
      setSelectedRack(initialSelectedRack);
    } else {
      setSelectedRack(null);
    }
  }, [initialSelectedRack, gpuRacks]);

  // When selectedRack changes, call API. Rendering uses rackViewData directly.
  useEffect(() => {
    if (!roomName || !selectedRack) return;
    refetchRackView(roomName, selectedRack);
  }, [roomName, selectedRack]);

  // If no GPU racks passed, nothing to show
  if (!gpuRacks || gpuRacks.length === 0) {
    return (
      <div className="material-panel">
        <p className="oj-helper-text-align-center">No GPU racks available</p>
      </div>
    );
  }

  // View 1: rack list (from gpuRacks)
  if (!selectedRack) {
    return (
      <div className="material-panel">
        <strong class="oj-typography-heading-4">GPU Rack list</strong>
        <ul className="rack-list rack-list--no-indicator">
          {gpuRacks.sort().map((rack, index) => (
            <li
              key={rack}
              className="rack-list-item"
              onClick={() => setSelectedRack(rack)}
              onMouseEnter={() => onRackHover?.(rack)}
              onMouseLeave={() => onRackHover?.(null)}
            >
              <div className="rack-list-item-shape">
                <div className="rack-list-item-text">
                  <strong>Rack {rack}</strong>
                </div>
              </div>
              {index < gpuRacks.length - 1 && (
                <div className="rack-list-separator" />
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const devices: RackDeviceSummary[] = rackViewData?.rackDevices ?? [];

  // Helper: extract "1-1" from "slot1/port1-1"
  const toShortLabel = (portName?: string) => {
    if (!portName) return "";
    const dashIdx = portName.indexOf("-");
    if (dashIdx === -1) return portName;
    return portName.substring(dashIdx - 1);
  };

  // Helper: determine slot number from portName ("slot1/..." or "slot2/...")
  const getSlotNumber = (portName?: string): 1 | 2 | null => {
    if (!portName) return null;
    if (portName.startsWith("slot1/")) return 1;
    if (portName.startsWith("slot2/")) return 2;
    return null;
  };

  const handleExportEasyMark = async () => {
    if (!selectedRack || !roomName) return;
    setExportLoading(true);

    try {
      downloadEasyMarkCsv(
        buildRackViewEasyMarkRows(devices),
        roomName,
        selectedRack,
      );
    } finally {
      setExportLoading(false);
    }
  };

  // View 2: directly render rackDevices and their patchPanel ports
  return (
    <div className="material-panel">
      {!!disableBackButton && (
        <oj-button
          chroming="solid"
          onojAction={() => {
            setSelectedRack(null);
            onRackHover?.(null);
          }}
        >
          <span slot="startIcon" class="oj-ux-ico-arrow-left-alt"></span>
          Back to rack list
        </oj-button>
      )}

      <div className="rack-detail-header">
        <strong class="oj-typography-heading-4">
          Rack {selectedRack} ({rackViewLoading ? "..." : devices.length}{" "}
          devices)
        </strong>
        <oj-c-button
          chroming="borderless"
          disabled={rackViewLoading || exportLoading || !roomName}
          onojAction={handleExportEasyMark}
          label={exportLoading ? "Exporting easyMark" : "Export easyMark"}
        >
          <span slot="startIcon" class="oj-ux-ico-download"></span>
        </oj-c-button>
      </div>

      {physicalCutsheetsError && (
        <div className="oj-message oj-message-error">
          Error loading rack view data
        </div>
      )}

      {devices.length === 0 && !rackViewLoading && (
        <div className="oj-helper-text-align-center">
          No rack view data available for this rack.
        </div>
      )}

      {rackViewLoading ? (
        <p className="oj-helper-text-align-center">Loading...</p>
      ) : (
        devices
          .sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0))
          .map((device, deviceIdx) => {
            // Flatten patchPanel rows into a single list of ports
            const allPorts: PatchPanelPortSummary[] = (
              device.patchPanel ?? []
            ).flat();

            // const hasDeviceError = allPorts.some((p) => p.hasError);

            // const hasAnyEasyMark = allPorts.some(
            //   (p) =>
            //     p.easyMark && Array.isArray(p.easyMark) && p.easyMark.length > 0,
            // );

            // const noEasyMarkOnDevice = !hasDeviceError && !hasAnyEasyMark;

            // Separate into slot1 / slot2
            const slot1Ports = allPorts.filter(
              (p) => getSlotNumber(p.portName) === 1,
            );
            const slot2Ports = allPorts.filter(
              (p) => getSlotNumber(p.portName) === 2,
            );

            // Helper to render one slot as 8x2 grid
            const renderSlotGrid = (
              slotLabel: "slot1" | "slot2",
              ports: PatchPanelPortSummary[],
            ) => {
              if (!ports.length) return null;

              // First 16 ports in row-major order for 8x2
              const maxCells = 16;
              const cells = ports.slice(0, maxCells);
              return (
                <div className="slot-section">
                  <div className="slot-title">{slotLabel}</div>
                  <div
                    className="slot-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(8, 1fr)",
                      gridAutoRows: "auto",
                    }}
                  >
                    {cells.map((port, idx) => {
                      // const hasEasyMark =
                      //   !!port.easyMark &&
                      //   Array.isArray(port.easyMark) &&
                      //   port.easyMark.length > 0;

                      // const portStatusClass = port.hasError
                      //   ? "port-status-circle--error"
                      //   : hasEasyMark
                      //     ? "port-status-circle--ok"
                      //     : "port-status-circle--no-easymark"; // NEW: grey

                      return (
                        <div
                          key={`${slotLabel}-cell-${idx}`}
                          className="slot-grid-cell"
                          onClick={() =>
                            handlePortClick(
                              port,
                              device.deviceName ?? "Unknown Device",
                            )
                          }
                        >
                          {/* <span
                          className={`port-status-circle ${portStatusClass}`}
                        /> */}
                          {toShortLabel(port.portName) || "\u00A0"}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            };

            return (
              <oj-collapsible
                key={`${selectedRack}-device-${deviceIdx}`}
                id={`rack-${selectedRack}-device-${deviceIdx}`}
                expanded={false}
                icon-position="end"
              >
                {/* Device header: show deviceName and elevation */}
                <div slot="header" className={"elevation-accordion-header"}>
                  {/* <span className="elevation-status-indicator-wrapper">
                  <span
                    className={`elevation-status-indicator ${
                      hasDeviceError
                        ? "elevation-status-indicator--error"
                        : noEasyMarkOnDevice
                          ? "elevation-status-indicator--no-easymark"
                          : "elevation-status-indicator--ok"
                    }`}
                  />
                </span> */}
                  <span title={device.deviceName}>
                    <strong class="oj-typography-heading-4 oj-sm-margin-2x-end">
                      {device.elevation !== undefined
                        ? `U${device.elevation} `
                        : ""}
                    </strong>
                    {device.deviceName || "Unknown Device"}
                  </span>
                </div>

                {/* Device body: slot2 on top, then slot1, each as 8x2 grid */}
                <div className="device-slot-grids">
                  {renderSlotGrid("slot2", slot2Ports)}
                  {renderSlotGrid("slot1", slot1Ports)}
                </div>
              </oj-collapsible>
            );
          })
      )}
      <oj-c-dialog
        id="easymarkCompareDialog"
        opened={dialogOpen}
        aria-describedby="easymarkCompareBody"
        dialog-title={`Device:${dialogPort?.deviceName ?? ""}, Port:${dialogPort?.port?.portName ?? ""}`}
        // width={rackViewLoading ? "600px" : "900px"}
        // maxWidth={rackViewLoading ? "600px" : "900px"}
      >
        <div
          slot="body"
          id="easymarkCompareBody"
          class="oj-sm-padding-4x validation-easymark-dialog-body"
        >
          {rackViewLoading ? (
            <div class="oj-helper-text-align-center">
              <oj-c-progress-circle
                aria-labelledby="lgLabel indetLabel"
                size="lg"
                value={-1}
              ></oj-c-progress-circle>
              <h4 class="oj-md-padding-5x-vertical">
                Loading Physical Cutsheets...
              </h4>
            </div>
          ) : dialogPort &&
            dialogPort.port.easyMark &&
            dialogPort.port.easyMark.length > 0 ? (
            <div className="elevation-easymark">
              <span className="info-key">
                easyMark for port {dialogPort.port.portName}:
              </span>
              <oj-c-conveyor-belt orientation="vertical" class="oj-flex-item">
                {dialogPort.port.easyMark.map((easyMarkItem, index) => (
                  <div key={index} class="oj-panel easyMark-item">
                    {easyMarkItem}
                  </div>
                ))}
              </oj-c-conveyor-belt>
            </div>
          ) : (
            <span className="info-value">No easyMark data for this port</span>
          )}
          {/* {dialogPort?.port?.errors?.map((error, idx) => (
            <div key={idx} style={{ marginBottom: "16px" }}>
              {error.lldpErrors && error.lldpErrors?.length > 0 && (
                <>
                  <div
                    class="oj-table-column-header-text"
                    style={{ fontWeight: "bold", marginBottom: "8px" }}
                  >
                    LLDP Errors
                  </div>
                  {error.lldpErrors.map((err, idx) => (
                    <div key={idx} style={{ marginBottom: "4px" }}>
                      {renderFormattedError(err, idx)}
                    </div>
                  ))}
                </>
              )}
              {error.opticErrors && error.opticErrors?.length > 0 && (
                <>
                  <div
                    class="oj-table-column-header-text"
                    style={{ fontWeight: "bold", marginBottom: "8px" }}
                  >
                    Optic Errors
                  </div>
                  {error.opticErrors.map((err, idx) => (
                    <div key={idx} style={{ marginBottom: "4px" }}>
                      {renderFormattedError(err, idx)}
                    </div>
                  ))}
                </>
              )}
              {error.interfaceErrors && error.interfaceErrors?.length > 0 && (
                <>
                  <div
                    class="oj-table-column-header-text"
                    style={{ fontWeight: "bold", marginBottom: "8px" }}
                  >
                    Interface Errors
                  </div>
                  {error.interfaceErrors.map((err, idx) => (
                    <div key={idx} style={{ marginBottom: "4px" }}>
                      {renderFormattedError(err, idx)}
                    </div>
                  ))}
                </>
              )}
            </div>
          ))} */}
        </div>
        <div
          slot="footer"
          class="oj-sm-padding-2x oj-sm-flex oj-sm-justify-content-flex-end"
        >
          {!rackViewLoading && (
            <oj-c-button
              chroming="borderless"
              onojAction={() => {
                setDialogOpen(false);
                setDialogPort(null);
              }}
              label="Close"
            ></oj-c-button>
          )}
        </div>
      </oj-c-dialog>
    </div>
  );
};
