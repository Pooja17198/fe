import { h } from "preact";
import ProjectTableContainer from "./projectTable";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import * as project_building_list from "text!../project_building.json";
import { useState } from "preact/hooks";
import ProjectDetailsContainer from "./projectDetails";

let INIT_SELECTEDPROJECT: any | null = null;

type Props = {
  onRackChanged: (value: RackMetadata) => void;
}

type RackMetadata = {
    building: string;
    block: string;
    rack: string;
}

type ProjectMetadata = {
    projectId: string;
    building: string;
    block: string;
}

const activityDataProvider = new MutableArrayDataProvider(JSON.parse(project_building_list), { keyAttributes: ["projectId", "building", "block"] });

const HomeContainer = (props: Props) => {
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
            "building": selectedProject[1],
            "block": selectedProject[2],
            "rack": value[0],
            "ticket": value[1]
        }
      props.onRackChanged(info)
    };

    return (
        <div class="oj-flex oj-flex-init home-container">
            <ProjectTableContainer data={activityDataProvider} onProjectChanged={projectChangedHandler} />
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