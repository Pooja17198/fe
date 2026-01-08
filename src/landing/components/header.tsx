/**
 * @license
 * Copyright (c) 2014, 2024, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { h } from "preact";
import { useRef, useState, useEffect } from "preact/hooks";
import * as ResponsiveUtils from "ojs/ojresponsiveutils";
import "ojs/ojtoolbar";
import "ojs/ojmenu";
import "ojs/ojbutton";
import "ojs/ojselectcombobox";

type Props = Readonly<{
  appName: string,
  userLogin: string,
  vendorName: string,
  regionValue?: string,
  onRegionChanged?: (region: string) => void
}>;

export function Header({ appName, userLogin, vendorName, regionValue, onRegionChanged }: Props) {
  const mediaQueryRef = useRef<MediaQueryList>(window.matchMedia(ResponsiveUtils.getFrameworkQuery("sm-only")!));

  const [isSmallWidth, setIsSmallWidth] = useState(mediaQueryRef.current.matches);

  useEffect(() => {
    mediaQueryRef.current.addEventListener("change", handleMediaQueryChange);
    return (() => mediaQueryRef.current.removeEventListener("change", handleMediaQueryChange));
  }, [mediaQueryRef]);

  function handleMediaQueryChange(e: MediaQueryListEvent) {
    setIsSmallWidth(e.matches);
  }

  function getDisplayType() {
    return (isSmallWidth ? "icons" : "all");
  }

  function getEndIconClass() {
    return (isSmallWidth ? "oj-icon demo-appheader-avatar" : "oj-component-icon oj-button-menu-dropdown-icon");
  }

  // Determine LVV_API dynamically as in rack/index.tsx
  const LVV_API = window.location.host.includes("localhost")
      ? "http://localhost:21000/lvv"
      : `https://${window.location.host}/lvv`;

  const [regions, setRegions] = useState<{ name: string, airportCode: string }[]>([]);
  const [regionsError, setRegionsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRegions = async () => {
      setRegionsError(null);
      try {
        //Hardcoding the realm to be oc1 for now. In the future, when we expand to other realms we can work on making it dynamic
        const url = new URL(`${LVV_API}/allRegions/oc1`);
        const resp = await fetch(url.href, { method: "GET" });
        if (!resp.ok) throw new Error(`Failed to fetch regions: ${resp.status}`);
        const data = await resp.json();
        let formattedRegions: { name: string, airportCode: string }[] = [];
        if (Array.isArray(data)) {
          // try to handle if data is array of strings or objects
          if (typeof data[0] === "object" && data[0].name && data[0].airportCode) {
            formattedRegions = data;
          }
        }
        setRegions(formattedRegions);
      } catch (e: any) {
        setRegionsError(e.message ?? "Region fetch failed");
      }
    };
    fetchRegions();
  }, [LVV_API]);

  const logoutUrl = `/logout`;

  function handleUserMenuAction(e: any) {
    const detail = e?.detail || {};
    const actionValue = detail.value || detail.selectedValue || detail.key || detail?.option?.value;
    const targetId = (e?.target && e.target.id) || (e?.srcElement && e.srcElement.id);
    let resolved = actionValue;
    if (!resolved && typeof targetId === "string") {
      if (targetId.includes("out")) resolved = "out";
      else if (targetId.includes("help")) resolved = "help";
      else resolved = null;
    }

    if (resolved === "help") {
      const link = document.createElement('a');
      link.href = "./landing/resources/lvv_portal_tutorial.pdf";  // Path to your PDF file
      link.download = "lvv_portal_tutorial.pdf"; // The filename user will see

      document.body.appendChild(link);

      link.click();

      document.body.removeChild(link);
      return;
    }
    else if (resolved === "out") {
      window.location.assign(logoutUrl);
    }
  }

  // TODO: Add a Home Button
  // Log regions data for debugging just before rendering
  console.log('regions', regions);
  return (
      <header role="banner" class="oj-web-applayout-header">
        <div class="oj-web-applayout-max-width oj-flex-bar oj-sm-align-items-center">
          <div class="oj-flex-bar-middle oj-sm-align-items-baseline">
          <span
              role="img"
              class="oj-icon demo-oracle-icon"
              title="Oracle Logo"
              alt="Oracle Logo">
          </span>
            <h1
                class="oj-sm-only-hide oj-web-applayout-header-title"
                title="Application Name">
              {appName} Vendor Name: {vendorName}
            </h1>
          </div>
          <div class="oj-flex-bar-end">
            {regions.length > 0 && (
                <oj-combobox-one
                    value={regionValue}
                    placeholder="Select Region"
                    label-hint="Region"
                    onvalueChanged={(e: any) => {
                      const newVal = typeof e === "string" ? e : e?.detail?.value;
                      if (onRegionChanged && typeof newVal === "string") {
                        onRegionChanged(newVal);
                      }
                    }}
                    class="oj-form-control-max-width-lg oj-sm-margin-2x-end"
                    style="min-width: 360px;"
                >
                  {regions.map((r) => (
                      <oj-option value={r.name} key={r.name}>
                        {r.name} ({r.airportCode})
                      </oj-option>
                  ))}
                </oj-combobox-one>
            )}
            <oj-toolbar>
              <oj-menu-button id="userMenu" display={getDisplayType()} chroming="borderless" onojAction={handleUserMenuAction}>
                <span aria-label={userLogin}>{userLogin}</span>
                <span slot="endIcon" class={getEndIconClass()}></span>
                <oj-menu id="menu1" slot="menu" onojAction={handleUserMenuAction}>
                  <oj-option id="pref" value="pref">Preferences (Coming Soon)</oj-option>
                  <oj-option id="help" value="help">Help</oj-option>
                  <oj-option id="about" value="about">About (Coming Soon)</oj-option>
                  <oj-option id="out" value="out">Sign Out</oj-option>
                </oj-menu>
              </oj-menu-button>
            </oj-toolbar>
          </div>
        </div>
      </header>
  );
}
