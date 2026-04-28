export const VALIDATION_COLUMN_ORDER_BY_SECTION: Record<string, string[]> = {
  "LLDP Errors": [
    "Device A Location",
    "Device A Rack",
    "Device A Name",
    "Device A Port",
    "Device B Rack",
    "Device B Name",
    "Device B Port",
    "Current Device B Location",
    "Current B Location",
    "Current Device B Name",
    "Current Device B Port",
    "Expected B Location",
    "Expected Device B Location",
    "Expected Device B Rack",
    "Expected Device B Name",
    "Expected Device B Port",
    "LLDP Status",
    "Last Executed",
    "HTTP Status",
    "Error Message",
    "patchPanelMatrix",
  ],
  "Optic Errors": [
    "Device Name",
    "Device Port",
    "Source Device Location",
    "Source Device Name",
    "Source Device Port",
    "Transceiver",
    "Remote Device Name",
    "Remote Device Port",
    "Tx Power",
    "Rx Power",
    "Last Executed",
    "HTTP Status",
    "Error Message",
    "patchPanelMatrix",
  ],
  "Interface Errors": [
    "Device Name",
    "Device Port",
    "Source Device Location",
    "Source Device Name",
    "Source Device Port",
    "Remote Device Name",
    "Remote Device Port",
    "Issue",
    "Last Executed",
    "HTTP Status",
    "Error Message",
    "patchPanelMatrix",
  ],
  "FEC_BER Errors": [
    "Device Rack",
    "Device Name",
    "Device Port",
    "PRE_FEC_BER",
    "Lock Status",
    "Remote Device",
    "Remote Interface",
    "Last Executed",
    "HTTP Status",
    "Error Message",
    "patchPanelMatrix",
  ],
  "Raw BER Errors": [
    "Source Device Location",
    "Source Device Name",
    "Source Device Port",
    "Remote Device Name",
    "Remote Device Port",
    "Optical RawBer",
    "Last Executed",
    "HTTP Status",
    "Error Message",
    "patchPanelMatrix",
  ],
  "Fan Errors": [
    "Device Name",
    "Fan Name",
    "Fan Slot",
    "Status",
    "Last Executed",
    "HTTP Status",
    "Error Message",
  ],
};

export const VALIDATION_SECTION_ORDER: string[] = [
  "Interface Errors",
  "LLDP Errors",
  "Optic Errors",
  "FEC_BER Errors",
  "Fan Errors",
  "Raw BER Errors"
];

const VALIDATION_SECTION_ORDER_INDEX = new Map(
  VALIDATION_SECTION_ORDER.map((title, index) => [title.trim().toLowerCase(), index])
);

export function orderValidationSectionKeys<T extends string>(
  sectionKeys: T[],
  getSectionTitle: (sectionKey: T) => string | undefined
): T[] {
  return [...sectionKeys].sort((leftKey, rightKey) => {
    const leftTitle = String(getSectionTitle(leftKey) || "").trim().toLowerCase();
    const rightTitle = String(getSectionTitle(rightKey) || "").trim().toLowerCase();
    const leftRank = VALIDATION_SECTION_ORDER_INDEX.get(leftTitle);
    const rightRank = VALIDATION_SECTION_ORDER_INDEX.get(rightTitle);

    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
}
