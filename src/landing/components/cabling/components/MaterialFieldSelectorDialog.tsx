import { useEffect, useId, useMemo, useState } from "preact/hooks";
import { ImmutableKeySet, KeySetImpl } from "ojs/ojkeyset";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import "ojs/ojlistview";
import "oj-c/button";
import "oj-c/dialog";
import "oj-c/list-item-layout";
import "oj-c/selector-all";
import * as XLSX from "xlsx";
import { MaterialSummary } from "gen/clients/ide-lvv-client";
import ToastMessage from "./ToastMessage";

type MaterialField = {
  id: string;
  label: string;
};

interface MaterialFieldSelectorDialogProps {
  opened: boolean;
  headerText: string;
  onClose: () => void;
  materials: MaterialSummary[] | undefined;
}

const sortFields = (fields: string[]) =>
  [...fields].sort((a, b) => a.localeCompare(b));

const toFieldRows = (fields: string[]): MaterialField[] =>
  fields.map((field) => ({ id: field, label: field }));

const collectMaterialFieldPaths = (
  value: unknown,
  fieldPaths: Set<string>,
  prefix?: string,
) => {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    if (prefix) {
      fieldPaths.add(prefix);
    }
    return;
  }

  if (typeof value !== "object") {
    if (prefix) {
      fieldPaths.add(prefix);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length === 0) {
    if (prefix) {
      fieldPaths.add(prefix);
    }
    return;
  }

  keys.forEach((key) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    const nextValue = record[key];

    if (
      nextValue !== null &&
      nextValue !== undefined &&
      typeof nextValue === "object" &&
      !Array.isArray(nextValue)
    ) {
      collectMaterialFieldPaths(nextValue, fieldPaths, nextPrefix);
      return;
    }

    fieldPaths.add(nextPrefix);
  });
};

const getAllMaterialFields = (materials: MaterialSummary[] | undefined) => {
  const fieldPaths = new Set<string>();

  (materials || []).forEach((material) => {
    collectMaterialFieldPaths(material, fieldPaths);
  });

  return sortFields(Array.from(fieldPaths));
};

const getSelectedFields = (
  fields: string[],
  selected: ImmutableKeySet<string>,
) => {
  const selectedKeys = selected.keys;
  if (selected.isAddAll() || selectedKeys.all) {
    return [...fields];
  }

  const keySet = selectedKeys.keys;
  if (!keySet) {
    return [] as string[];
  }

  return fields.filter((field) => keySet.has(field));
};

const getValueByFieldPath = (
  record: Record<string, unknown>,
  fieldPath: string,
): unknown => {
  const pathParts = fieldPath.split(".");
  let currentValue: unknown = record;

  for (const part of pathParts) {
    if (
      currentValue === null ||
      currentValue === undefined ||
      typeof currentValue !== "object"
    ) {
      return undefined;
    }
    currentValue = (currentValue as Record<string, unknown>)[part];
  }

  return currentValue;
};

const formatExportCellValue = (value: unknown): string | number | boolean => {
  if (value === null || value === undefined) {
    return "";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return JSON.stringify(value);
};

export const MaterialFieldSelectorDialog = ({
  opened,
  onClose,
  headerText,
  materials,
}: MaterialFieldSelectorDialogProps) => {
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [availableListSelection, setAvailableListSelection] = useState<
    ImmutableKeySet<string>
  >(new KeySetImpl<string>([]));
  const [selectedListSelection, setSelectedListSelection] = useState<
    ImmutableKeySet<string>
  >(new KeySetImpl<string>([]));

  const dialogId = useId();
  const bodyId = `${dialogId}-material-fields-body`;

  const allMaterialFields = useMemo(
    () => getAllMaterialFields(materials),
    [materials],
  );
  const availableFields = useMemo(
    () => allMaterialFields.filter((field) => !selectedFields.includes(field)),
    [allMaterialFields, selectedFields],
  );

  useEffect(() => {
    const validFieldSet = new Set(allMaterialFields);
    setSelectedFields((prev) =>
      prev.filter((field) => validFieldSet.has(field)),
    );
    setAvailableListSelection(new KeySetImpl<string>([]));
    setSelectedListSelection(new KeySetImpl<string>([]));
  }, [allMaterialFields]);

  const availableDataProvider = useMemo(
    () =>
      new MutableArrayDataProvider<string, MaterialField>(
        toFieldRows(availableFields),
        { keyAttributes: "id" },
      ),
    [availableFields],
  );

  const selectedDataProvider = useMemo(
    () =>
      new MutableArrayDataProvider<string, MaterialField>(
        toFieldRows(selectedFields),
        { keyAttributes: "id" },
      ),
    [selectedFields],
  );

  const selectedAvailableFields = getSelectedFields(
    availableFields,
    availableListSelection,
  );
  const selectedChosenFields = getSelectedFields(
    selectedFields,
    selectedListSelection,
  );
  const selectedChosenField = selectedChosenFields[0] ?? null;

  const handleMoveToSelected = () => {
    if (!selectedAvailableFields.length) return;

    setSelectedFields((prev) => [
      ...prev,
      ...selectedAvailableFields.filter((field) => !prev.includes(field)),
    ]);
    setAvailableListSelection(new KeySetImpl<string>([]));
  };

  const handleMoveToAvailable = () => {
    if (!selectedChosenFields.length) return;

    setSelectedFields((prev) =>
      prev.filter((field) => !selectedChosenFields.includes(field)),
    );
    setSelectedListSelection(new KeySetImpl<string>([]));
  };

  const handleSelectAllChange = (
    event: CustomEvent<{ value: ImmutableKeySet<string> }>,
  ) => {
    setAvailableListSelection(event.detail.value);
  };

  const handleExportSelectedFields = () => {
    if (!selectedFields.length || !materials?.length) {
      return;
    }

    const exportRows = materials.map((material) => {
      const row: Record<string, string | number | boolean> = {};

      selectedFields.forEach((field) => {
        const value = getValueByFieldPath(
          material as unknown as Record<string, unknown>,
          field,
        );
        row[field] = formatExportCellValue(value);
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows, {
      header: selectedFields,
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Materials");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const now = new Date().toISOString().slice(0, 19).replace("T", "-");
    const fileName = `materials-${headerText}-${now}.xlsx`;
    const url = URL.createObjectURL(fileData);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onClose();
  };

  const moveSelectedField = (direction: "up" | "down") => {
    if (!selectedChosenField) return;

    setSelectedFields((prev) => {
      const index = prev.indexOf(selectedChosenField);
      if (index === -1) return prev;

      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) {
        return prev;
      }

      const reordered = [...prev];
      [reordered[index], reordered[nextIndex]] = [
        reordered[nextIndex],
        reordered[index],
      ];
      return reordered;
    });

    setSelectedListSelection(new KeySetImpl<string>([selectedChosenField]));
  };

  const renderFieldTemplate = (context: any) => (
    <oj-c-list-item-layout>
      <div className="material-field-selector-item">
        {context.item.data.label}
      </div>
    </oj-c-list-item-layout>
  );

  const handleClose = () => {
    setAvailableListSelection(new KeySetImpl<string>([]));
    setSelectedListSelection(new KeySetImpl<string>([]));
    onClose();
  };

  const selectedIndex = selectedChosenField
    ? selectedFields.indexOf(selectedChosenField)
    : -1;

  return (
    <oj-c-dialog
      id={dialogId}
      opened={opened}
      aria-describedby={bodyId}
      dialog-title="Select export fields"
      width={"1000px"}
      minWidth={"1000px"}
    >
      <div
        slot="body"
        id={bodyId}
        class="oj-sm-padding-4x material-field-selector-dialog-body"
      >
        <div className="material-field-selector-layout">
          <div className="material-field-selector-column">
            <div className="material-field-selector-column-header">
              <h6 className="material-field-selector-title">
                Available fields
              </h6>
              <div>
                <oj-c-selector-all
                  id="material-field-select-all-checkbox"
                  aria-label="Select all available fields"
                  selectedKeys={availableListSelection}
                  onselectedKeysChanged={handleSelectAllChange}
                  class="oj-sm-margin-end"
                />
                Select All
              </div>
            </div>
            <oj-list-view
              aria-label="Available fields"
              class="material-field-selector-list-view"
              data={availableDataProvider}
              drillMode="none"
              selectionMode="multiple"
              selected={availableListSelection}
              onselectedChanged={(event: any) => {
                setAvailableListSelection(
                  event.detail.value as ImmutableKeySet<string>,
                );
              }}
            >
              <template slot="itemTemplate" render={renderFieldTemplate} />
            </oj-list-view>
          </div>

          <div className="material-field-selector-transfer-actions">
            <oj-c-button
              chroming="outlined"
              label=">"
              onojAction={handleMoveToSelected}
              disabled={selectedAvailableFields.length === 0}
            ></oj-c-button>
            <oj-c-button
              chroming="outlined"
              label="<"
              onojAction={handleMoveToAvailable}
              disabled={selectedChosenFields.length === 0}
            ></oj-c-button>
          </div>

          <div className="material-field-selector-column">
            <h6 className="material-field-selector-title">Selected fields</h6>
            <oj-list-view
              aria-label="Selected fields"
              class="material-field-selector-list-view"
              data={selectedDataProvider}
              drillMode="none"
              selectionMode="single"
              selected={selectedListSelection}
              onselectedChanged={(event: any) => {
                setSelectedListSelection(
                  event.detail.value as ImmutableKeySet<string>,
                );
              }}
            >
              <template slot="itemTemplate" render={renderFieldTemplate} />
            </oj-list-view>
          </div>
        </div>
                  <div className="material-field-selector-reorder-actions">
            <oj-c-button
              chroming="outlined"
              label="Move up"
              onojAction={() => moveSelectedField("up")}
              disabled={selectedIndex <= 0}
            ></oj-c-button>
            <oj-c-button
              chroming="outlined"
              label="Move down"
              onojAction={() => moveSelectedField("down")}
              disabled={
                selectedIndex === -1 ||
                selectedIndex >= selectedFields.length - 1
              }
            ></oj-c-button>
          </div>

      </div>

      <div
        slot="footer"
        class="oj-sm-padding-2x oj-sm-flex oj-sm-justify-content-flex-end oj-sm-column-gap-2x"
      >
        <oj-c-button
          chroming="solid"
          label="Export selected fields"
          onojAction={handleExportSelectedFields}
          disabled={selectedFields.length === 0 || !materials?.length}
        >
          <span slot="startIcon" class="oj-ux-ico-download"></span>
        </oj-c-button>
        <oj-c-button
          chroming="borderless"
          label="Close"
          onojAction={handleClose}
        ></oj-c-button>
      </div>
    </oj-c-dialog>
  );
};
