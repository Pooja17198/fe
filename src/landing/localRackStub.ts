import { DeviceStatus } from "./components/rack/types";

const STUB_REGION = "us-phoenix-1";
const STUB_PROJECT_ID = "stub-validation-e2e-20260409";
const STUB_BUILDING = "aga5";
const STUB_BLOCK = "1";
const STUB_RACK = "32";
const STUB_RACK_SERIAL = "STUB-AGA5-Q2-P4-T0-R32";
const STUB_DEVICE_NAME = "aga5-q2-p4-t0-r32";
const STUB_TICKET = "DO-STUB-AGA5-R32";
const STUB_PLATFORM = "stub-validation-platform";

type LocalStubProject = {
  projectId: string;
  building: string;
  blocks: string[];
};

type LocalStubRackRow = {
  _key?: string;
  building: string;
  block: string;
  rackLocation: string;
  rackSerialNumber: string;
  isGpuRack: boolean;
  ticketType: string;
  ticketId: string;
  resolveEnabled: boolean;
  resolveDisabledReason: string;
  rackState: string;
  platformName: string;
};

type StubRackMatch = {
  region?: string;
  building?: string;
  rackNumber?: string;
  rackSerialNumber?: string;
};

function isLocalDesktopHost(): boolean {
  return typeof window !== "undefined" && window.location.host.includes("localhost");
}

function normalize(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function isLocalRackStubEnabled(region?: string): boolean {
  return isLocalDesktopHost() && normalize(region) === normalize(STUB_REGION);
}

export function getLocalRackStubProject(region?: string): LocalStubProject | null {
  if (!isLocalRackStubEnabled(region)) {
    return null;
  }

  return {
    projectId: STUB_PROJECT_ID,
    building: STUB_BUILDING,
    blocks: [STUB_BLOCK],
  };
}

export function mergeLocalRackStubProject<T extends { projectId: string }>(
  projects: T[],
  region?: string
): T[] {
  const stubProject = getLocalRackStubProject(region);
  if (!stubProject) {
    return projects;
  }

  if (projects.some((project) => normalize(project.projectId) === normalize(stubProject.projectId))) {
    return projects;
  }

  return [stubProject as unknown as T, ...projects];
}

export function getLocalRackStubRows(projectId?: string, region?: string): LocalStubRackRow[] {
  if (!isLocalRackStubEnabled(region) || normalize(projectId) !== normalize(STUB_PROJECT_ID)) {
    return [];
  }

  return [
    {
      building: STUB_BUILDING,
      block: STUB_BLOCK,
      rackLocation: STUB_RACK,
      rackSerialNumber: STUB_RACK_SERIAL,
      isGpuRack: false,
      ticketType: "validation",
      ticketId: STUB_TICKET,
      resolveEnabled: true,
      resolveDisabledReason: "",
      rackState: "PLANNED",
      platformName: STUB_PLATFORM,
    },
  ];
}

export function mergeLocalRackStubRows<T extends { rackSerialNumber?: string; rackLocation?: string; block?: string }>(
  rows: T[],
  projectId?: string,
  region?: string
): T[] {
  const stubRows = getLocalRackStubRows(projectId, region);
  if (stubRows.length === 0) {
    return rows;
  }

  const existingKeys = new Set(
    rows.map((row) => `${normalize(row.rackSerialNumber)}|${normalize(row.block)}|${normalize(row.rackLocation)}`)
  );
  const nextRows = [...rows];

  stubRows.forEach((stubRow) => {
    const key = `${normalize(stubRow.rackSerialNumber)}|${normalize(stubRow.block)}|${normalize(stubRow.rackLocation)}`;
    if (!existingKeys.has(key)) {
        nextRows.push(stubRow as unknown as T);
    }
  });

  return nextRows;
}

export function isLocalRackStubMatch(match: StubRackMatch): boolean {
  if (!isLocalRackStubEnabled(match.region)) {
    return false;
  }

  const serialMatches = normalize(match.rackSerialNumber) === normalize(STUB_RACK_SERIAL);
  const buildingMatches = normalize(match.building) === normalize(STUB_BUILDING);
  const rackMatches = normalize(match.rackNumber) === normalize(STUB_RACK);

  return serialMatches || (buildingMatches && rackMatches);
}

export function getLocalRackStubDeviceStatuses(match: StubRackMatch): DeviceStatus[] | null {
  if (!isLocalRackStubMatch(match)) {
    return null;
  }

  return [
    {
      deviceName: STUB_DEVICE_NAME,
      jobStatus: "COMPLETED",
      elevation: 32,
      validationEligible: true,
      _key: STUB_DEVICE_NAME,
    },
  ];
}

export function getLocalRackStubValidationPayload(match: StubRackMatch): Record<string, unknown> | null {
  if (!isLocalRackStubMatch(match)) {
    return null;
  }

  return {
    [STUB_RACK_SERIAL]: {
      [STUB_DEVICE_NAME]: {
        "Last Validated": "2026-04-16T18:45:00Z",
        "LLDP Errors": [
          {
            "Device A Rack": STUB_RACK,
            "Device A Name": STUB_DEVICE_NAME,
            "Device A Port": "Ethernet1/1",
            "Current Device B Rack": "34",
            "Current Device B Name": "aga5-q2-p4-t1-r34",
            "Current Device B Port": "Ethernet1/49",
            "Expected Device B Rack": "34",
            "Expected Device B Name": "aga5-q2-p4-t1-r34",
            "Expected Device B Port": "Ethernet1/50",
            "LLDP Status": "MISMATCH",
            "Error Message": "Stubbed local LLDP mismatch for desktop validation flows.",
          },
        ],
        "Optic Errors": [
          {
            "Device Name": STUB_DEVICE_NAME,
            "Device Port": "Ethernet1/1",
            "Tx Power": "-1.9",
            "Rx Power": "-18.6",
            "Remote Device": "aga5-q2-p4-t1-r34",
            "Remote Interface": "Ethernet1/50",
            "Error Message": "Stubbed local optic warning for desktop validation flows.",
          },
        ],
        "Power Errors": [],
      },
    },
  };
}
