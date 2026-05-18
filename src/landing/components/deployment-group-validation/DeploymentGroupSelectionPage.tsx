import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import "ojs/ojbutton";
import "ojs/ojselectsingle";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import {
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

function buildOptions(values: string[]): SelectOption[] {
  return values.map((value) => ({ value, label: value }));
}

const DeploymentGroupSelectionPage = ({ region, onPageChanged }: Props) => {
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedDeploymentGroup, setSelectedDeploymentGroup] = useState("");

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

  const canNavigate = selectedBuilding !== "" && selectedDeploymentGroup !== "";

  return (
    <div class="deployment-group-page">
      <h2 class="deployment-group-heading">Deployment Group Validation</h2>

      <div class="deployment-group-panel">
        <div class="deployment-group-panel-header">
          <span role="img" className="oj-icon validation-summary-icon" title="Deployment Group"></span>
          <h3>Select Deployment Group</h3>
        </div>

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
