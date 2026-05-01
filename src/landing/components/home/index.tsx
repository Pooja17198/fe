import { h } from "preact";
import ProjectTableContainer from "./projectTable";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import { useEffect, useRef, useState } from "preact/hooks";
import ProjectDetailsContainer from "./projectDetails";
import { ProjectLoadMeasurement } from "./types";
import "ojs/ojprogress-circle";
import { getLvvApiBase } from "../../config/api";


let INIT_SELECTEDPROJECT: any | null = null;

// Props coming from the parent component
type Props = {
  isActive?: boolean;
  onRackChanged: (value: RackMetadata) => void;
  vendor?: string;
  region: string;
}

type RackMetadata = {
    building: string;
    block: string;
    rack: string;
    rackState?: string;
    ticket?: string;
    rackSerialNumber?: string;
    isGpuRack?: boolean;
    availabilityDomain?: string;
    resolveEnabled?: boolean;
    resolveDisabledReason?: string;
    userType?: "master" | "vendor";
}

type ProjectMetadata = {
    projectId: string;
    building: string;
    blocks: string[];
}

const API_URL = getLvvApiBase();

const HomeContainer = (props: Props) => {

    const [projectList, setProjectList] = useState<any[]>([]);
    const [userType, setUserType] = useState<"master" | "vendor">("vendor");

    //This gets updated every time the projectList changes
    let projectListProvider = new MutableArrayDataProvider<any, any>(projectList, { keyAttributes: "projectId" })

    const [isLoading, setIsLoading] = useState(false);
    const isLocalDesktop = window.location.host.includes("localhost");

    const vendorUrl = `${API_URL}/projects?vendorName=${props.vendor}&regionName=${props.region}`
    let params = '';
    if (props.region) {
        params = `regionName=${encodeURIComponent(props.region)}`;
    }
    const masterUrl = `${API_URL}/allProjects${params ? `?${params}` : ''}`;

    useEffect(() => {
        // Route changes run the previous cleanup first; skip starting Home list work while hidden.
        if (props.isActive === false) {
            return;
        }

        // Abort project-list requests when Home is hidden, unmounts, or vendor/region changes.
        const ac = new AbortController();

        const fetchData = async () => {
            setIsLoading(true);

            let projects = [];
            let vendorResponse;
            let resolvedUserType: "master" | "vendor" = "vendor";

            try {
                if (!props.vendor && isLocalDesktop) {
                    const masterFetch = await fetch(masterUrl, { signal: ac.signal });
                    if (masterFetch.ok) {
                        projects = await masterFetch.json();
                        resolvedUserType = "master";
                    } else {
                        projects = [];
                    }
                } else {
                    // Fetch from vendorUrl
                    const vendorFetch = await fetch(vendorUrl, { signal: ac.signal });
                    vendorResponse = await vendorFetch.json();

                    // Assuming the API returns an array of projects
                    if (Array.isArray(vendorResponse) && vendorResponse.length === 0) {
                        // vendorUrl returned empty: try masterUrl
                        try {
                            const masterFetch = await fetch(masterUrl, { signal: ac.signal });
                            if (masterFetch.status === 404) {
                                // masterUrl returns 404: fallback to vendorResponse
                                projects = vendorResponse;
                            } else if (masterFetch.ok) {
                                projects = await masterFetch.json();
                                resolvedUserType = "master";
                            } else {
                                projects = vendorResponse;
                            }
                        } catch (error) {
                            // Error fetching masterUrl: fallback to vendorResponse
                            projects = vendorResponse;
                        }
                    } else {
                        // vendorUrl returned data
                        projects = vendorResponse;
                    }
                }
            } catch (error) {
                if ((error as any)?.name === "AbortError") {
                    return;
                }
                // Error fetching vendorUrl
                projects = []; // or handle error as needed
            }

            if (ac.signal.aborted) {
                return;
            }

            sessionStorage.setItem("LVV_USER_TYPE", resolvedUserType);
            setUserType(resolvedUserType);
            setProjectList(projects);
            setIsLoading(false);
        };

        if (props.vendor || isLocalDesktop) {
            fetchData();
        }

        return () => {
            ac.abort();
        };
    }, [props.isActive, props.vendor, props.region, isLocalDesktop]);

    const [selectedProject, setSelectedProject] = useState(
        INIT_SELECTEDPROJECT
    );
    const [projectLoadMeasurement, setProjectLoadMeasurement] = useState<ProjectLoadMeasurement | null>(null);
    const projectMeasurementIdRef = useRef(0);

    // Reset selectedProject to initial state whenever region changes
    useEffect(() => {
        setSelectedProject(INIT_SELECTEDPROJECT);
        setProjectLoadMeasurement(null);
    }, [props.region]);

    const showProjectDetails = () => {
        return selectedProject != null ? true : false;
    };

    const projectChangedHandler = (value: ProjectMetadata) => {
        setSelectedProject(value);
        const measurementId = ++projectMeasurementIdRef.current;
        setProjectLoadMeasurement({
            measurementId,
            projectId: value.projectId,
            startedAt: Date.now(),
        });
    };

    const rackSelectedHandler = (value: any) => {
        let info = {
            project: selectedProject?.projectId,
            building: value.building,
            block: value.block,
            rack: value.rackLocation,
            rackState: value.rackState,
            ticket: value.ticketId,
            rackSerialNumber: value.rackSerialNumber,
            isGpuRack: value.isGpuRack,
            availabilityDomain: value.availabilityDomain,
            resolveEnabled: value.resolveEnabled !== false,
            resolveDisabledReason: value.resolveDisabledReason || "",
            userType,
        }
        console.log("Info passed ", info);
        props.onRackChanged(info)
    };

    return (
        <div class="oj-flex oj-flex-init home-container oj-reflow">
            {/* Show loading indicator while project list is loading */}
            {isLoading
                ? (
                    <div style="display:flex; justify-content:center; align-items:center; min-height:200px;">
                        <oj-progress-circle size="md" value={-1} />
                    </div>
                )
                : <ProjectTableContainer data={projectListProvider} onProjectChanged={projectChangedHandler} />
            }
            {showProjectDetails() && (
                <ProjectDetailsContainer
                    isActive={props.isActive !== false}
                    project={selectedProject}
                    onRackChanged={rackSelectedHandler}
                    region={props.region}
                    projectLoadMeasurement={projectLoadMeasurement}
                />
            )}
            {!showProjectDetails() && (
                <div id="parentContainer2" class="oj-flex oj-flex-item oj-md-8 oj-sm-12">
                    <h2 class="header-center">
                        Select project to view items
                    </h2>
                </div>
            )}
        </div>
    );
};

export default HomeContainer;
