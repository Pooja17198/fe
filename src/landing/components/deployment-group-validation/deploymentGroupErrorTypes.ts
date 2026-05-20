import type { RackValidationSummary } from "../rack/validationShared";

export type DeploymentGroupErrorToken = {
  label: string;
  className: string;
  title: string;
};

export type DeploymentGroupErrorTypeDefinition = {
  label: string;
  className: string;
  getCount: (summary: RackValidationSummary) => number;
  getTitle: (count: number) => string;
};

export const DEPLOYMENT_GROUP_ERROR_TYPE_DEFINITIONS: DeploymentGroupErrorTypeDefinition[] = [
  {
    label: "LLDP",
    className: "rack-status-chip lldp-failure",
    getCount: (summary) => summary.lldpFailures,
    getTitle: (count) => `${count} LLDP validation failure(s)`,
  },
  {
    label: "INTERFACE",
    className: "rack-status-chip interface-failure",
    getCount: (summary) => summary.interfaceFailures,
    getTitle: (count) => `${count} interface validation failure(s)`,
  },
  {
    label: "OPTICS",
    className: "rack-status-chip phoenix-optics-failure",
    getCount: (summary) => summary.opticModuleFailures,
    getTitle: (count) => `${count} optic validation failure(s)`,
  },
  {
    label: "FEC BER",
    className: "rack-status-chip fec-ber-failure",
    getCount: (summary) => summary.fecBerFailures,
    getTitle: (count) => `${count} FEC BER validation failure(s)`,
  },
  {
    label: "RAW BER",
    className: "rack-status-chip raw-ber-failure",
    getCount: (summary) => summary.rawBerFailures,
    getTitle: (count) => `${count} Raw BER validation failure(s)`,
  },
  {
    label: "HOST_OPT",
    className: "rack-status-chip host-opt-failure",
    getCount: (summary) => summary.hostOptFailures,
    getTitle: (count) => `${count} host transceiver optic validation failure(s)`,
  },
  {
    label: "HOST_FEC_BER",
    className: "rack-status-chip host-fec-ber-failure",
    getCount: (summary) => summary.hostFecBerFailures,
    getTitle: (count) => `${count} host transceiver FEC BER validation failure(s)`,
  },
  {
    label: "DEVICE",
    className: "rack-status-chip device-failure",
    getCount: (summary) => summary.deviceFailures,
    getTitle: (count) => `${count} power or fan validation failure(s)`,
  },
];

export function buildDeploymentGroupErrorTokens(
  summary: RackValidationSummary
): DeploymentGroupErrorToken[] {
  return DEPLOYMENT_GROUP_ERROR_TYPE_DEFINITIONS.flatMap((definition) => {
    const count = definition.getCount(summary);
    if (count <= 0) {
      return [];
    }

    return [{
      label: `${definition.label}:${count}`,
      className: definition.className,
      title: definition.getTitle(count),
    }];
  });
}
