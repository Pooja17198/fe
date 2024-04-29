import { h } from "preact";
import { useEffect, useCallback, useState } from "preact/hooks";
import CoreRouter = require("ojs/ojcorerouter");
import 'ojs/ojcollapsible';
import 'ojs/ojtable';
// import "oj-c/button";
import * as project_building_list from "text!../project_building.json";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import { ojTable } from 'ojs/ojtable';
// import { ojButton } from "ojs/ojbutton";
import { RESTDataProvider } from "ojs/ojrestdataprovider";

const lvvUrl: string = "http://localhost:21000/lvv/cablingTasks";
let keyAttributes: string = "projectId";


const INIT_DATAPROVIDER = new RESTDataProvider({
  keyAttributes: "",
  url: "http://localhost:21000/lvv",
  transforms: {
    fetchFirst: {
      request: null!,
      response: (): any => {
        return { data: [] };
      },
    },
  },
});

type Props = {
  pagerouter?: CoreRouter;
  building: string;
  block: string;
  rack: string;
};

type Route = {
  path: string;
  detail?: object;
  redirect?: string;
};

let LLDP_COLUMNS = [{
  "headerText": "Origin",
  "field": "current_origin",
  "id": "current_origin"
},
{
  "headerText": "Current Destination",
  "field": "current_destination",
  "id": "current_destination"
},
{
  "headerText": "Expected Destination",
  "field": "expected_destination",
  "id": "expected_destination"
}
]

let OPTICS_COLUMNS = [{
  "headerText": "Device",
  "field": "device",
  "id": "device"
},
{
  "headerText": "Physical Device",
  "field": "device_phys",
  "id": "device_phys"
},
{
  "headerText": "Input Power",
  "field": "input_power",
  "id": "input_power"
},
{
  "headerText": "Output Power",
  "field": "input_power",
  "id": "input_power"
},
{
  "headerText": "Interface Name",
  "field": "intf_name",
  "id": "intf_name"
}
]
const projectsDataProvider = new MutableArrayDataProvider(JSON.parse(project_building_list), { keyAttributes: "projectId" });

type Row = {
  key: number | null
}


const Rack = (props: Props) => {

  const [isLoader, setIsLoader] = useState(true);
    useEffect(() => {
      setactivityItemDP(
        new RESTDataProvider({
          keyAttributes: "id",
          url: lvvUrl,
          transforms: {
            fetchFirst: {
              request: async (options) => {
                const url = new URL(options.url);
                //  building=phx1&block=7&rackSerialNumber=4104
                url.searchParams.set("building", props.building);
                url.searchParams.set("block", props.block);
                url.searchParams.set("rackSerialNumber", props.rack);
                console.log(url.href);
                return new Request(url.href);
              },
              response: async ({ body, headers, status }) => {
                const { items, totalSize, hasMore } = body;
                return { data: items, totalSize, hasMore };
              },
            },
          },
        })
      );
    }, []);
  
    const [activityItemDP, setactivityItemDP] = useState(INIT_DATAPROVIDER);
  return (
    <div>
      {/* A small bug with the button, will update once fixed. */}
      {/* <oj-c-button data-testid="resolve-ai-test" size="sm" disabled={isLoader} label="Resolve AIs"></oj-c-button> */}
      <h2 class="header-center">Building: {props.building}, Block: {props.block}, Rack: {props.rack}, Serial: 2X385HDJVK2847</h2>
      <div class="oj-flex">
        <div class="oj-flex-item rack-panel">
          <oj-collapsible id="c1">
            <h3 id="h" slot="header">Cabling Action Items</h3>
            <p id="c">The following links need to be checked and replaced.</p>
          </oj-collapsible>
          <h3 class="header-center"></h3>
          <oj-table display="grid" 
            horizontal-grid-visible="enabled"
            vertical-grid-visible="enabled" 
            aria-label="Cabling Action Items" 
            id="projectTable" scroll-policy="loadMoreOnScroll" scroll-policy-options='{"fetchSize": 5}' columns={LLDP_COLUMNS} data={activityItemDP}>
          </oj-table>
        </div>

        <div class="oj-flex-item rack-panel">
          <oj-collapsible id="c1">
            <h3 id="h" slot="header">Optics Action Items</h3>
            <p id="c">Please reseat the cable or replace the bad cable here.</p>
          </oj-collapsible>
          <oj-table display="grid" horizontal-grid-visible="enabled" vertical-grid-visible="enabled" aria-label="Optics Action Items" id="projectTable" scroll-policy="loadMoreOnScroll" scroll-policy-options='{"fetchSize": 5}' columns={OPTICS_COLUMNS} data={projectsDataProvider}>
          </oj-table>
        </div>
      </div>
    </div>
  );
};
export default Rack;