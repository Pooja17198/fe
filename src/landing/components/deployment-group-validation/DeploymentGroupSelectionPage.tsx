import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojnavigationlist";
import "ojs/ojselectsingle";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import { ojTabBar } from "ojs/ojnavigationlist"; // eslint-disable-line no-duplicate-imports
import {
  fetchRackNumberByHostSerial,
} from "./api";
import {
  findDeploymentGroupByRackNumber,
  getDeploymentGroupBuildings,
  getDeploymentGroupNames,
  getDeploymentGroupRackNumbers,
} from "./config";

type Props = {
  region: string;
  onPageChanged: (value: any) => void;
};

type SelectOption = {
  value: string;
  label: string;
};

type SearchTab = "selectDeploymentGroup" | "searchByDevice";
type SearchIdentifierType = "hostSerial";
type TabOption = {
  value: SearchTab;
  label: string;
};

const TAB_OPTIONS: TabOption[] = [
  { value: "selectDeploymentGroup", label: "Select Deployment Group" },
  { value: "searchByDevice", label: "Search Deployment Group by Host" },
];

const IDENTIFIER_TYPE_OPTIONS: SelectOption[] = [
  { value: "hostSerial", label: "Host Serial" },
];

function buildOptions(values: string[]): SelectOption[] {
  return values.map((value) => ({ value, label: value }));
}

const DeploymentGroupSelectionPage = ({ region, onPageChanged }: Props) => {
  const [activeTab, setActiveTab] = useState<SearchTab>("selectDeploymentGroup");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedDeploymentGroup, setSelectedDeploymentGroup] = useState("");
  const [selectedIdentifierType, setSelectedIdentifierType] = useState<SearchIdentifierType>("hostSerial");
  const [hostSerial, setHostSerial] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const buildings = useMemo(() => getDeploymentGroupBuildings(region), [region]);
  const deploymentGroups = useMemo(
    () => selectedBuilding ? getDeploymentGroupNames(region, selectedBuilding) : [],
    [region, selectedBuilding]
  );

  useEffect(() => {
    setSelectedBuilding((current) => buildings.includes(current) ? current : buildings[0] || "");
  }, [buildings]);

  useEffect(() => {
    setSelectedDeploymentGroup((current) =>
      deploymentGroups.includes(current) ? current : deploymentGroups[0] || ""
    );
  }, [deploymentGroups]);

  const selectedRacks = useMemo(
    () => selectedBuilding && selectedDeploymentGroup
      ? getDeploymentGroupRackNumbers(region, selectedBuilding, selectedDeploymentGroup)
      : [],
    [region, selectedBuilding, selectedDeploymentGroup]
  );

  const buildingDataProvider = useMemo(
    () => new ArrayDataProvider<SelectOption["value"], SelectOption>(
      buildOptions(buildings),
      { keyAttributes: "value" }
    ),
    [buildings]
  );

  const deploymentGroupDataProvider = useMemo(
    () => new ArrayDataProvider<SelectOption["value"], SelectOption>(
      buildOptions(deploymentGroups),
      { keyAttributes: "value" }
    ),
    [deploymentGroups]
  );

  const identifierTypeDataProvider = useMemo(
    () => new ArrayDataProvider<SelectOption["value"], SelectOption>(
      IDENTIFIER_TYPE_OPTIONS,
      { keyAttributes: "value" }
    ),
    []
  );

  const tabDataProvider = useMemo(
    () => new ArrayDataProvider<TabOption["value"], TabOption>(
      TAB_OPTIONS,
      { keyAttributes: "value" }
    ),
    []
  );

  const canNavigate = selectedBuilding !== "" && selectedDeploymentGroup !== "";
  const canSearch = hostSerial.trim() !== "" && !isSearching;

  const tabItemTemplate = (item: ojTabBar.ItemContext<TabOption["value"], TabOption>) => (
    <li>
      <a href="#">{item.data.label}</a>
    </li>
  );

  const handleSearchAndValidate = async () => {
    const normalizedHostSerial = hostSerial.trim();
    if (!normalizedHostSerial) {
      setSearchError("Host serial is required.");
      return;
    }

    setSearchError(null);
    setIsSearching(true);

    try {
      let rackNumber = "";
      if (selectedIdentifierType === "hostSerial") {
        rackNumber = await fetchRackNumberByHostSerial({
          region,
          hostSerial: normalizedHostSerial,
        });
      }

      const deploymentGroupMatch = findDeploymentGroupByRackNumber(region, rackNumber);
      if (!deploymentGroupMatch) {
        throw new Error(
          `No deployment group mapping was found for rack number ${rackNumber} in region ${region}.`
        );
      }

      onPageChanged({
        path: "deployment-group-validation-page",
        query: {
          region,
          building: deploymentGroupMatch.building,
          deploymentGroup: deploymentGroupMatch.deploymentGroup,
          autoValidate: "true",
          autoValidateSource: "deviceSearch",
        },
      });
    } catch (error) {
      const message = (error as any)?.message
        ? String((error as any).message)
        : "Unable to search deployment group by host serial.";
      setSearchError(message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div class="deployment-group-page">
      <h2 class="deployment-group-heading">Deployment Group Validation</h2>

      <div class="deployment-group-panel">
        <div class="deployment-group-panel-header">
          <span role="img" className="oj-icon validation-summary-icon" title="Deployment Group"></span>
          <h3>Deployment Group Lookup</h3>
        </div>

        <div class="deployment-group-tab-row">
          <oj-tab-bar
            class="deployment-group-tab-bar"
            edge="top"
            data={tabDataProvider}
            selection={activeTab}
            onselectionChanged={(event: any) => {
              const value = event?.detail?.value;
              if (value === "selectDeploymentGroup" || value === "searchByDevice") {
                setActiveTab(value);
                setSearchError(null);
              }
            }}
          >
            <template slot="itemTemplate" render={tabItemTemplate}></template>
          </oj-tab-bar>
        </div>

        {activeTab === "selectDeploymentGroup" ? (
          <>
            <div class="deployment-group-selector-grid">
              <oj-select-single
                id="deploymentGroupBuildingSelect"
                value={selectedBuilding}
                data={buildingDataProvider}
                itemText="label"
                labelHint="Building"
                onvalueChanged={(event: any) => {
                  const value = event?.detail?.value;
                  if (typeof value === "string") {
                    setSelectedBuilding(value);
                  }
                }}
              ></oj-select-single>

              <oj-select-single
                id="deploymentGroupSelect"
                value={selectedDeploymentGroup}
                data={deploymentGroupDataProvider}
                itemText="label"
                labelHint="Deployment Group"
                onvalueChanged={(event: any) => {
                  const value = event?.detail?.value;
                  if (typeof value === "string") {
                    setSelectedDeploymentGroup(value);
                  }
                }}
                disabled={deploymentGroups.length === 0}
              ></oj-select-single>

              <div class="deployment-group-rack-count" aria-live="polite">
                Racks: {selectedRacks.length}
              </div>
            </div>

            <div class="deployment-group-actions">
              <oj-button
                chroming="callToAction"
                disabled={!canNavigate}
                onojAction={() => {
                  if (!canNavigate) return;
                  onPageChanged({
                    path: "deployment-group-validation-page",
                    query: {
                      region,
                      building: selectedBuilding,
                      deploymentGroup: selectedDeploymentGroup,
                    },
                  });
                }}
              >
                View Deployment Group
              </oj-button>
            </div>
          </>
        ) : (
          <>
            <div class="deployment-group-search-grid">
              <oj-select-single
                id="deploymentGroupSearchDeviceType"
                value={selectedIdentifierType}
                data={identifierTypeDataProvider}
                itemText="label"
                labelHint="Search Type"
                onvalueChanged={(event: any) => {
                  const value = event?.detail?.value;
                  if (value === "hostSerial") {
                    setSelectedIdentifierType(value);
                    setSearchError(null);
                  }
                }}
              ></oj-select-single>

              <label class="deployment-group-search-field">
                <span>Host Serial</span>
                <input
                  id="deploymentGroupSearchDeviceValue"
                  type="text"
                  value={hostSerial}
                  placeholder="Enter host serial"
                  onInput={(event: any) => {
                    setHostSerial(String(event?.currentTarget?.value || ""));
                    if (searchError) {
                      setSearchError(null);
                    }
                  }}
                  onKeyDown={(event: KeyboardEvent) => {
                    if (event.key === "Enter" && canSearch) {
                      event.preventDefault();
                      void handleSearchAndValidate();
                    }
                  }}
                />
              </label>
            </div>

            <div class="deployment-group-actions">
              <oj-button
                chroming="callToAction"
                disabled={!canSearch}
                onojAction={() => {
                  void handleSearchAndValidate();
                }}
              >
                {isSearching ? "Searching..." : "Search and validate"}
              </oj-button>
            </div>

            {searchError && (
              <div className="alert alert-danger" role="alert">
                <span className="alert-icon" aria-hidden="true"></span>
                {searchError}
              </div>
            )}
          </>
        )}

        {!canNavigate && (
          <div class="deployment-group-muted" role="status">
            No deployment group mapping is available for region {region}.
          </div>
        )}
      </div>
    </div>
  );
};

export default DeploymentGroupSelectionPage;
