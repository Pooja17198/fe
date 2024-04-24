import { h } from "preact";
import { TableIntrinsicProps, ojTable } from "ojs/ojtable";
import "ojs/ojtable";
import { useState } from "preact/hooks";
import { KeySetImpl } from "ojs/ojkeyset";
import "ojs/ojtable";
import * as project_building_list from "text!../project_building.json";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");

const projectsDataProvider = new MutableArrayDataProvider(JSON.parse(project_building_list), {keyAttributes: "projectId"});


let COLUMNS = [{
    "headerText": "Project Id",
    "field": "projectId",
    "id": "projectId"
},
{
  "headerText": "Building",
  "field": "building",
  "id": "building"
},
{
    "headerText": "Block",
    "field": "block",
    "id": "block"
}]

type Props = {
    data: MutableArrayDataProvider<any, any>;
    value?: string;
    onProjectChanged: (value: number) => void;
};

const INIT_SELECTEDITEMS = {
    row: new KeySetImpl(),
    column: new KeySetImpl()
};

const INIT_SELECTION_MODE: TableIntrinsicProps['selectionMode'] = {
    column: 'none',
    row: 'single'
};

const ProjectTableContainer = (props: Props) => {

    const [selectedItems, setSelectedItems] = useState(INIT_SELECTEDITEMS);

    const [selectedRows, setSelectedRows] = useState([]);

    let selectionText = '';

    const onSelectionChangedHandler = (event: ojTable.selectedChanged<any, any>) => {
        const row = event.detail.value.row as KeySetImpl<any>;
        if (row.values().size > 0) {
            row.values().forEach(element => {
                props.onProjectChanged(element)
            });
        }
    };

    return (
        <div class="projectTable oj-flex-item">
            <h3 id="projectTableHeader">Projects</h3>
            <oj-table
                selectionMode={INIT_SELECTION_MODE}
                onselectedChanged={onSelectionChangedHandler}
                aria-label="Projects Table" id="projectTable" scroll-policy="loadMoreOnScroll" scroll-policy-options='{"fetchSize": 5}' columns={COLUMNS} data={props.data}>
            </oj-table>
        </div>
    );
};

export default ProjectTableContainer;
