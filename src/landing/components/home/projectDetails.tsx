import { h } from "preact";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import { useEffect, useState } from "preact/hooks";
import "ojs/ojtable";
import { TableIntrinsicProps, ojTable } from "ojs/ojtable";
import * as project_info from "text!../project_info.json";
import { KeySetImpl } from "ojs/ojkeyset";
import { RESTDataProvider } from "ojs/ojrestdataprovider";


let COLUMNS = [
{
    "headerText": "Rack Location",
    "field": "rackLocation",
    "id": "rackLocation"
},
{
    "headerText": "Rack Serial Number",
    "field": "rackSerialNumber",
    "id": "rackSerialNumber"
},
{
    "headerText": "Issue(s) Type",
    "field": "type",
    "id": "type",
    "headerClassName": "oj-sm-only-hide",
    "className": "oj-sm-only-hide"
},
{
    "headerText": "Ticket",
    "field": "ticket",
    "id": "ticket",
    "headerClassName": "oj-sm-only-hide",
    "className": "oj-sm-only-hide"
}]

type Props = { 
    project: string[]; 
    value?: string;
    onRackChanged: (value: number) => void;
};

const INIT_SELECTION_MODE: TableIntrinsicProps['selectionMode'] = {
    column: 'none',
    row: 'single'
};

// TODO: Check it out
const ACC = {rowHeader: "Rack"}

const API_URL = window.location.host.includes('localhost') ? "https://lvv.us-phoenix-1.oci.oc-test.com/lvv" : `https://${window.location.host}/lvv`;

const ProjectDetailsContainer = (props: Props) => {

    const [projectData, setProjectData] = useState([]);
    let projectDataProvider = new MutableArrayDataProvider(projectData, { keyAttributes: ['rackLocation', 'ticket', 'rackSerialNumber'] })

    const parseTasks = (body: any) => {
        console.log(body)
        let racks: any[] = []
        for (let task of body['initialCablingTasks']) {
            racks.push({
                "building": props.project[1],
                "block": props.project[2],
                "rackLocation": task.rackLocation || 9999,
                "rackSerialNumber": task.rackSerialNumber,
                "type": "cabling",
                "ticket": task.ticketId
            })
        }
        for (let task of body['validationFailureTasks']) {
            racks.push({
                "building": props.project[1],
                "block": props.project[2],
                "rackLocation": task.rackLocation || 9999,
                "rackSerialNumber": task.rackSerialNumber,
                "type": "validation",
                "ticket": task.ticketId
            })
        }
        return racks
    }

    let dataProvider = new RESTDataProvider({
        keyAttributes: "",
        url: `${API_URL}/cablingTasks`,
        transforms: {
            fetchFirst: {
                request: async (options) => {
                    const url = new URL(options.url);
                    url.searchParams.set("building", props.project[1]);
                    url.searchParams.set("block", props.project[2]);
                    console.log(url.href);
                    return new Request(url.href);
                },
                response: async ({ body, headers, status }) => {
                    const { initialCablingTasks, validationFailureTasks } = body;
                    console.log(parseTasks(body))
                    return { data: parseTasks(body) };
                },
            },
        },
    })

    useEffect(() => {
        const fetchData = async () => {
            const result = await dataProvider.fetchFirst({ size: 100 })[Symbol.asyncIterator]().next();
            setProjectData(result.value.data)
        }
        fetchData();
    }, [props.project]);
    
    const onSelectionChangedHandler = (event: ojTable.selectedChanged<any, any>) => {
        const row = event.detail.value.row as KeySetImpl<any>;
        if (row.values().size > 0) {
            row.values().forEach(element => {
                props.onRackChanged(element)
            });
        }
    };

    return (
        <div id="parentContainer2" class="oj-flex-item oj-md-8 oj-sm-12 oj-reflow">
            <h2>Project {props.project[0]} Details</h2>
            <div>
                <oj-table 
                    selectionMode={INIT_SELECTION_MODE}
                    onselectedChanged={onSelectionChangedHandler}
                    class="selectable-table oj-table oj-table-hover oj-table-responsive"
                    aria-label="Projects Details Table"
                    id="projectDetailsTable"
                    columns={COLUMNS}
                    data={projectDataProvider}
                    accessibility={ACC}
                    scroll-policy="loadMoreOnScroll"
                    scroll-policy-options='{"fetchSize": 5}'>
                </oj-table>
            </div>
            <div>
                <ul id="projectInfo">
                    {/* <li>Project TPM: Jira Ticket Reporter Name</li> */}
                    <li>Building: {props.project[1]}</li>
                    <li>Block: {props.project[2]}</li>
                    <li>Project ID: <b>{props.project[0]}</b></li>
                </ul>
            </div>
        </div>
    );
};

export default ProjectDetailsContainer;
