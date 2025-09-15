import { h } from "preact";
import { TableIntrinsicProps, ojTable } from "ojs/ojtable";
import "ojs/ojtable";
import { useState } from "preact/hooks";
import { KeySetImpl } from "ojs/ojkeyset";
import "ojs/ojtable";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");


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
    "headerText": "Block(s)",
    "field": "blocks",
    "id": "blocks",
    "template": "blocksTemplate"
    }]

type Props = {
    data: MutableArrayDataProvider<any, any>;
    value?: string;
    onProjectChanged: (value: ProjectMetadata) => void;
};

type ProjectMetadata = {
    projectId: string;
    building: string;
    blocks: string[];
    prefilterBlocks?: string[];
}

const INIT_SELECTION_MODE: TableIntrinsicProps['selectionMode'] = {
    column: 'none',
    row: 'single'
};

// TODO: Check this once.
const ACC = {rowHeader: "ProjectName"}

const ProjectTableContainer = (props: Props) => {
    const onSelectionChangedHandler = async (event: ojTable.selectedChanged<any, any>) => {
        const row = event.detail.value.row as KeySetImpl<any>;
        if (row.values().size > 0) {
            const result = await (props.data as any).fetchByKeys({ keys: row.values() });
            if (result && result.results) {
                for (const key of row.values()) {
                    const item = result.results.get(key);
                    if (item && item.data) {
                        props.onProjectChanged(item.data as ProjectMetadata);
                    }
                }
            }
        }
    };

    const blocksTemplate = (context: any) => {
        const row = (context?.item && context.item.data) || {};
        const blocks: string[] =
            Array.isArray(row.blocks) && row.blocks.length > 0
                ? row.blocks
                : (row.block ? [row.block] : []);
        return <span>{blocks.length ? blocks.join(", ") : "-"}</span>;
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
                <template slot="blocksTemplate" render={blocksTemplate} />
            </oj-table>
        </div>
    );
};

export default ProjectTableContainer;