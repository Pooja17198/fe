/**
 * @license
 * Copyright (c) 2014, 2024, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { registerCustomElement } from "ojs/ojvcomponent";
import { useEffect, useState, useRef } from "preact/hooks";

import Context = require("ojs/ojcontext");
import CoreRouter = require("ojs/ojcorerouter");
import { Footer } from "./footer";
import { Header } from "./header";
import Content from "./content/index";
import UrlPathParamAdapter = require("ojs/ojurlpathparamadapter");
import { getInitialLvvUserType } from "./home/userType";
import "oj-c/drawer-layout";
import "ojs/ojnavigationlist";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import {h} from "preact";


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
  },
  {
    path: "deployment-group-validation",
    detail: {
      label: "Deployment Group Validation"
    },
  },
  {
    path: "deployment-group-validation-page",
    detail: {
      label: "Deployment Group Validation Page"
    },
  },
  {
    path: "cabling",
    detail: {
      label: "Cabling"
    },
  },
  {
    path: "qc",
    detail: {
      label: "Quality Control"
    }
  }
]

type DrawerItem = {
  id: string;
  label: string;
};

const drawerItems: DrawerItem[] = [
  { id: "home",       label: "Rack Validation" },
  { id: "cabling",    label: "Cabling and Materials" },
  { id: "qc",         label: "Quality Control" }
];

const drawerDP = new MutableArrayDataProvider<DrawerItem["id"], DrawerItem>(
    drawerItems,
    { keyAttributes: "id" }
);

const router = new CoreRouter<CoreRouter.DetailedRouteConfig>(routeArray, {
  urlAdapter: new UrlPathParamAdapter("/"),
});

// ─── Session constants ────────────────────────────────────────────────────────
const TOKEN_REFRESH_MS      = 15.1 * 60 * 1000;     // refresh IDCS token every 15 min
const RELAUNCH_AUTH_URL     = "/";          // force fresh login flow

function isLocalhost(): boolean {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function getStoredVendorName(): string {
  const storedVendor = sessionStorage.getItem("X-Oracle-Vendor") || "";
  if (storedVendor.trim() !== "") {
    return storedVendor;
  }

  return "";
}

function isSyncOverriddenError(error: unknown): boolean {
  return error === "sync overridden"
    || (error instanceof Error && error.message === "sync overridden");
}

type Route = {
  path: string;
  id?: string;
  query?: Record<string, string>;
};

const pageChangeHandler = async (route: Route) => {
  // Navigate via CoreRouter using path/params; master accepts passing params for all routes
  try {
    await router.go({
      path: route.path,
      params: route.id ? ({ id: route.id } as any) : undefined
    });
  } catch (error) {
    if (!isSyncOverriddenError(error)) {
      throw error;
    }
  }

  // Unified URL normalization approach:
  // 1) Clear any existing query
  // 2) If route.query provided, add those params
  // 3) Normalize home to '/'
  try {
    const basePath =
      route.path === 'home'
        ? '/'
        : route.path === 'rack' && route.id
          ? `/rack/${encodeURIComponent(route.id)}`
          : route.path
            ? `/${route.path}`
            : window.location.pathname;
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
    const [selectedVendor, setSelectedVendor] = useState<string>(getStoredVendorName);
    const [selectedRegion, setSelectedRegion] = useState<string>("us-phoenix-1");
    const [selectedUserType, setSelectedUserType] = useState<"master" | "vendor">(() =>
      getInitialLvvUserType(isLocalhost())
    );
    const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);

    props.appName = "LVV Portal";
    props.userLogin = sessionStorage.getItem("X-Oracle-Vendor-Email") || "";
    const [routePath, setRoutePath] = useState<string>('');

    const tokenRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const refreshInFlightRef = useRef(false);
    const redirectingRef     = useRef(false);


    const routerUpdated = (actionable: CoreRouter.ActionableState<CoreRouter.DetailedRouteConfig>): void => {
      // Update our state based on new router state
      const newPath = actionable.state?.path;
      setRoutePath(newPath);
    };

    const navigationSelection = routePath?.startsWith("qc")
        ? "qc"
        : routePath?.startsWith("rack")
            ? "home"
            : routePath;

    const vendorChangedHandler = (vendor: string) => {
      setSelectedVendor(vendor)
      console.log(selectedVendor)
    };

    const regionChangedHandler = (region: string) => {
      setSelectedRegion(region);
    };

    const userTypeChangedHandler = (userType: "master" | "vendor") => {
      sessionStorage.setItem("LVV_USER_TYPE", userType);
      setSelectedUserType(userType);
    };

    const redirectToLogin = () => {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      stopTokenRefresh();
      window.location.assign(RELAUNCH_AUTH_URL);
    };

// ─── Token refresh (SPLAT/IDCS callback) ────────────────────────────────────
    const refreshToken = async () => {
      if (refreshInFlightRef.current || redirectingRef.current) return;
      refreshInFlightRef.current = true;
      const refreshUrl = `/callback?refresh&_=${Date.now()}`;
      try {
        const response = await fetch(refreshUrl, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "follow",
        });

        if (!response.ok) {
          throw new Error(`Refresh failed with status ${response.status}`);
        }
      } catch (err) {
        console.error("Token refresh failed, redirecting to login.", err);
        redirectToLogin();
      } finally {
        refreshInFlightRef.current = false;
      }
    };

      const startTokenRefresh = () => {
        if (isLocalhost()) {
          return;
        }
        void refreshToken();
        tokenRefreshTimer.current = setInterval(() => {
          void refreshToken();
        }, TOKEN_REFRESH_MS);
      };

      const stopTokenRefresh = () => {
        if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current);
      };

    useEffect(() => {
      Context.getPageContext().getBusyContext().applicationBootstrapComplete();
      setSelectedVendor(getStoredVendorName());

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
      void router.sync().catch((error) => {
        if (!isSyncOverriddenError(error)) {
          console.error(error);
        }
      });
      startTokenRefresh();

      return () => {
        stopTokenRefresh();
      };
    }, []);

    const menuItemTemplate = (item: any) => (
        <li>
          <a href="#" className="layout-menu-item-label">
            <div className={"oj-sm-padding-1x"}>{item.data.label}</div>
          </a>
        </li>
    );
    
    return (
        <div id="appContainer" class="oj-web-applayout-page lvv-app-shell">
          <Header
              appName={props.appName}
              userLogin={props.userLogin}
              vendorName={selectedVendor}
              regionValue={selectedRegion}
              page={routePath}
              onRegionChanged={regionChangedHandler}
              onPageChanged={pageChangeHandler}
              onMenuClick={() => setMenuDrawerOpen(o => !o)}
              isMenuOpen={menuDrawerOpen}
          />
          <main className="lvv-app-body">
            <oj-c-drawer-layout
                start-display="reflow"
                start-opened={menuDrawerOpen}
                onstart-opened-changed={(e: any) => setMenuDrawerOpen(e.detail.value)}
                class="lvv-content-drawer-layout"
            >
              <div slot="start" className="lvv-drawer-start oj-sm-padding-4x">
                <div className="demo-drawer-header">
                  <div>
                    <h6>Menu</h6>
                  </div>
                </div>
                <oj-navigation-list
                    edge="start"
                    data={drawerDP}
                    selection={navigationSelection}
                    onselectionChanged={(e: any) => {
                      const nextPath = e.detail.value as string;
                      if (!nextPath || nextPath === navigationSelection) {
                        return;
                      }
                      void pageChangeHandler({path: nextPath});
                      setMenuDrawerOpen(false);
                    }}
                >
                  <template slot="itemTemplate" render={menuItemTemplate}></template>
                </oj-navigation-list>
              </div>
              <div class="lvv-main-content">
                <Content
                    page={routePath}
                    pagerouter={router}
                    onPageChanged={pageChangeHandler}
                    onVendorChanged={vendorChangedHandler}
                    onUserTypeChanged={userTypeChangedHandler}
                    vendorName={selectedVendor}
                    region={selectedRegion}
                    routes={routeArray}
                />
              </div>
            </oj-c-drawer-layout>
          </main>
          <Footer/>
        </div>
    );
    }
);
