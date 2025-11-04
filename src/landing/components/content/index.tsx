/**
 * @license
 * Copyright (c) 2014, 2024, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
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
}

const Content = (props: Props) => {
  const [selectedPage, setSelectedPage] = useState<string>("");
  const [selectedTicket, setSelectedTicket] = useState(INIT_DEFAULT)
  const [selectedRack, setSelectedRack] = useState(INIT_DEFAULT)
  const [selectedBuilding, setSelectedBuilding] = useState(INIT_DEFAULT)
  const [selectedBlock, setSelectedBlock] = useState(INIT_DEFAULT)
  const [selectedRackSerialNumber, setSelectedRackSerialNumber] = useState(INIT_DEFAULT)
  const [selectedVendor, setSelectedVendor] = useState(INIT_DEFAULT);

  useEffect(() => {
    Context.getPageContext().getBusyContext().applicationBootstrapComplete();
    setSelectedPage(props.page as string)
    setSelectedVendor(sessionStorage.getItem("X-Oracle-Vendor") || "");
  }, [selectedVendor]);

  const rackChangedHandler = (value: any) => {
    setSelectedRack(value.rack);
    setSelectedBuilding(value.building);
    setSelectedBlock(value.block);
    setSelectedTicket(value.ticket);
    setSelectedRackSerialNumber(value.rackSerialNumber)
    let rackPage = {
      path: "rack",
      id: value.rackSerialNumber
    }
    props.onPageChanged(rackPage);
  };

  const vendorChangedHandler = (event: any) => {
    if (typeof event == "string") {
      setSelectedVendor(event)
      props.onVendorChanged(event);
      console.log(selectedVendor)
    }
    if (event.detail.value) {
      setSelectedVendor(event.detail.value)
      props.onVendorChanged(event.detail.value);
      console.log(selectedVendor)
    }
  }

  let pageContent = (page: string) => {
    if (page && page.includes("rack")) {
      return <Rack onPageChanged={props.onPageChanged} building={selectedBuilding} block={selectedBlock} rack={selectedRack} ticket={selectedTicket} rack_serial={selectedRackSerialNumber} region={props.region} />
    } else {
      // the input box is for dev only, will remove once in prod
      return <div>
        {/* <oj-form-layout max-columns="1" direction="row">
          <oj-c-input-text label-hint="(Dev Only) Type and Change Vendor, Press Enter" onvalueChanged={vendorChangedHandler}></oj-c-input-text>
        </oj-form-layout> */}
        <HomeContainer onRackChanged={rackChangedHandler} vendor={selectedVendor} region={props.region} />
      </div>

    }
  }

  return (
    <div class="oj-web-applayout-max-width oj-web-applayout-content">
      {pageContent(props.page as string)}
    </div>
  );
};

export default Content;
