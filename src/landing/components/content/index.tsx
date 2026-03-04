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
import { CInputTextElement } from "oj-c/input-text";
//For the transpiled javascript to load the element's module, import as below
import "oj-c/input-text";
import "ojs/ojformlayout";


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
  ticket: string;
  rackSerialNumber?: string;
  resolveEnabled?: boolean;
  resolveDisabledReason?: string;
}

const Content = (props: Props) => {
  const [selectedPage, setSelectedPage] = useState<string>("");
  const [selectedTicket, setSelectedTicket] = useState(INIT_DEFAULT)
  const [selectedRack, setSelectedRack] = useState(INIT_DEFAULT)
  const [selectedBuilding, setSelectedBuilding] = useState(INIT_DEFAULT)
  const [selectedBlock, setSelectedBlock] = useState(INIT_DEFAULT)
  const [selectedRackSerialNumber, setSelectedRackSerialNumber] = useState(INIT_DEFAULT)
  const [selectedVendor, setSelectedVendor] = useState(INIT_DEFAULT);
  const [selectedResolveEnabled, setSelectedResolveEnabled] = useState<boolean>(false);
  const [selectedResolveDisabledReason, setSelectedResolveDisabledReason] = useState<string>("");
  const [rackReady, setRackReady] = useState<boolean>(false);
  const [rackSNVersion, setRackSNVersion] = useState(0);


  useEffect(() => {
    Context.getPageContext().getBusyContext().applicationBootstrapComplete();
    setSelectedPage(props.page as string)
    setSelectedVendor(sessionStorage.getItem("X-Oracle-Vendor") || "");
  }, [selectedVendor]);

  const rackChangedHandler = (value: any) => {
    console.log("Rack value passed is ", value);
    setSelectedRack(value.rack);
    setSelectedBuilding(value.building);
    setSelectedBlock(value.block);
    setSelectedTicket(value.ticket);
    setSelectedResolveEnabled(value.resolveEnabled !== false);
    setSelectedResolveDisabledReason(String(value.resolveDisabledReason || ""));
    setSelectedRackSerialNumber(value.rackSerialNumber);

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
      props.onPageChanged({ path: "rack", id: selectedRackSerialNumber });
    }
  }, [rackReady, rackSNVersion]);

  const isRack = Boolean(props.page?.includes("rack"));
  return (
    <div class="oj-web-applayout-max-width oj-web-applayout-content">
      <div style={{ display: isRack ? 'none' : 'block' }}>
        <div>
          <HomeContainer onRackChanged={rackChangedHandler} vendor={selectedVendor} region={props.region} />
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
                ticket={selectedTicket}
                rack_serial={selectedRackSerialNumber}
                resolveEnabled={selectedResolveEnabled}
                resolveDisabledReason={selectedResolveDisabledReason}
                region={props.region}
            />
          ) : (
            <div style={{ padding: '16px' }}>Loading rack context…</div>
          )}
        </>
      )}
    </div>
  )

};

export default Content;
