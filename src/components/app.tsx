/**
 * @license
 * Copyright (c) 2014, 2024, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { registerCustomElement } from "ojs/ojvcomponent";
import { h } from "preact";
import { useEffect, useState, useRef } from "preact/hooks";

import Context = require("ojs/ojcontext");
import CoreRouter = require("ojs/ojcorerouter");
import { Footer } from "./footer";
import { Header } from "./header";
import Content from "./content/index";
import UrlPathParamAdapter = require("ojs/ojurlpathparamadapter");

type Props = {
  appName?: string;
  userLogin?: string;
};

const routeArray: Array<any> = [
  { path: '', redirect: 'home' },
  {
    path: "rack/{id}",
    detail: {
      label: "Rack"
    },
  },
  {
    path: "home",
    detail: {
      label: "Home"
    },
  }
]

const router = new CoreRouter<CoreRouter.DetailedRouteConfig>(routeArray, {
  urlAdapter: new UrlPathParamAdapter("/"),
});

type Route = {
  path: string,
  id: string
}

const pageChangeHandler = (route: Route) => {
  router.go({ path: route.path, params: {id: route.id} });
};

export const App = registerCustomElement("app-root", (props: Props) => {
    props.appName = "LVV Portal";
    props.userLogin = "some.person@oracle.com";
    const [routePath, setRoutePath] = useState<string>('');

    const routerUpdated = (actionable: CoreRouter.ActionableState<CoreRouter.DetailedRouteConfig>): void => {
      // Update our state based on new router state
      const newPath = actionable.state?.path;
      setRoutePath(newPath);
    };

    useEffect(() => {
      Context.getPageContext().getBusyContext().applicationBootstrapComplete();
      router.currentState.subscribe(routerUpdated);
      router.sync();
    }, []);
    
    return (
      <div id="appContainer" class="oj-web-applayout-page">
        <Header
          appName={props.appName}
          userLogin={props.userLogin}
        />
        <Content 
          page={routePath}
          pagerouter={router} 
          onPageChanged={pageChangeHandler}
          routes={routeArray}/>
        <Footer />
      </div>
    );
  }
);
