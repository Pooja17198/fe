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

type Props = {
  pagerouter: CoreRouter;
  page?: string;
  routes: Array<object>;
  onPageChanged: (value: any) => void;
};

let INIT_SELECTEDRACK: any | null = null;

type RackMetadata = {
  building: string;
  block: string;
  rack: string;
}

const Content = (props: Props) => {
  const [selectedPage, setSelectedPage] = useState<string>("");

  const [selectedRack, setSelectedRack] = useState(INIT_SELECTEDRACK)

  const [selectedBuilding, setSelectedBuilding] = useState(INIT_SELECTEDRACK)

  const [selectedBlock, setSelectedBlock] = useState(INIT_SELECTEDRACK)


  const pageChangeHandler = (page: any) => {
  };

  useEffect(() => {
    Context.getPageContext().getBusyContext().applicationBootstrapComplete();
    setSelectedPage(props.page as string)
  }, []);

  const rackChangedHandler = (value: RackMetadata) => {
    setSelectedRack(value.rack);
    setSelectedBuilding(value.building);
    setSelectedBlock(value.block);
    let rackPage = {
      path: "rack",
      id: value.rack
    }
    props.onPageChanged(rackPage);
  };

  let pageContent = (page: string) => {
    if (page && page.includes("rack")) {
      return <Rack building={selectedBuilding} block={selectedBlock} rack={selectedRack} />
    }
    else {
      return <HomeContainer onRackChanged={rackChangedHandler} />
    }
  }

  return (
    <div class="oj-web-applayout-max-width oj-web-applayout-content">
      {pageContent(props.page as string)}
    </div>
  );
};

export default Content;
