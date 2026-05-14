import { useEffect, useMemo, useState } from "preact/hooks";
import { RoomPlatform } from "gen/clients/ide-lvv-client";
import ArrayDataProvider from "ojs/ojarraydataprovider";
import "oj-c/select-single";
import "oj-c/button";
import "oj-c/checkbox";
import { RackFilters } from "../types";
import mapping from "../api/mockAPI/deployment-groups.json";

type FilterOption = {
  label: string;
  value: string;
};

interface MoreFiltersDrawerProps {
  opened: boolean;
  roomName?: string | null;
  roomPlatforms: RoomPlatform[] | undefined;
  loading: boolean;
  filterValue: RackFilters;
  onApplyFilters: (filters: RackFilters) => void;
  onClose: () => void;
}

const buildUniqueOptions = (
  values: Array<string | undefined>,
): FilterOption[] => {
  const uniqueValues = Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => !!value),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return uniqueValues.map((value) => ({
    label: value,
    value,
  }));
};

export const MoreFiltersDrawer = ({
  opened,
  roomName,
  roomPlatforms,
  loading,
  filterValue,
  onApplyFilters,
  onClose,
}: MoreFiltersDrawerProps) => {
  const isAga5Room = !!roomName?.startsWith("aga5");
  const [draftPlatformName, setDraftPlatformName] = useState<string | null>(
    filterValue.platformName,
  );
  const [draftBlockName, setDraftBlockName] = useState<string | null>(
    filterValue.blockName,
  );
  const [draftDeploymentGroup, setDraftDeploymentGroup] = useState<
    string | null
  >(filterValue.deploymentGroup);
  const [draftShowOhrRacks, setDraftShowOhrRacks] = useState<boolean>(
    filterValue.showOhrRacks,
  );

  useEffect(() => {
    if (!opened) {
      setDraftPlatformName(filterValue.platformName);
      setDraftBlockName(filterValue.blockName);
      setDraftDeploymentGroup(filterValue.deploymentGroup);
      setDraftShowOhrRacks(filterValue.showOhrRacks);
    }
  }, [opened, filterValue]);

  const platformOptions = useMemo(
    () => buildUniqueOptions((roomPlatforms || []).map((item) => item.platformName)),
    [roomPlatforms],
  );

  const blockOptions = useMemo(
    () => buildUniqueOptions((roomPlatforms || []).map((item) => item.blockName)),
    [roomPlatforms],
  );

  const platformDataProvider = useMemo(
    () =>
      new ArrayDataProvider<FilterOption["value"], FilterOption>(platformOptions, {
        keyAttributes: "value",
      }),
    [platformOptions],
  );

  const blockDataProvider = useMemo(
    () =>
      new ArrayDataProvider<FilterOption["value"], FilterOption>(blockOptions, {
        keyAttributes: "value",
      }),
    [blockOptions],
  );
  const deploymentGroupOptions: FilterOption[] = useMemo(
    () => [
      { label: "All Racks", value: "" },
      ...(mapping.groups || []).map((g) => ({
        label:
          String(g.placementGroup) +
          " (" +
          (g.rackPositions || []).join(", ") +
          ")",
        value: String(g.placementGroup),
      })),
    ],
    [],
  );
  const deploymentGroupDataProvider = useMemo(
    () =>
      new ArrayDataProvider<FilterOption["value"], FilterOption>(
        deploymentGroupOptions,
        {
          keyAttributes: "value",
        },
      ),
    [deploymentGroupOptions],
  );

  return (
    <div className="extra-filters-drawer">
      <div className="extra-filters-drawer-header">
        <h6 className="oj-sm-margin-0">Filters</h6>
        <oj-c-button
          display="icons"
          chroming="borderless"
          onojAction={onClose}
        >
          <span slot="startIcon" class="oj-ux-ico-close"></span>
        </oj-c-button>
      </div>

      <div className="extra-filters-drawer-fields">
        <oj-c-checkbox
          id="showOhrRacksFilter"
          value={draftShowOhrRacks}
          onvalueChanged={(event: any) => setDraftShowOhrRacks(!!event.detail.value)}
        >
          View OHR Racks
        </oj-c-checkbox>

        {isAga5Room && (
          <oj-c-select-single
            id="deploymentGroupFilter"
            data={deploymentGroupDataProvider}
            itemText="label"
            labelHint="Deployment Group"
            placeholder="Select a deployment group"
            value={draftDeploymentGroup ?? ""}
            width={"sm"}
            onvalueChanged={(event) =>
              setDraftDeploymentGroup(
                event.detail.value ? (event.detail.value as string) : null,
              )
            }
          />
        )}

        <oj-c-select-single
          id="platformNameFilter"
          data={platformDataProvider}
          itemText="label"
          labelHint="Platform Name"
          placeholder={loading ? "Loading..." : "Select a platform name"}
          value={draftPlatformName}
          width={"sm"}
          onvalueChanged={(event) => setDraftPlatformName(event.detail.value)}
          disabled={loading || platformOptions.length === 0}
        />

        <oj-c-select-single
          id="blockNameFilter"
          data={blockDataProvider}
          itemText="label"
          labelHint="Block Name"
          placeholder={loading ? "Loading..." : "Select a block name"}
          value={draftBlockName}
          width={"sm"}
          onvalueChanged={(event) => setDraftBlockName(event.detail.value)}
          disabled={loading || blockOptions.length === 0}
        />

        <div className="extra-filters-drawer-actions">
          <oj-c-button
            chroming="outlined"
            label="Clear Filters"
            onojAction={() => {
              setDraftPlatformName(null);
              setDraftBlockName(null);
              setDraftDeploymentGroup(null);
              setDraftShowOhrRacks(false);
            }}
          />
          <oj-c-button
            chroming="solid"
            label="Apply Filters"
            onojAction={() =>
              onApplyFilters({
                platformName: draftPlatformName,
                blockName: draftBlockName,
                deploymentGroup: isAga5Room ? draftDeploymentGroup : null,
                showOhrRacks: draftShowOhrRacks,
              })
            }
          />
        </div>
      </div>
    </div>
  );
};
