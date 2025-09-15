import { h } from "preact";
import ProjectTableContainer from "./projectTable";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import { useEffect, useState } from "preact/hooks";
import ProjectDetailsContainer from "./projectDetails";
import { RESTDataProvider } from "ojs/ojrestdataprovider";
import "ojs/ojprogress-circle";


let INIT_SELECTEDPROJECT: any | null = null;

type Props = {
  onRackChanged: (value: RackMetadata) => void;
  vendor?: string;
}

type RackMetadata = {
    building: string;
    block: string;
    rack: string;
}

type ProjectMetadata = {
    projectId: string;
    building: string;
    blocks: string[];
}

const API_URL = window.location.host.includes('localhost') ? "http://localhost:21000/lvv" : `https://${window.location.host}/lvv`;

const HomeContainer = (props: Props) => {

    const [projectList, setProjectList] = useState([]);
    let projectListProvider = new MutableArrayDataProvider(projectList, { keyAttributes: "projectId" })
    const [isLoading, setIsLoading] = useState(false);

    let dataProvider = new RESTDataProvider({
        keyAttributes: "",
        url: `${API_URL}/projects?vendorName=${props.vendor}`,
        transforms: {
            fetchFirst: {
                request: async (options) => {
                    const url = new URL(options.url);
                    console.log(url.href);
                    return new Request(url.href);
                },
                response: async ({ body, headers, status }) => {
                    // const { initialCablingTasks, validationFailureTasks } = body;
                    console.log(body);
                    return { data: body };
                },
            },
        },
    })

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);                   // Start loading
            const result = await dataProvider.fetchFirst({ size: 100 })[Symbol.asyncIterator]().next();
            setProjectList(result.value.data);
            setIsLoading(false);                  // End loading
        };
        if (props.vendor) {
            fetchData();
        }
    }, [props.vendor]);

    const [selectedProject, setSelectedProject] = useState(
        INIT_SELECTEDPROJECT
    );

    const showProjectDetails = () => {
        return selectedProject != null ? true : false;
    };

    const projectChangedHandler = (value: ProjectMetadata) => {
        setSelectedProject(value);
    };

    const rackSelectedHandler = (value: any) => {
        let info = {
            "building": value.building,
            "block": value.block,
            "rack": value.rackLocation,
            "ticket": value.ticket,
            "rackSerialNumber": value.rackSerialNumber
        }
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
                <ProjectDetailsContainer project={selectedProject} onRackChanged={rackSelectedHandler} />
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