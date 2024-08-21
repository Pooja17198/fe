import { h } from "preact";
import { useEffect, useCallback, useState } from "preact/hooks";
import CoreRouter = require("ojs/ojcorerouter");
import 'ojs/ojcollapsible';
import 'ojs/ojtable';
import "oj-c/button";
import * as project_building_list from "text!../project_building.json";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import { ojTable } from 'ojs/ojtable';
import { ojButton } from "ojs/ojbutton";
import { RESTDataProvider } from "ojs/ojrestdataprovider";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

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
  onPageChanged: (value: any) => void;
  building: string;
  block: string;
  rack: string;
  ticket: string;
  rack_serial: string;
};

type Route = {
  path: string;
  detail?: object;
  redirect?: string;
};

let LLDP_COLUMNS = [{
  "headerText": "Origin",
  "field": "currentOrigin",
  "id": "currentOrigin"
},
{
  "headerText": "Current Destination",
  "field": "currentDestination",
  "id": "currentDestination",
  "template": "currentDestTemplate"
},
{
  "headerText": "Expected Destination",
  "field": "expectedDestination",
  "id": "expectedDestination"
}
]

let OPTICS_COLUMNS = [{
  "headerText": "Device",
  "field": "device",
  "id": "device"
},
{
  "headerText": "Physical Device",
  "field": "devicePhys",
  "id": "devicePhys",
  "headerTemplate": "physicalDeviceTemplate"
},
{
  "headerText": "Input Power",
  "field": "inputPower",
  "id": "inputPower"
},
{
  "headerText": "Output Power",
  "field": "outputPower",
  "id": "outputPower"
},
{
  "headerText": "Interface Name",
  "field": "intfName",
  "id": "intfName"
}
]

const API_URL = window.location.host.includes('localhost') ? "http://localhost:21000/lvv/cablingTasks" : `https://${window.location.host}/lvv/cablingTasks`;

const Rack = (props: Props) => {

  // TODO: Check this once.
  const ACC = {rowHeader: "ActionItems"}
  const [lldpErrors, setLldpErrors] = useState([])
  let lldpDataProvider = new ArrayDataProvider(lldpErrors, { keyAttributes: '' });

  const [opticsErrors, setOpticsErrors] = useState([])
  let opticsDataProvider = new ArrayDataProvider(opticsErrors, { keyAttributes: '' });

  const [gpuErrors, setGpuErrors] = useState([])
  let gpuDataProvider = new ArrayDataProvider(opticsErrors, { keyAttributes: '' });

  const [illegalPorts, setIllegalPorts] = useState([]);

  let dataProvider = new RESTDataProvider({
    keyAttributes: "id",
    url: `${API_URL}/${props.ticket}/actions/getCableValidationFailureTask`,
    transforms: {
      fetchFirst: {
        request: async (options) => {
          const url = new URL(options.url);
          console.log(url.href);
          return new Request(url.href);
        },
        response: async ({ body, headers, status }) => {
          const { lldpFailures, opticsFailures } = body;
          return { data: [body] };
        },
      },
    },
  })

  const buttonClickedHandler = async () => {
    const really = confirm("Are you sure you want to resolve the AIs for this Rack");
    if (!really) {
      console.log("OK, we canceled that delete.");
      return;
    }
  
    // Create and send request to REST service to resolve the ticket
    const myHeaders = new Headers();
    myHeaders.append("X-OCI-Splat-CSRF", "1");

    const myInit = {
      method: "POST",
      headers: myHeaders
    };

    const request = new Request(API_URL + "/" + props.ticket + "/actions/resolveValidationFailureTask", myInit);
    const response = await fetch(request);
  
    if (response.ok) {
      console.log("Ticket is resolved");
      props.onPageChanged({ path: "" });
    } else {
      alert(`Delete failed with status ${response.status} : ${response.statusText}`);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const result = await dataProvider.fetchFirst({ size: 100 })[Symbol.asyncIterator]().next();
      setLldpErrors(result.value.data[0].lldpFailures);
      setOpticsErrors(result.value.data[0].opticsFailures);
      setGpuErrors(result.value.data[0].gpuFailures);
      setIllegalPorts(result.value.data[0].invalidTransceiverFailures);
    }
    fetchData();
  }, []);

  const physicalDeviceTemplate = (item: ojTable.HeaderTemplateContext<any>) => {
    return (
      <div class="oj-table-column-header-text">
        <span>Physical Device</span>
        <br></br>
        <span>bldg:rack:elevation</span>
      </div>
    );
  };

  const currentDestTemplate = (dest: ojTable.RowTemplateContext<any, any>) => {
    let value = (dest.data === "Unknown:Unknown:Unknown") ? "Unknown" : dest.data;
    return (
      <div>
        <span>{value}</span>
      </div>
    );
  };

  return (
    <div>
      <div class="header-center">
        <h2>Building: {props.building}, Block: {props.block}, Rack: {props.rack}, Serial: {props.rack_serial} </h2>
        <oj-c-button chroming="callToAction" data-testid="resolve-ai-test" size="sm" label="Resolve" onojAction={buttonClickedHandler}></oj-c-button>
      </div>

      <div className="oj-flex">
      <div className="oj-flex-item rack-panel">
          <h3>Transceiver Action Items</h3>
          <span className="h4Style oj-text-color-danger">The following transceivers are manufactured by CENTERA and need to be replaced.</span>
          <br />
          <span style="white-space: pre-line;">{illegalPorts.map((a: { errorMessage: any; }) => a.errorMessage).join("\n")}</span>
        </div>

        <div className="oj-flex-item rack-panel">
          <h3>Link Action Items</h3>
          <span className="h4Style oj-text-color-danger">The following links need to be checked and replaced.</span>
          <br />
          <oj-table
              class="selectable-table"
              display="grid"
              horizontal-grid-visible="enabled"
              vertical-grid-visible="enabled"
              aria-label="Link Action Items"
              id="LinkActionItemsTable"
              accessibility={ACC}
              scroll-policy="loadMoreOnScroll"
              scroll-policy-options='{"fetchSize": 5}'
              columns={LLDP_COLUMNS}
              data={lldpDataProvider}>
            <template slot="currentDestTemplate" render={currentDestTemplate}/>
          </oj-table>
        </div>

        <div className="oj-flex-item rack-panel">
          <h3>Optics Action Items</h3>
          <span className="h4Style oj-text-color-danger">Please reseat the cable or replace the bad cable here.</span>
          <br />
          <oj-table
              display="grid"
              horizontal-grid-visible="enabled"
              vertical-grid-visible="enabled"
              aria-label="Optics Action Items"
              id="OpticsActionItemsTable"
              accessibility={ACC}
              scroll-policy="loadMoreOnScroll"
              scroll-policy-options='{"fetchSize": 5}'
              columns={OPTICS_COLUMNS}
              data={opticsDataProvider}>
            <template slot="physicalDeviceTemplate" render={physicalDeviceTemplate}/>
          </oj-table>
        </div>

        <div className="oj-flex-item rack-panel">
          <h3>GPU Action Items</h3>
          <span className="h4Style oj-text-color-danger">Please reseat the cable or replace the bad cable here.</span>
          <oj-table
              display="grid"
              horizontal-grid-visible="enabled"
              vertical-grid-visible="enabled"
              aria-label="GPU Action Items"
              id="GPUActionItemsTable"
              accessibility={ACC}
              scroll-policy="loadMoreOnScroll"
              scroll-policy-options='{"fetchSize": 5}'
              columns={LLDP_COLUMNS}
              data={gpuDataProvider}>
            <template slot="physicalDeviceTemplate" render={physicalDeviceTemplate}/>
          </oj-table>
        </div>

        * When Action Items are completed, Click the Resolve button at the top of the page.
      </div>
    </div>
  );
};
export default Rack;