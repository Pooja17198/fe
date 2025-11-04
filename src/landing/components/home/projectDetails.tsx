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
        "headerText": "Block",
        "field": "block",
        "id": "block"
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

type Project = {
    projectId: string;
    building: string;
    blocks: string[];
    prefilterBlocks?: string[];
};

type Props = {
    project: Project;
    onRackChanged: (value: any) => void;
    region: string;
};

const INIT_SELECTION_MODE: TableIntrinsicProps['selectionMode'] = {
    column: 'none',
    row: 'single'
};

// TODO: Check it out
const ACC = {rowHeader: "Rack"}

const API_URL = window.location.host.includes('localhost') ? "http://localhost:21000/lvv" : `https://${window.location.host}/lvv`;

const ProjectDetailsContainer = (props: Props) => {

    const [projectData, setProjectData] = useState<any[]>([]);
    let projectDataProvider = new MutableArrayDataProvider(projectData, { keyAttributes: ['rackLocation', 'ticket', 'rackSerialNumber'] })
    const [allProjectData, setAllProjectData] = useState<any[]>([]); // Add this state
    const [loading, setLoading] = useState(false);

    const [activeBlocks, setActiveBlocks] = useState<string[]>([]);

    const parseTasks = (body: any) => {
        console.log(body)
        let racks: any[] = []
        if (body['initialCablingTasks'] && Array.isArray(body['initialCablingTasks'])) {
            for (let task of body['initialCablingTasks']) {
                racks.push({
                    "building": props.project.building,
                    "block": task.block || '-',
                    "rackLocation": task.rackLocation || "9999",
                    "rackSerialNumber": task.rackSerialNumber,
                    "type": "cabling",
                    "ticket": task.ticketId
                })
            }
        }
        if (body['validationFailureTasks'] && Array.isArray(body['validationFailureTasks'])) {
            for (let task of body['validationFailureTasks']) {
                racks.push({
                    "building": props.project.building,
                    "block": task.block || '-',
                    "rackLocation": task.rackLocation || "9999",
                    "rackSerialNumber": task.rackSerialNumber,
                    "type": "validation",
                    "ticket": task.ticketId
                })
            }
        }
        return racks
    }

    useEffect(() => {
        const initial = props.project.prefilterBlocks && props.project.prefilterBlocks.length > 0
            ? props.project.prefilterBlocks
            : props.project.blocks || [];
        const uniqueBlocks = Array.from(new Set(initial));
        setActiveBlocks(uniqueBlocks);
    }, [props.project, props.region]);

    useEffect(() => {
        const ac = new AbortController();
        const fetchAllData = async () => {
            setAllProjectData([]); // clear previous
            setLoading(true);      // <--- Start loading
            if (!props.project?.projectId) {
                setLoading(false); // <--- End loading early if nothing to load
                return;
            }

            const url = new URL(`${API_URL}/cablingTasks`);
            url.searchParams.set("projectId", props.project.projectId);
            url.searchParams.set("regionName", props.region)

            try {
                const resp = await fetch(url.href, { signal: ac.signal });
                if (resp.ok) {
                    const body = await resp.json();
                    const rows = parseTasks(body);
                    setAllProjectData(rows); // Store all tasks for the project
                }
            } catch (e){
                console.error('Failed to fetch cablingTasks:', e);
            } finally {
                setLoading(false);  // <--- Stop loading
            }
        };

        fetchAllData();

        return () => ac.abort();
    }, [props.project, props.region]);

    useEffect(() => {
        console.log('projectData:', projectData);
        // If you also want each row:
        projectData.forEach((row, idx) => {
            console.log(`Row ${idx}:`, row);
        });
    }, [projectData]);

    useEffect(() => {
        // Whenever blocks or all data changes, filter locally
        if (activeBlocks.length === 0) {
            setProjectData([]);
            return;
        }
        setProjectData(allProjectData.filter(row => row.block && activeBlocks.includes(row.block)));
    }, [activeBlocks, allProjectData]);

    const onSelectionChangedHandler = (event: ojTable.selectedChanged<any, any>) => {
        const row = event.detail.value.row as KeySetImpl<any>;
        if (row.values().size > 0) {
            row.values().forEach(element => {
                let keyParts: any[] = Array.isArray(element)
                    ? element
                    : [element?.rackLocation, element?.ticket, element?.rackSerialNumber];
                const match = (projectData as any[]).find((r: any) =>
                    r.rackLocation === keyParts[0] && r.ticket === keyParts[1] && r.rackSerialNumber === keyParts[2]
                );
                props.onRackChanged(match || element);
            });
        }
    };

    return (
        <div id="parentContainer2" class="oj-flex-item oj-md-8 oj-sm-12 oj-reflow">
            <h2>Project {props.project.projectId} Details</h2>
            <div style="margin-bottom: 12px;">
                <span style="font-weight: 600;">Filter by block:</span>
                {(props.project.blocks || []).map((b) => {
                    const checked = activeBlocks.includes(b);
                    const onChange = (e: any) => {
                        const isChecked = (e.target as HTMLInputElement).checked;
                        setActiveBlocks((prev) => {
                            const set = new Set(prev);
                            if (isChecked) set.add(b);
                            else set.delete(b);
                            return Array.from(set);
                        });
                    };
                    return (
                        <label style="margin-left: 8px;">
                            <input type="checkbox" checked={checked} onChange={onChange} /> {b}
                        </label>
                    );
                })}
            </div>
            {loading ? (
                <div style="display:flex; justify-content:center; align-items:center; min-height:200px;">
                    <oj-progress-circle size="md" value={-1} />
                </div>
            ) : (
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
            )}
        </div>
    );
};

export default ProjectDetailsContainer;