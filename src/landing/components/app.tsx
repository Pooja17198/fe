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

const router = new CoreRouter<CoreRouter.DetailedRouteConfig>(routeArray, {
  urlAdapter: new UrlPathParamAdapter("/"),
});

// ─── Session constants ────────────────────────────────────────────────────────
const TOKEN_REFRESH_MS      = 15.1 * 60 * 1000;     // refresh IDCS token every 15 min
const TOKEN_REFRESH_MAX_ATTEMPTS = 3;               // redirect only after 3 failed refresh attempts
const TOKEN_REFRESH_RETRY_DELAY_MS = 1000;
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
    await router.go({ path: route.path, params: { id: route.id } as any });
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
        for (let attempt = 1; attempt <= TOKEN_REFRESH_MAX_ATTEMPTS; attempt += 1) {
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
            return;
          } catch (err) {
            if (attempt >= TOKEN_REFRESH_MAX_ATTEMPTS) {
              throw err;
            }
            console.warn(`Token refresh attempt ${attempt} failed; retrying.`, err);
            await new Promise<void>((resolve) =>
              window.setTimeout(resolve, TOKEN_REFRESH_RETRY_DELAY_MS)
            );
          }
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

    return (
      <div id="appContainer" class="oj-web-applayout-page">
        <Header
          appName={props.appName}
          userLogin={props.userLogin}
          vendorName={selectedVendor}
          userType={selectedUserType}
          regionValue={selectedRegion}
          page={routePath}
          onRegionChanged={regionChangedHandler}
          onPageChanged={pageChangeHandler}
        />
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
        <Footer />
      </div>
    );
  }
);
