/**
 * @license
 * Copyright (c) 2014, 2024, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import CoreRouter = require("ojs/ojcorerouter");
import { ojButton } from "ojs/ojbutton";
import "ojs/ojbutton";
import Rack from "../rack/index";
import Context = require("ojs/ojcontext");
import HomeContainer from "../home/index";
//For the transpiled javascript to load the element's module, import as below
import "oj-c/input-text";
import "ojs/ojformlayout";
import "ojs/ojprogress-circle";
import Cabling from "../cabling/index";
import {
  getStoredVendorName,
  hydrateRackUrlContext,
  resolveCurrentUserType,
} from "./rackContext";
import {
  DeploymentGroupSelectionPage,
  DeploymentGroupValidationPage,
} from "../deployment-group-validation";
import { getInitialLvvUserType } from "../home/userType";
import Qc from "../qc";


type Props = {
  pagerouter: CoreRouter;
  page?: string;
  routes: Array<object>;
  onPageChanged: (value: any) => void;
  onVendorChanged: (vendor: string) => void;
  onUserTypeChanged: (userType: "master" | "vendor") => void;
  vendorName?: string;
  region: string;
};

let INIT_DEFAULT: any | null = null;

function isLocalhost(): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

const Content = (props: Props) => {
  const [selectedPage, setSelectedPage] = useState<string>("");
  const [selectedTicket, setSelectedTicket] = useState(INIT_DEFAULT)
  const [selectedRack, setSelectedRack] = useState(INIT_DEFAULT)
  const [selectedRackState, setSelectedRackState] = useState(INIT_DEFAULT)
  const [selectedBuilding, setSelectedBuilding] = useState(INIT_DEFAULT)
  const [selectedBlock, setSelectedBlock] = useState(INIT_DEFAULT)
  const [selectedProject, setSelectedProject] = useState(INIT_DEFAULT)
  const [selectedRackSerialNumber, setSelectedRackSerialNumber] = useState(INIT_DEFAULT)
  const [selectedIsGpuRack, setSelectedIsGpuRack] = useState<boolean>(false);
  const [selectedAvailabilityDomain, setSelectedAvailabilityDomain] = useState(INIT_DEFAULT);
  const [selectedVendor, setSelectedVendor] = useState(INIT_DEFAULT);
  const [selectedUserType, setSelectedUserType] = useState<"master" | "vendor">(() =>
    getInitialLvvUserType(isLocalhost())
  );
  const [deploymentGroupAccessLoading, setDeploymentGroupAccessLoading] = useState(false);
  const [selectedRackRegion, setSelectedRackRegion] = useState(INIT_DEFAULT);
  const [selectedResolveEnabled, setSelectedResolveEnabled] = useState<boolean>(false);
  const [selectedResolveDisabledReason, setSelectedResolveDisabledReason] = useState<string>("");
  const [selectedCablingSiteName, setSelectedCablingSiteName] = useState<string>("");
  const [rackReady, setRackReady] = useState<boolean>(false);
  const [rackLoadError, setRackLoadError] = useState<string>("");
  const [rackSNVersion, setRackSNVersion] = useState(0);
  const rackHydrationKeyRef = useRef<string>("");
  const directRackUrlRef = useRef<boolean>(/^\/rack\/[^/]+\/?$/.test(window.location.pathname));


  useEffect(() => {
    Context.getPageContext().getBusyContext().applicationBootstrapComplete();
    setSelectedPage(props.page as string)
    setSelectedVendor(getStoredVendorName());
  }, [selectedVendor]);

  useEffect(() => {
    sessionStorage.setItem("LVV_USER_TYPE", selectedUserType);
    props.onUserTypeChanged(selectedUserType);
  }, [selectedUserType, props.onUserTypeChanged]);

  const isDeploymentGroupSelectionRoute = props.page === "deployment-group-validation";
  const isDeploymentGroupValidationRoute = props.page === "deployment-group-validation-page";
  const isDeploymentGroupRoute = isDeploymentGroupSelectionRoute || isDeploymentGroupValidationRoute;

  useEffect(() => {
    if (!isDeploymentGroupRoute) {
      setDeploymentGroupAccessLoading(false);
      return;
    }
    if (selectedUserType === "master") {
      setDeploymentGroupAccessLoading(false);
      return;
    }

    const ac = new AbortController();
    setDeploymentGroupAccessLoading(true);
    void resolveCurrentUserType(props.region, ac.signal)
      .then((userType) => {
        if (ac.signal.aborted) return;
        setSelectedUserType(userType);
        setDeploymentGroupAccessLoading(false);
      })
      .catch((error) => {
        if ((error as any)?.name === "AbortError") return;
        setSelectedUserType("vendor");
        setDeploymentGroupAccessLoading(false);
      });

    return () => ac.abort();
  }, [isDeploymentGroupRoute, selectedUserType, props.region]);

  // Hydrate rack context from URL when user refreshes or opens /rack/{id} directly.
  useEffect(() => {
    const isRackUrl = /^\/rack\/[^/]+\/?$/.test(window.location.pathname);
    const isRackPage = Boolean(props.page?.includes("rack"));
    if (!isRackUrl || !isRackPage) return;
    if (!directRackUrlRef.current && selectedRackSerialNumber) return;

    const hydrationKey = `${window.location.pathname}${window.location.search}`;
    if (rackHydrationKeyRef.current === hydrationKey && selectedRackSerialNumber) return;

    let cancelled = false;
    let userTypeAc: AbortController | null = null;
    rackHydrationKeyRef.current = hydrationKey;
    setRackLoadError("");

    const hydrate = async () => {
      try {
        const result = await hydrateRackUrlContext();
        if (cancelled || !result.isRackUrl) {
          return;
        }
        if (result.error || !result.metadata) {
          setRackLoadError(result.error || "Unable to load rack context from URL.");
          return;
        }

        const ctx = result.metadata;
        setSelectedRackSerialNumber(ctx.rackSerialNumber || "");
        setSelectedRackRegion(result.region || props.region || "");
        setSelectedBuilding(ctx.building);
        setSelectedBlock(ctx.block);
        setSelectedRack(ctx.rack);
        setSelectedRackState(String(ctx.rackState || ""));
        setSelectedProject(String(ctx.project || ""));
        setSelectedIsGpuRack(Boolean(ctx.isGpuRack));
        setSelectedAvailabilityDomain(String(ctx.availabilityDomain || ""));
        setSelectedTicket(ctx.ticket || "");
        if (ctx.userType) {
          setSelectedUserType(ctx.userType === "master" ? "master" : "vendor");
        }
        setSelectedResolveEnabled(Boolean(ctx.resolveEnabled));
        setSelectedResolveDisabledReason(String(ctx.resolveDisabledReason || ""));
    setRackSNVersion((v) => v + 1);

        if (!ctx.userType) {
          const currentUserTypeAc = new AbortController();
          userTypeAc = currentUserTypeAc;
          void resolveCurrentUserType(result.region || props.region || "", currentUserTypeAc.signal)
            .then((userType) => {
              if (cancelled || currentUserTypeAc.signal.aborted) {
                return;
              }
              sessionStorage.setItem("LVV_USER_TYPE", userType);
              setSelectedUserType(userType);
            })
            .catch((error) => {
              if ((error as any)?.name !== "AbortError") {
                console.warn("Unable to resolve rack URL user type.", error);
              }
            });
        }
      } catch (error) {
        if (cancelled && (error as any)?.name === "AbortError") {
          return;
        }
        setRackLoadError((error as Error)?.message || "Unable to load rack context.");
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
      userTypeAc?.abort();
    };
  }, [props.page]);

  const rackChangedHandler = (value: any) => {
    console.log("Rack value passed is ", value);
    setSelectedRack(value.rack);
    setSelectedRackState(String(value.rackState || ""));
    setSelectedBuilding(value.building);
    setSelectedBlock(value.block);
    setSelectedProject(value.project);
    setSelectedIsGpuRack(Boolean(value.isGpuRack));
    setSelectedAvailabilityDomain(String(value.availabilityDomain || ""));
    setSelectedTicket(value.ticket);
    setSelectedUserType(value.userType === "master" ? "master" : "vendor");
    setSelectedResolveEnabled(value.resolveEnabled !== false);
    setSelectedResolveDisabledReason(String(value.resolveDisabledReason || ""));
    setSelectedRackSerialNumber(value.rackSerialNumber);
    setSelectedRackRegion(props.region);
    setRackLoadError("");
    directRackUrlRef.current = false;
    sessionStorage.setItem("LVV_USER_TYPE", value.userType === "master" ? "master" : "vendor");

    // If re-selecting the same serial number, also bump:
    setRackSNVersion(v => v + 1);
    // Defer navigation until after state is committed to avoid undefined props on first Rack render
  };

  useEffect(() => {
    console.log("Setting rackReady to ", selectedBuilding && selectedBlock && selectedRack && selectedRackSerialNumber);
    setRackReady(Boolean(selectedBuilding && selectedBlock && selectedRack && selectedRackSerialNumber));
  }, [selectedBuilding, selectedBlock, selectedRack, selectedRackSerialNumber, rackSNVersion]);

  // Navigate to rack only after all required state is set, preventing undefined props on first render
  useEffect(() => {
    console.log("Trying to navigate to next page,", rackReady);
    if (rackReady && !directRackUrlRef.current && !(props.page && props.page.includes("rack"))) {
      const hasTicket = String(selectedTicket || "").trim() !== "";
      const queryObj: Record<string, string> = {
        region: String(selectedRackRegion || props.region || ""),
        project: String(selectedProject || ""),
        building: String(selectedBuilding || ""),
        block: String(selectedBlock || ""),
        rack: String(selectedRack || ""),
        rackState: String(selectedRackState || ""),
        isGpuRack: String(Boolean(selectedIsGpuRack)),
        availabilityDomain: String(selectedAvailabilityDomain || ""),
        userType: String(selectedUserType || "vendor"),
      };
      if (hasTicket) {
        queryObj.ticket = String(selectedTicket);
      } else {
        queryObj.resolveEnabled = String(Boolean(selectedResolveEnabled));
        queryObj.resolveDisabledReason = String(selectedResolveDisabledReason || "");
      }

      props.onPageChanged({ path: "rack", id: selectedRackSerialNumber, query: queryObj });
    }
  }, [rackReady, rackSNVersion]);

  const isRack = Boolean(props.page?.includes("rack"));
  const isCabling = Boolean(props.page?.includes("cabling"));
  const isDeploymentGroupSelection = Boolean(
    isDeploymentGroupSelectionRoute && selectedUserType === "master"
  );
  const isDeploymentGroupValidationPage = Boolean(
    isDeploymentGroupValidationRoute && selectedUserType === "master"
  );
  const isHome = !isRack && !isCabling && !isDeploymentGroupRoute;
  const isQc = Boolean(props.page?.includes("qc"));
  return (
    <div class="oj-web-applayout-max-width oj-web-applayout-content lvv-route-content">
      {isCabling ? (
        <Cabling onSelectedSiteNameChanged={setSelectedCablingSiteName} />
      ) : isDeploymentGroupRoute && deploymentGroupAccessLoading ? (
        <div class="deployment-group-loading" role="status" aria-live="polite">
          <oj-progress-circle size="md" value={-1}></oj-progress-circle>
          <div>Checking access...</div>
        </div>
      ) : isDeploymentGroupRoute && selectedUserType !== "master" ? (
        <div class="deployment-group-access-denied" role="alert">
          Deployment Group Validation is available only to master users.
        </div>
      ) : isDeploymentGroupSelection ? (
        <DeploymentGroupSelectionPage
          region={props.region}
          onPageChanged={props.onPageChanged}
        />
      ) : isDeploymentGroupValidationPage ? (
        <DeploymentGroupValidationPage
          region={props.region}
          onPageChanged={props.onPageChanged}
        />
      ) : isQc ? (
        <Qc
          page={props.page}
          onPageChanged={props.onPageChanged}
          selectedSiteName={selectedCablingSiteName}
          vendorName={props.vendorName}
        />
      ) : (
        <>
      {/* Keep Home mounted to preserve project/filter state; isActive pauses Home-only requests while hidden. */}
      <div style={{ display: isRack ? 'none' : 'block' }}>
        <div>
          <HomeContainer
            isActive={isHome}
            onRackChanged={rackChangedHandler}
            onUserTypeChanged={setSelectedUserType}
            vendor={selectedVendor}
            region={props.region}
          />
        </div>
      </div>
      {isRack && (
        <>
          {rackLoadError ? (
            <div style={{ padding: '16px' }}>{rackLoadError}</div>
          ) : rackReady ? (
            <Rack
                key={String(selectedRackSerialNumber)}
                onPageChanged={props.onPageChanged}
                building={selectedBuilding}
                block={selectedBlock}
                rack={selectedRack}
                rackState={selectedRackState}
                project={selectedProject}
                ticket={selectedTicket}
                rack_serial={selectedRackSerialNumber}
                isGpuRack={selectedIsGpuRack}
                vendorName={selectedVendor}
                availabilityDomain={selectedAvailabilityDomain}
                userType={selectedUserType}
                resolveEnabled={selectedResolveEnabled}
                resolveDisabledReason={selectedResolveDisabledReason}
                region={String(selectedRackRegion || props.region || "")}
            />
          ) : (
            <div class="rack-url-loading" role="status" aria-live="polite">
              <oj-progress-circle size="md" value={-1} />
              <div class="rack-url-loading-text">Loading rack...</div>
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  )

};

export default Content;