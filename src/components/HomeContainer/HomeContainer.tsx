import { h } from "preact";
import ProjectTableContainer from "./ProjectTableContainer";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import * as project_building_list from "text!../project_building.json";


const activityDataProvider = new MutableArrayDataProvider(JSON.parse(project_building_list), {keyAttributes: "projectId"});

export function HomeContainer() {
  return (
    <div class="oj-flex oj-flex-init">
        <ProjectTableContainer data={activityDataProvider} />
        {/* <ProjectInfoContainer /> */}
    </div>
    
  );
};
