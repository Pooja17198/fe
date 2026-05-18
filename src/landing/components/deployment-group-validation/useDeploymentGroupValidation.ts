import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  fetchDeploymentGroupJobMetadata,
  fetchDeploymentGroupJobStatus,
  fetchDeploymentGroupRackMetadata,
  fetchDeploymentGroupValidationResults,
  startDeploymentGroupValidationJob,
} from "./api";
import { getDeploymentGroupRackNumbers } from "./config";
import {
  buildDeploymentGroupRackRows,
  buildRackSerialByRackNumber,
  indexRackMetadataByRackNumber,
  summarizeDeploymentGroupRows,
} from "./summary";
import type {
  DeploymentGroupJobMetadata,
  DeploymentGroupRackRow,
  DeploymentGroupSummary,
  DeploymentGroupValidationResults,
  RackMetadata,
} from "./types";
import { TERMINAL_DEPLOYMENT_GROUP_STATUSES } from "./types";

const DEPLOYMENT_GROUP_POLLING = {
  INTERVAL_MS: 10_000,
  MAX_ATTEMPTS: 91,
} as const;

const NOT_TRIGGERED_METADATA: DeploymentGroupJobMetadata = {
  jobStatus: "NOT_TRIGGERED",
  lastUpdatedTime: null,
  jobId: null,
};

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timeoutId = window.setTimeout(resolve, ms);
    const abortHandler = () => {
      window.clearTimeout(timeoutId);
      reject(abortError());
    };
    signal.addEventListener("abort", abortHandler, { once: true });
  });
}

function formatError(error: unknown, fallback: string): string {
  if ((error as any)?.name === "AbortError") {
    return fallback;
  }
  return (error as any)?.message ? String((error as any).message) : fallback;
}

function makeRows(params: {
  rackNumbers: string[];
  metadataByRackNumber: Record<string, RackMetadata>;
  results: DeploymentGroupValidationResults;
  region: string;
  building: string;
}): DeploymentGroupRackRow[] {
  return buildDeploymentGroupRackRows(params);
}

export function useDeploymentGroupValidation(params: {
  region: string;
  building: string;
  deploymentGroup: string;
}) {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [jobMetadata, setJobMetadata] =
    useState<DeploymentGroupJobMetadata>(NOT_TRIGGERED_METADATA);
  const [rows, setRows] = useState<DeploymentGroupRackRow[]>([]);

  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const rowsRef = useRef<DeploymentGroupRackRow[]>([]);
  const metadataByRackNumberRef = useRef<Record<string, RackMetadata>>({});

  const rackNumbers = useMemo(
    () => getDeploymentGroupRackNumbers(params.region, params.building, params.deploymentGroup),
    [params.region, params.building, params.deploymentGroup]
  );

  const summary: DeploymentGroupSummary = useMemo(
    () => summarizeDeploymentGroupRows(rows),
    [rows]
  );

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const applyRows = useCallback((nextRows: DeploymentGroupRackRow[]) => {
    rowsRef.current = nextRows;
    setRows(nextRows);
  }, []);

  const refreshResults = useCallback(async (
    signal: AbortSignal,
    resultsRackRows: DeploymentGroupRackRow[] = rowsRef.current
  ): Promise<void> => {
    const rackSerialNumbers = resultsRackRows
      .map((row) => row.rackSerialNumber)
      .filter((rackSerialNumber) => rackSerialNumber.trim() !== "");

    const results = rackSerialNumbers.length > 0
      ? await fetchDeploymentGroupValidationResults({
          region: params.region,
          building: params.building,
          rackSerialNumbers,
          signal,
        })
      : {};

    applyRows(
      makeRows({
        rackNumbers,
        metadataByRackNumber: metadataByRackNumberRef.current,
        results,
        region: params.region,
        building: params.building,
      })
    );
  }, [applyRows, params.region, params.building, rackNumbers]);

  const pollDeploymentGroup = useCallback(async (
    signal: AbortSignal,
    requestSeq: number
  ): Promise<void> => {
    setIsValidating(true);
    setWarningMessage(null);
    const rackSerialByRackNumber = buildRackSerialByRackNumber(rowsRef.current);
    if (Object.keys(rackSerialByRackNumber).length === 0) {
      setIsValidating(false);
      setWarningMessage("Deployment group validation was triggered, but rack serial metadata is unavailable, so status polling cannot start.");
      return;
    }

    for (let attempt = 0; attempt < DEPLOYMENT_GROUP_POLLING.MAX_ATTEMPTS; attempt += 1) {
      if (signal.aborted || requestSeq !== requestSeqRef.current) {
        return;
      }

      const status = await fetchDeploymentGroupJobStatus({
        region: params.region,
        building: params.building,
        deploymentGroup: params.deploymentGroup,
        rackSerialByRackNumber,
        lastAttempt: attempt === DEPLOYMENT_GROUP_POLLING.MAX_ATTEMPTS - 1,
        signal,
      });

      if (TERMINAL_DEPLOYMENT_GROUP_STATUSES.has(status)) {
        const refreshedMetadata = await fetchDeploymentGroupJobMetadata({
          region: params.region,
          building: params.building,
          deploymentGroup: params.deploymentGroup,
          signal,
        }).catch(() => ({
          ...NOT_TRIGGERED_METADATA,
          jobStatus: status,
        }));

        if (requestSeq !== requestSeqRef.current || signal.aborted) {
          return;
        }

        setJobMetadata(refreshedMetadata);
        setIsValidating(false);

        if (status === "COMPLETED") {
          await refreshResults(signal);
          setWarningMessage(null);
        } else {
          setWarningMessage(`Deployment group validation ended with status ${status}. Latest available results are still shown.`);
        }
        return;
      }

      if (attempt < DEPLOYMENT_GROUP_POLLING.MAX_ATTEMPTS - 1) {
        await sleep(DEPLOYMENT_GROUP_POLLING.INTERVAL_MS, signal);
      }
    }

    if (requestSeq === requestSeqRef.current && !signal.aborted) {
      setIsValidating(false);
      setJobMetadata((prev) => ({ ...prev, jobStatus: "VALIDATION_TIMED_OUT" }));
      setWarningMessage("Deployment group validation timed out after 15 minutes. Latest available results are still shown.");
    }
  }, [
    params.region,
    params.building,
    params.deploymentGroup,
    refreshResults,
  ]);

  const loadInitialData = useCallback(async (): Promise<void> => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const requestSeq = ++requestSeqRef.current;

    setLoading(true);
    setLoadingMessage("Loading deployment group racks...");
    setErrorMessage(null);
    setWarningMessage(null);
    setIsValidating(false);

    if (!params.region || !params.building || !params.deploymentGroup) {
      applyRows([]);
      setJobMetadata(NOT_TRIGGERED_METADATA);
      setErrorMessage("Missing deployment group URL parameters.");
      setLoading(false);
      setLoadingMessage("");
      return;
    }

    if (rackNumbers.length === 0) {
      applyRows([]);
      setJobMetadata(NOT_TRIGGERED_METADATA);
      setErrorMessage("No racks are configured for this deployment group.");
      setLoading(false);
      setLoadingMessage("");
      return;
    }

    let metadataByRackNumber: Record<string, RackMetadata> = {};
    let nextError: string | null = null;

    try {
      const metadata = await fetchDeploymentGroupRackMetadata({
        region: params.region,
        building: params.building,
        rackNumbers,
        signal: ac.signal,
      });
      metadataByRackNumber = indexRackMetadataByRackNumber(metadata);
      metadataByRackNumberRef.current = metadataByRackNumber;
    } catch (error) {
      if ((error as any)?.name === "AbortError") return;
      metadataByRackNumberRef.current = {};
      nextError = formatError(error, "Failed to load deployment group rack metadata.");
    }

    if (requestSeq !== requestSeqRef.current || ac.signal.aborted) {
      return;
    }

    const emptyRows = makeRows({
      rackNumbers,
      metadataByRackNumber,
      results: {},
      region: params.region,
      building: params.building,
    });
    applyRows(emptyRows);

    setLoadingMessage("Loading deployment group job metadata...");
    let metadata = NOT_TRIGGERED_METADATA;
    try {
      metadata = await fetchDeploymentGroupJobMetadata({
        region: params.region,
        building: params.building,
        deploymentGroup: params.deploymentGroup,
        signal: ac.signal,
      });
      setJobMetadata(metadata);
    } catch (error) {
      if ((error as any)?.name === "AbortError") return;
      nextError = [
        nextError,
        formatError(error, "Failed to load deployment group job metadata."),
      ].filter(Boolean).join(" ");
      setJobMetadata(NOT_TRIGGERED_METADATA);
    }

    if (requestSeq !== requestSeqRef.current || ac.signal.aborted) {
      return;
    }

    setLoadingMessage("Loading latest deployment group validation results...");
    try {
      await refreshResults(ac.signal, emptyRows);
    } catch (error) {
      if ((error as any)?.name === "AbortError") return;
      nextError = [
        nextError,
        formatError(error, "Failed to load deployment group validation results."),
      ].filter(Boolean).join(" ");
    }

    if (requestSeq !== requestSeqRef.current || ac.signal.aborted) {
      return;
    }

    setErrorMessage(nextError);
    setLoading(false);
    setLoadingMessage("");

    if (metadata.jobStatus === "IN_PROGRESS") {
      void pollDeploymentGroup(ac.signal, requestSeq).catch((error) => {
        if ((error as any)?.name === "AbortError") return;
        if (requestSeq === requestSeqRef.current) {
          setIsValidating(false);
          setWarningMessage(formatError(error, "Deployment group polling failed."));
        }
      });
    }
  }, [
    applyRows,
    params.region,
    params.building,
    params.deploymentGroup,
    rackNumbers,
    refreshResults,
    pollDeploymentGroup,
  ]);

  useEffect(() => {
    void loadInitialData();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadInitialData]);

  const validateDeploymentGroup = useCallback(async (): Promise<void> => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const requestSeq = ++requestSeqRef.current;

    setIsValidating(true);
    setErrorMessage(null);
    setWarningMessage(null);

    try {
      await startDeploymentGroupValidationJob({
        region: params.region,
        building: params.building,
        deploymentGroup: params.deploymentGroup,
        signal: ac.signal,
      });

      const metadata = await fetchDeploymentGroupJobMetadata({
        region: params.region,
        building: params.building,
        deploymentGroup: params.deploymentGroup,
        signal: ac.signal,
      });
      if (requestSeq !== requestSeqRef.current || ac.signal.aborted) {
        return;
      }

      setJobMetadata(metadata);
      await pollDeploymentGroup(ac.signal, requestSeq);
    } catch (error) {
      if ((error as any)?.name === "AbortError") return;
      if (requestSeq === requestSeqRef.current) {
        setIsValidating(false);
        setErrorMessage(formatError(error, "Deployment group validation failed."));
      }
    }
  }, [params.region, params.building, params.deploymentGroup, pollDeploymentGroup]);

  return {
    loading,
    loadingMessage,
    errorMessage,
    warningMessage,
    isValidating,
    jobMetadata,
    rows,
    summary,
    refresh: loadInitialData,
    validateDeploymentGroup,
  };
}
