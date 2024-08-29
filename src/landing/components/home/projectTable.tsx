import { h } from "preact";
import { TableIntrinsicProps, ojTable } from "ojs/ojtable";
import "ojs/ojtable";
import { useState } from "preact/hooks";
import { KeySetImpl } from "ojs/ojkeyset";
import "ojs/ojtable";
import * as project_building_list from "text!../project_building.json";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import { RESTDataProvider } from "ojs/ojrestdataprovider";


let keyAttributes: string = "projectId";


let COLUMNS = [{
    "headerText": "Project ID",
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
    onProjectChanged: (value: ProjectMetadata) => void;
};

type ProjectMetadata = {
    projectId: string;
    building: string;
    block: string;
}

const INIT_SELECTION_MODE: TableIntrinsicProps['selectionMode'] = {
    column: 'none',
    row: 'single'
};

// TODO: Check this once.
const ACC = {rowHeader: "ProjectName"}

const ProjectTableContainer = (props: Props) => {
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
            <h2 id="projectTableHeader">Projects</h2>
            <oj-table
                class="selectable-table"
                selectionMode={INIT_SELECTION_MODE}
                onselectedChanged={onSelectionChangedHandler}
                aria-label="Projects Table"
                id="projectTable"
                accessibility={ACC}
                scroll-policy="loadMoreOnScroll"
                scroll-policy-options='{"fetchSize": 5}'
                columns={COLUMNS}
                data={props.data}>
            </oj-table>
        </div>
    );
};

export default ProjectTableContainer;
