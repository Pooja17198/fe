import { h, ComponentProps } from "preact";

import { useEffect, useState } from "preact/hooks";
import CoreRouter = require("ojs/ojcorerouter");


type Props = {
  pagerouter?: CoreRouter;
};

type Route = {
  path: string;
  detail?: object;
  redirect?: string;
};


const Rack = (props: Props) => {
 
  return (
    <div class="oj-web-applayout-max-width ">
        This is the rack module
    </div>
  );
};
export default Rack;