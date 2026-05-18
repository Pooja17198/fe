import { h } from "preact";
import { useMemo, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojprogress-circle";
import "ojs/ojselectsingle";
import "ojs/ojtable";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import type { TableIntrinsicProps } from "ojs/ojtable";
import type { RackValidationSummary } from "../rack/validationShared";
import type {
  DeploymentGroupRackFilter,
  DeploymentGroupRackRow,
} from "./types";
import { useDeploymentGroupValidation } from "./useDeploymentGroupValidation";

type Props = {
  region: string;
  onPageChanged: (value: any) => void;
};

type FilterOption = {
  value: DeploymentGroupRackFilter;
  label: string;
};

type ErrorToken = {
  label: string;
  className: string;
  title: string;
};

const FILTER_OPTIONS: FilterOption[] = [
  { value: "all", label: "All racks" },
  { value: "failed", label: "Failed racks" },
  { value: "notValidated", label: "Not validated racks" },
  { value: "validated", label: "Validated racks" },
];

const RACK_COLUMNS: TableIntrinsicProps["columns"] = [
  { headerText: "Rack Location", field: "rackLocation", id: "rackLocation", sortable: "enabled" as const, width: "14%" },
  { headerText: "Rack Serial Number", field: "rackSerialNumber", id: "rackSerialNumber", sortable: "enabled" as const, width: "20%" },
  { headerText: "Block", field: "block", id: "block", sortable: "enabled" as const, width: "10%" },
  { headerText: "Platform", field: "platformName", id: "platformName", sortable: "enabled" as const, width: "16%" },
  { headerText: "Errors", field: "_errors", id: "errors", template: "errorsTemplate", width: "28%" },
  { headerText: "Details", field: "_details", id: "details", template: "detailsTemplate", width: "12%" },
];

const TABLE_ACCESSIBILITY = { rowHeader: "rackLocation" };

function readSelectionFromUrl(fallbackRegion: string) {
  const params = new URLSearchParams(window.location.search);
  return {
    region: params.get("region") || fallbackRegion,
    building: params.get("building") || "",
    deploymentGroup: params.get("deploymentGroup") || params.get("deploymentgroup") || "",
  };
}

function formatLastUpdatedTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function buildErrorTokens(summary: RackValidationSummary): ErrorToken[] {
  return [
    summary.lldpFailures > 0 ? {
      label: `LLDP:${summary.lldpFailures}`,
      className: "rack-status-chip lldp-failure",
      title: `${summary.lldpFailures} LLDP validation failure(s)`,
    } : null,
    summary.interfaceFailures > 0 ? {
      label: `INTERFACE:${summary.interfaceFailures}`,
      className: "rack-status-chip interface-failure",
      title: `${summary.interfaceFailures} interface validation failure(s)`,
    } : null,
    summary.opticModuleFailures > 0 ? {
      label: `OPTICS:${summary.opticModuleFailures}`,
      className: "rack-status-chip phoenix-optics-failure",
      title: `${summary.opticModuleFailures} optic validation failure(s)`,
    } : null,
    summary.fecBerFailures > 0 ? {
      label: `FEC BER:${summary.fecBerFailures}`,
      className: "rack-status-chip fec-ber-failure",
      title: `${summary.fecBerFailures} FEC BER validation failure(s)`,
    } : null,
    summary.hostOptFailures > 0 ? {
      label: `HOST_OPT:${summary.hostOptFailures}`,
      className: "rack-status-chip host-opt-failure",
      title: `${summary.hostOptFailures} host transceiver optic validation failure(s)`,
    } : null,
    summary.hostFecBerFailures > 0 ? {
      label: `HOST_FEC_BER:${summary.hostFecBerFailures}`,
      className: "rack-status-chip host-fec-ber-failure",
      title: `${summary.hostFecBerFailures} host transceiver FEC BER validation failure(s)`,
    } : null,
    summary.deviceFailures > 0 ? {
      label: `DEVICE:${summary.deviceFailures}`,
      className: "rack-status-chip device-failure",
      title: `${summary.deviceFailures} power or fan validation failure(s)`,
    } : null,
  ].filter((token): token is ErrorToken => Boolean(token));
}

function renderZeroErrors() {
  return <span class="device-accordion-failure-count success">0</span>;
}

function renderErrorTokens(tokens: ErrorToken[]) {
  if (tokens.length === 0) {
    return renderZeroErrors();
  }

  return (
    <span class="rack-status-cell">
      {tokens.map((token) => (
        <span key={token.label} class={token.className} title={token.title}>
          {token.label}
        </span>
      ))}
    </span>
  );
}

function compareRackRows(left: DeploymentGroupRackRow, right: DeploymentGroupRackRow): number {
  const blockCompare = left.block.localeCompare(right.block, undefined, { numeric: true });
  if (blockCompare !== 0) return blockCompare;
  return left.rackLocation.localeCompare(right.rackLocation, undefined, { numeric: true });
}

const DeploymentGroupValidationPage = ({ region, onPageChanged }: Props) => {
  const selection = readSelectionFromUrl(region);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<DeploymentGroupRackFilter>("all");
  const [failedFirst, setFailedFirst] = useState(true);

  const hasRequiredSelection =
    selection.region !== "" && selection.building !== "" && selection.deploymentGroup !== "";

  const {
    loading,
    loadingMessage,
    errorMessage,
    warningMessage,
    isValidating,
    jobMetadata,
    rows,
    summary,
    validateDeploymentGroup,
  } = useDeploymentGroupValidation(selection);

  const filterDataProvider = useMemo(
    () => new ArrayDataProvider<FilterOption["value"], FilterOption>(
      FILTER_OPTIONS,
      { keyAttributes: "value" }
    ),
    []
  );

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    let nextRows = rows.filter((row) => {
      if (q) {
        const haystack = [
          row.rackLocation,
          row.rackSerialNumber,
          row.platformName,
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }

      if (filter === "failed") return row.isValidated && row.errorSortValue > 0;
      if (filter === "notValidated") return !row.isValidated;
      if (filter === "validated") return row.isValidated;
      return true;
    });

    nextRows = [...nextRows].sort((left, right) => {
      if (failedFirst) {
        const leftFailed = left.isValidated && left.errorSortValue > 0;
        const rightFailed = right.isValidated && right.errorSortValue > 0;
        if (leftFailed !== rightFailed) {
          return leftFailed ? -1 : 1;
        }
      }
      return compareRackRows(left, right);
    });

    return nextRows;
  }, [rows, searchText, filter, failedFirst]);

  const dataProvider = useMemo(
    () => new ArrayDataProvider(filteredRows, { keyAttributes: "_key" }),
    [filteredRows]
  );

  const renderErrors = (context: any) => {
    const row = (context?.item && context.item.data) as DeploymentGroupRackRow;
    if (!row.isValidated) {
      return <span class="rack-status-text muted">NOT_VALIDATE</span>;
    }

    return renderErrorTokens(buildErrorTokens(row.summary));
  };

  const renderDetails = (context: any) => {
    const row = (context?.item && context.item.data) as DeploymentGroupRackRow;
    if (!row.detailsHref) {
      return <span class="rack-status-text muted">-</span>;
    }
    return (
      <a class="deployment-group-table-link" href={row.detailsHref}>
        rack details
      </a>
    );
  };

  if (!hasRequiredSelection) {
    return (
      <div class="deployment-group-page">
        <div class="deployment-group-access-denied" role="alert">
          Missing deployment group URL parameters.
        </div>
        <oj-button
          chroming="callToAction"
          onojAction={() => onPageChanged({ path: "deployment-group-validation" })}
        >
          Back to Deployment Group Selection
        </oj-button>
      </div>
    );
  }

  return (
    <div class="deployment-group-page">
      <div class="deployment-group-title-box">
        <span role="img" className="oj-icon rack-img-icon" title="Deployment Group"></span>
        <h2>
          Building: <span>{selection.building}</span>
          <span class="deployment-group-title-divider">|</span>
          Deployment Group: <span>{selection.deploymentGroup}</span>
        </h2>
      </div>

      {isValidating && (
        <div className="alert alert-warning" aria-live="polite" role="status">
          <span className="alert-icon" aria-hidden="true"></span>
          Validation in progress...
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-danger" role="alert">
          <span className="alert-icon" aria-hidden="true"></span>
          {errorMessage}
        </div>
      )}

      {warningMessage && (
        <div className="alert alert-warning" role="status">
          <span className="alert-icon" aria-hidden="true"></span>
          {warningMessage}
        </div>
      )}

      <div class="deployment-group-panel">
        <div class="deployment-group-toolbar">
          <oj-button
            chroming="callToAction"
            disabled={loading || isValidating || rows.length === 0}
            onojAction={validateDeploymentGroup}
          >
            {isValidating ? "Validating..." : "Validate Deployment Group"}
          </oj-button>
          <oj-button
            chroming="outlined"
            disabled={isValidating}
            onojAction={() => onPageChanged({ path: "deployment-group-validation" })}
          >
            Back
          </oj-button>
        </div>

        <div class="deployment-group-summary-grid">
          <div class="deployment-group-summary-cell">
            <div class="deployment-group-summary-label">Run Status</div>
            <div class="deployment-group-summary-value">{jobMetadata.jobStatus}</div>
          </div>
          <div class="deployment-group-summary-cell">
            <div class="deployment-group-summary-label">Last Update Time</div>
            <div class="deployment-group-summary-value">{formatLastUpdatedTime(jobMetadata.lastUpdatedTime)}</div>
          </div>
          <div class="deployment-group-summary-cell">
            <div class="deployment-group-summary-label">Total GPU Racks</div>
            <div class="deployment-group-summary-value">{summary.totalDgRacks}</div>
          </div>
          <div class="deployment-group-summary-cell">
            <div class="deployment-group-summary-label">Failed GPU Racks / Total Validated GPU Racks</div>
            <div class="deployment-group-summary-value">{summary.failedRacks} / {summary.totalValidatedRacks}</div>
          </div>
          <div class="deployment-group-summary-cell">
            <div class="deployment-group-summary-label">Not Validated GPU Racks</div>
            <div class="deployment-group-summary-value">{summary.notValidatedRacks}</div>
          </div>
          <div class="deployment-group-summary-cell">
            <div class="deployment-group-summary-label">Aggregated Errors</div>
            <div class="deployment-group-summary-value deployment-group-aggregated-errors">
              {renderErrorTokens(buildErrorTokens(summary.aggregate))}
            </div>
          </div>
        </div>

        <div class="deployment-group-update-note">
          Last Update Time is for deployment-group validation job metadata only. Rack results may include latest available rack-level results from deployment-group or single-rack validation.
        </div>
      </div>

      <div class="deployment-group-panel">
        <div class="deployment-group-filter-row">
          <label>
            <span>Search</span>
            <input
              type="text"
              value={searchText}
              placeholder="Rack, serial, or platform"
              onInput={(event: any) => setSearchText(event?.currentTarget?.value || "")}
            />
          </label>

          <oj-select-single
            id="deploymentGroupRackFilter"
            value={filter}
            data={filterDataProvider}
            itemText="label"
            labelHint="Filter"
            onvalueChanged={(event: any) => {
              const value = event?.detail?.value;
              if (value === "all" || value === "failed" || value === "notValidated" || value === "validated") {
                setFilter(value);
              }
            }}
          ></oj-select-single>

          <label class="deployment-group-checkbox">
            <input
              type="checkbox"
              checked={failedFirst}
              onChange={(event: any) => setFailedFirst(Boolean(event?.currentTarget?.checked))}
            />
            Failed racks first
          </label>
        </div>

        {loading ? (
          <div class="deployment-group-loading" role="status" aria-live="polite">
            <oj-progress-circle size="md" value={-1}></oj-progress-circle>
            <div>{loadingMessage || "Loading deployment group validation..."}</div>
          </div>
        ) : (
          <div class="deployment-group-table-wrap">
            <oj-table
              id="deploymentGroupValidationRackTable"
              class="selectable-table oj-table oj-table-hover oj-table-responsive deployment-group-results-table"
              aria-label="Deployment Group Validation Rack Table"
              data={dataProvider as any}
              columns={RACK_COLUMNS}
              accessibility={TABLE_ACCESSIBILITY}
            >
              <template slot="errorsTemplate" render={renderErrors} />
              <template slot="detailsTemplate" render={renderDetails} />
            </oj-table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeploymentGroupValidationPage;
