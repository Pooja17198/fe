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
  path: string;
  id?: string;
  query?: Record<string, string>;
};

const pageChangeHandler = async (route: Route) => {
  // Navigate via CoreRouter using path/params; master accepts passing params for all routes
  await router.go({ path: route.path, params: { id: route.id } as any });

  // Unified URL normalization approach:
  // 1) Clear any existing query
  // 2) If route.query provided, add those params
  // 3) Normalize home to '/'
  try {
    const basePath = route.path === 'home' ? '/' : window.location.pathname;
    const u = new URL(window.location.origin + basePath);
    if (route.query) {
      Object.entries(route.query).forEach(([k, v]) => {
        if (v != null) u.searchParams.set(k, String(v));
      });
    }
    const nextUrl = u.toString();
    window.history.replaceState({}, '', nextUrl);
  } catch (e) {
    console.error(e);
  }
};

export const App = registerCustomElement("app-root", (props: Props) => {
  const [selectedVendor, setSelectedVendor] = useState("XYZ");
  const [selectedRegion, setSelectedRegion] = useState<string>("us-phoenix-1");

    props.appName = "LVV Portal";
    props.userLogin = sessionStorage.getItem("X-Oracle-Vendor-Email") || "";
    const [routePath, setRoutePath] = useState<string>('');


    const routerUpdated = (actionable: CoreRouter.ActionableState<CoreRouter.DetailedRouteConfig>): void => {
      // Update our state based on new router state
      const newPath = actionable.state?.path;
      setRoutePath(newPath);
    };

    const vendorChangedHandler = (vendor: string) => {
      setSelectedVendor(vendor)
      console.log(selectedVendor)
    }

    const regionChangedHandler = (region: string) => {
      setSelectedRegion(region);
    }

    useEffect(() => {
      Context.getPageContext().getBusyContext().applicationBootstrapComplete();
      setSelectedVendor(sessionStorage.getItem("X-Oracle-Vendor") || "");

      // If user lands directly on a shared /rack/{id}?region=... URL, hydrate the app region from URL.
      // This ensures rack refresh/share uses the correct region for allDevicesInRack.
      try {
        const params = new URLSearchParams(window.location.search);
        const regionFromUrl = params.get("region");
        if (regionFromUrl && regionFromUrl.trim() && regionFromUrl !== selectedRegion) {
          setSelectedRegion(regionFromUrl);
        }
      } catch (e) {
        // malformed URL
        console.error(e);
      }

      router.currentState.subscribe(routerUpdated);
      router.sync();
    }, [selectedVendor]);
    
    return (
      <div id="appContainer" class="oj-web-applayout-page">
        <Header
          appName={props.appName}
          userLogin={props.userLogin}
          vendorName={selectedVendor}
          regionValue={selectedRegion}
          onRegionChanged={regionChangedHandler}
        />
        <Content 
          page={routePath}
          pagerouter={router} 
          onPageChanged={pageChangeHandler}
          onVendorChanged={vendorChangedHandler}
          region={selectedRegion}
          routes={routeArray}/>
        <Footer />
      </div>
    );
  }
);
