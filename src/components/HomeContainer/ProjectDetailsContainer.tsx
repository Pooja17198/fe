import { h } from "preact";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
// import * as storeData from "text!./store_data.json";
import { useState, useCallback } from "preact/hooks";
import "ojs/ojtable";
import { TableElement, TableIntrinsicProps, ojTable, ojTableEventMap } from "ojs/ojtable";
import * as project_info from "text!../project_info.json";

const projectDataProvider = new MutableArrayDataProvider(JSON.parse(project_info), { keyAttributes: "rack_number" });

let COLUMNS = [
{
    "headerText": "Rack Number",
    "field": "rack_number",
    "id": "rack_number"
},
{
    "headerText": "Issue(s) Type",
    "field": "type",
    "id": "type"
},
{
    "headerText": "Issue(s) Count",
    "field": "item_count",
    "id": "item_count"
}]

type Props = { project: number; };
// const baseServiceUrl = "https://apex.oracle.com/pls/apex/oraclejet/lp/activities/";
// let INIT_DATAPROVIDER = new RESTDataProvider<ActivityItem["id"], ActivityItem>({
//   keyAttributes: "id",
//   url: baseServiceUrl,
//   transforms: {
//     fetchFirst: {
//       request: null!,
//       response: (): any => {
//         return { data: [] };
//       },
//     },
//   },
// });

const ProjectDetailsContainer = (props: Props) => {

    const [selectedItemVal, setSelectedItemVal] = useState<any | null>(null);

    const activityItemChangeHandler = useCallback((item: any) => { setSelectedItemVal(item); }, [selectedItemVal]);

    const showItems = useCallback(() => selectedItemVal === null ? false : true, [selectedItemVal]);

    return (
        <div id="parentContainer2" class="oj-flex oj-flex-item oj-md-8 oj-sm-12">
            <div>
                <oj-table class="oj-table oj-table-hover oj-table-responsive" aria-label="Projects Details Table" id="projectDetailsTable" columns={COLUMNS} data={projectDataProvider} scroll-policy="loadMoreOnScroll" scroll-policy-options='{"fetchSize": 5}'></oj-table>
            </div>
            <div>
                <ul>
                    <li>Project TPM: Jira Ticket Reporter Name</li>
                    <li>Building: IAD32</li>
                    <li>Block: 5</li>
                    <li>Project ID: <b>{props.project}</b></li>
                    <li>Other Project Info will load here when the project/building row is expanded</li>
                </ul>
            </div>
        </div>
    );
};

export default ProjectDetailsContainer;
