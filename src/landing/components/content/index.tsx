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
import Cabling from "../cabling/index";


type Props = {
  pagerouter: CoreRouter;
  page?: string;
  routes: Array<object>;
  onPageChanged: (value: any) => void;
  onVendorChanged: (vendor: string) => void;
  region: string;
};

let INIT_DEFAULT: any | null = null;

type RackMetadata = {
  building: string;
  block: string;
  rack: string;
  rackState?: string;
  project?: string;
  ticket: string;
  rackSerialNumber?: string;
  isGpuRack?: boolean;
  availabilityDomain?: string;
  resolveEnabled?: boolean;
  resolveDisabledReason?: string;
  userType?: "master" | "vendor";
}

function getStoredVendorName(): string {
  const storedVendor = sessionStorage.getItem("X-Oracle-Vendor") || "";
  if (storedVendor.trim() !== "") {
    return storedVendor;
  }

  return "";
}

function decodeRackUrlContext(): Partial<RackMetadata> {
  // URL format: /rack/{rackSerialNumber}?region=...&project=...&building=...&block=...&rack=...&rackState=...&ticket=...&resolveEnabled=...&resolveDisabledReason=...
  const match = window.location.pathname.match(/^\/rack\/([^/]+)\/?$/);
  if (!match) return {};
  const [, id] = match;
  const params = new URLSearchParams(window.location.search);

  const building = params.get("building") ? decodeURIComponent(params.get("building") as string) : "";
  const block = params.get("block") ? decodeURIComponent(params.get("block") as string) : "";
  const rack = params.get("rack") ? decodeURIComponent(params.get("rack") as string) : "";
  const rackState = params.get("rackState") ? decodeURIComponent(params.get("rackState") as string) : "";
  const project = params.get("project") ? decodeURIComponent(params.get("project") as string) : "";
  const isGpuRack = params.get("isGpuRack") === "true";
  const availabilityDomain = params.get("availabilityDomain")
    ? decodeURIComponent(params.get("availabilityDomain") as string)
    : "";
  const userTypeParam = params.get("userType");
  const userType = userTypeParam === "master" ? "master" : "vendor";
  const ticketParam = params.get("ticket");
  const ticket = ticketParam && ticketParam.trim() !== "" ? decodeURIComponent(ticketParam) : undefined;

  // If ticket is present: force resolveEnabled=true and resolveDisabledReason=null
  // If ticket is absent: use resolveEnabled/resolveDisabledReason from URL, and treat ticket as null/undefined
  const result: Partial<RackMetadata> = {
    rackSerialNumber: decodeURIComponent(id),
    project,
    building,
    block,
    rack,
    rackState,
    isGpuRack,
    availabilityDomain,
    userType,
  };

  if (ticket) {
    result.ticket = ticket;
    result.resolveEnabled = true;
    // intentionally do not set resolveDisabledReason (keeps it null in state)
  } else {
    // No ticket: read resolve fields from URL
    result.resolveEnabled = params.get("resolveEnabled") === "true";
    result.resolveDisabledReason = params.get("resolveDisabledReason")
      ? decodeURIComponent(params.get("resolveDisabledReason") as string)
      : "";
    // and do not set ticket (remains null in state)
  }

  return result;
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
  const [selectedUserType, setSelectedUserType] = useState<"master" | "vendor">("vendor");
  const [selectedResolveEnabled, setSelectedResolveEnabled] = useState<boolean>(false);
  const [selectedResolveDisabledReason, setSelectedResolveDisabledReason] = useState<string>("");
  const [rackReady, setRackReady] = useState<boolean>(false);
  const [rackSNVersion, setRackSNVersion] = useState(0);


  useEffect(() => {
    Context.getPageContext().getBusyContext().applicationBootstrapComplete();
    setSelectedPage(props.page as string)
    setSelectedVendor(getStoredVendorName());
    setSelectedUserType(sessionStorage.getItem("LVV_USER_TYPE") === "master" ? "master" : "vendor");
  }, [selectedVendor]);

  // Hydrate rack context from URL when user refreshes /rack/{id}
  useEffect(() => {
    const isRackUrl = window.location.pathname.includes("/rack/");
    if (!isRackUrl) return;

    // Only hydrate if we don't already have rack context
    if (selectedRackSerialNumber && selectedBuilding && selectedBlock && selectedRack) return;

    const ctx = decodeRackUrlContext();
    if (ctx.rackSerialNumber) setSelectedRackSerialNumber(ctx.rackSerialNumber);
    // If URL region differs from current selected region, we currently keep the app's selected region.
    // Region in URL is mainly for hydration / sharing; selection is still controlled by Header.
    if (ctx.building) setSelectedBuilding(ctx.building);
    if (ctx.block) setSelectedBlock(ctx.block);
    if (ctx.rack) setSelectedRack(ctx.rack);
    if (typeof ctx.rackState === "string") setSelectedRackState(ctx.rackState);
    if (ctx.project) setSelectedProject(ctx.project);
    if (typeof ctx.isGpuRack === "boolean") setSelectedIsGpuRack(Boolean(ctx.isGpuRack));
    if (typeof ctx.availabilityDomain === "string") setSelectedAvailabilityDomain(ctx.availabilityDomain);
    if (typeof ctx.ticket === "string") setSelectedTicket(ctx.ticket);
    if (ctx.userType) setSelectedUserType(ctx.userType);
    if (typeof ctx.resolveEnabled === "boolean") setSelectedResolveEnabled(Boolean(ctx.resolveEnabled));
    if (typeof ctx.resolveDisabledReason === "string") setSelectedResolveDisabledReason(String(ctx.resolveDisabledReason || ""));

    // Bump version so downstream effects (rackReady/navigation) can proceed
    setRackSNVersion((v) => v + 1);
  }, [selectedRackSerialNumber, selectedBuilding, selectedBlock, selectedRack]);

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
    if (rackReady && !(props.page && props.page.includes("rack"))) {
      // Build query according to rules:
      // - If ticket is present (non-empty), include ticket only; omit resolveEnabled/resolveDisabledReason
      // - If ticket is absent, include resolveEnabled and resolveDisabledReason; omit ticket
      const hasTicket = String(selectedTicket || "").trim() !== "";
      const queryObj: Record<string, string> = {
        region: String(props.region || ""),
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
  const isHome = !isRack && !isCabling;
  return (
    <div class="oj-web-applayout-max-width oj-web-applayout-content">
      {isCabling ? (
        <Cabling />
      ) : (
        <>
      {/* Keep Home mounted to preserve project/filter state; isActive pauses Home-only requests while hidden. */}
      <div style={{ display: isRack ? 'none' : 'block' }}>
        <div>
          <HomeContainer
            isActive={isHome}
            onRackChanged={rackChangedHandler}
            vendor={selectedVendor}
            region={props.region}
          />
        </div>
      </div>
      {isRack && (
        <>
          {rackReady ? (
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
                availabilityDomain={selectedAvailabilityDomain}
                userType={selectedUserType}
                resolveEnabled={selectedResolveEnabled}
                resolveDisabledReason={selectedResolveDisabledReason}
                region={props.region}
            />
          ) : (
            <div style={{ padding: '16px' }}>Loading rack context…</div>
          )}
        </>
      )}
      </>
      )}
    </div>
  )

};

export default Content;
