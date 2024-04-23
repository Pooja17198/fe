import { h } from "preact";
import ProjectTableContainer from "./ProjectTableContainer";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import * as project_building_list from "text!../project_building.json";
import { useState } from "preact/hooks";
import ProjectDetailsContainer from "./ProjectDetailsContainer";

let INIT_SELECTEDPROJECT: any | null = null;

const activityDataProvider = new MutableArrayDataProvider(JSON.parse(project_building_list), { keyAttributes: "projectId" });

export function HomeContainer() {
    const [selectedProject, setSelectedProject] = useState(
        INIT_SELECTEDPROJECT
    );

    const showProjectDetails = () => {
        return selectedProject != null ? true : false;
    };

    const projectChangedHandler = (value: any) => {
        console.log("here" + value);
        setSelectedProject(value);
    };

    return (
        <div class="oj-flex oj-flex-init">
            <ProjectTableContainer data={activityDataProvider} onProjectChanged={projectChangedHandler} />
            {showProjectDetails() && (
                <ProjectDetailsContainer project={selectedProject} />
            )}
            {!showProjectDetails() && (
                <h4 class="oj-typography-subheading-sm">
                    Select project to view items
                </h4>
            )}
        </div>

    );
};
