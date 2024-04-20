import { h } from "preact";
import MutableArrayDataProvider = require("@oracle/oraclejet/ojmutablearraydataprovider");
import { TableElement } from "ojs/ojtable";
import { RowExpanderElement } from "ojs/ojrowexpander";
import "ojs/ojtable";
import "ojs/ojrowexpander";

let COLUMNS = [{
    "headerText": "Project Id", 
    "field": "projectId",
    "id": "projectId"
},
{
    "headerText": "Block",
    "field": "block",
    "id": "block"
}]

type Props = {
    data: MutableArrayDataProvider<any, any>;
  };

const ProjectTableContainer = (props: Props) => {
  return (
    <div class="projectTable oj-flex-item oj-md-width-1/2">
        <h3 id="projectTableHeader">Projects</h3>
        <oj-table aria-label="Projects Table" id="projectTable" scroll-policy="loadMoreOnScroll" scroll-policy-options='{"fetchSize": 5}' columns={COLUMNS} data={props.data}>
        </oj-table>
    </div>
  );
};

export default ProjectTableContainer;
