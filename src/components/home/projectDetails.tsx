import { h } from "preact";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import { useState, useCallback } from "preact/hooks";
import "ojs/ojtable";
import { TableElement, TableIntrinsicProps, ojTable, ojTableEventMap } from "ojs/ojtable";
import * as project_info from "text!../project_info.json";
import { KeySetImpl } from "ojs/ojkeyset";


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

type Props = { 
    project: string[]; 
    value?: string;
    onRackChanged: (value: number) => void;
};


const INIT_SELECTEDITEMS = {
    row: new KeySetImpl(),
    column: new KeySetImpl()
};

const INIT_SELECTION_MODE: TableIntrinsicProps['selectionMode'] = {
    column: 'none',
    row: 'single'
};

const ProjectDetailsContainer = (props: Props) => {

    const [selectedItemVal, setSelectedItemVal] = useState<any | null>(null);

    const activityItemChangeHandler = useCallback((item: any) => { setSelectedItemVal(item); }, [selectedItemVal]);

    const showItems = useCallback(() => selectedItemVal === null ? false : true, [selectedItemVal]);

    let selectionText = '';

    const onSelectionChangedHandler = (event: ojTable.selectedChanged<any, any>) => {
        const row = event.detail.value.row as KeySetImpl<any>;
        if (row.values().size > 0) {
            row.values().forEach(element => {
                props.onRackChanged(element)
            });
        }
    };

    return (
        <div id="parentContainer2" class="oj-flex-item oj-md-8 oj-sm-12">
            <h2>Project {props.project[0]} Details</h2>
            <div>
                <oj-table 
                    selectionMode={INIT_SELECTION_MODE}
                    onselectedChanged={onSelectionChangedHandler}
                    class="oj-table oj-table-hover oj-table-responsive" aria-label="Projects Details Table" id="projectDetailsTable" columns={COLUMNS} data={projectDataProvider} scroll-policy="loadMoreOnScroll" scroll-policy-options='{"fetchSize": 5}'></oj-table>
            </div>
            <div>
                <ul id="projectInfo">
                    <li>Project TPM: Jira Ticket Reporter Name</li>
                    <li>Building: {props.project[1]}</li>
                    <li>Block: {props.project[2]}</li>
                    <li>Project ID: <b>{props.project[0]}</b></li>
                </ul>
            </div>
        </div>
    );
};

export default ProjectDetailsContainer;
