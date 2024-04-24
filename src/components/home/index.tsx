import { h } from "preact";
import ProjectTableContainer from "./projectTable";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import * as project_building_list from "text!../project_building.json";
import { useState } from "preact/hooks";
import ProjectDetailsContainer from "./projectDetails";

let INIT_SELECTEDPROJECT: any | null = null;

type Props = {
  onRackChanged: (value: string) => void;
}

const activityDataProvider = new MutableArrayDataProvider(JSON.parse(project_building_list), { keyAttributes: "projectId" });

const HomeContainer = (props: Props) => {
    const [selectedProject, setSelectedProject] = useState(
        INIT_SELECTEDPROJECT
    );

    const showProjectDetails = () => {
        return selectedProject != null ? true : false;
    };

    const projectChangedHandler = (value: any) => {
        setSelectedProject(value);
    };

    const rackSelectedHandler = (value: any) => {
      props.onRackChanged(value)
    };

    return (
        <div class="oj-flex oj-flex-init">
            <ProjectTableContainer data={activityDataProvider} onProjectChanged={projectChangedHandler} />
            {showProjectDetails() && (
                <ProjectDetailsContainer project={selectedProject} onRackChanged={rackSelectedHandler} />
            )}
            {!showProjectDetails() && (
                <h4 class="oj-typography-subheading-sm">
                    Select project to view items
                </h4>
            )}
        </div>

    );
};

export default HomeContainer;