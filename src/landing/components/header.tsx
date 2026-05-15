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
import "ojs/ojnavigationlist";
import { ojTabBar } from "ojs/ojnavigationlist"; // eslint-disable-line no-duplicate-imports
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");
import { getLvvApiBase } from "../config/api";

type Props = Readonly<{
  appName: string,
  userLogin: string,
  vendorName: string,
  regionValue?: string,
  page: string,
  onRegionChanged?: (region: string) => void
  onPageChanged: (value: any) => void;
}>;

export function Header({ appName, userLogin, vendorName, regionValue, page, onRegionChanged, onPageChanged }: Props) {
  const mediaQueryRef = useRef<MediaQueryList>(window.matchMedia(ResponsiveUtils.getFrameworkQuery("sm-only")!));

  const [isSmallWidth, setIsSmallWidth] = useState(mediaQueryRef.current.matches);

  const regionRef = useRef<HTMLInputElement | null>(null);

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
  const LVV_API = getLvvApiBase();

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
  const guideFiles = {
      helpPortalGuide: "lvv_portal_tutorial.pdf",
      helpValidationGuide: "lvv_validation_failure_resolution_guide.pptx"
    } as const;

  function openGuide(guideFileName: string) {
      const pdfUrl = `${window.location.origin}/landing/resources/${guideFileName}`;
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = guideFileName;
      link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }

  function handleUserMenuAction(e: any) {
    const detail = e?.detail || {};
    const actionValue = detail.value || detail.selectedValue || detail.key || detail?.option?.value;
    const targetId = (e?.target && e.target.id) || (e?.srcElement && e.srcElement.id);
    let resolved = actionValue;
    if (!resolved && typeof targetId === "string") {
      if (targetId.includes("out")) resolved = "out";
      else if (targetId.includes("helpPortalGuide")) resolved = "helpPortalGuide";
      else if (targetId.includes("helpValidationGuide")) resolved = "helpValidationGuide";
      else if (targetId.includes("home")) resolved = "home";
      else resolved = null;
    }

    if (resolved === "home") {
      window.location.assign("/");
      return;
    }
    else if (resolved === "helpPortalGuide") {
      openGuide(guideFiles.helpPortalGuide);
      return;
    }
    else if (resolved === "helpValidationGuide") {
      openGuide(guideFiles.helpValidationGuide);
      return;
    }
    else if (resolved === "out") {
      window.location.assign(logoutUrl);
    }
  }

  type Tab = {
    path: string;
    label: string;
  };

  const tabs: Tab[] = [
    { path: "cabling", label: "Cabling and Materials" },
    { path: "home", label: "Rack Validation" },
  ];
  const isCabling = Boolean(page?.includes("cabling"));
  const [activeTab, setActiveTab] = useState<string>(() => page === "cabling" ? tabs[0].path : tabs[1].path);

  const tabItemTemplate = (item: ojTabBar.ItemContext<Tab["path"], Tab>) => (
    <li>
      <a href="#">
        {item.data.label}
      </a>
    </li>
  );

  const loadTabContent = (event: ojTabBar.selectionChanged<Tab["path"], Tab>) => {
    if (event.detail.value === activeTab) {
      return;
    }
    if (page?.includes("rack") && event.detail.value === "home") {
      setActiveTab(tabs[1].path);
      return;
    }
    if (event.detail.value === "home") {
      onPageChanged({ path: "home" });
      setActiveTab(tabs[1].path);
    } else {
      onPageChanged({ path: "cabling"});
      setActiveTab(tabs[0].path)
    }
  }

  useEffect(() => {
    if (page === "cabling") {
      setActiveTab(tabs[0].path);
    } else {
      setActiveTab(tabs[1].path);
    }
  }, [page]);

  const tabbarDP = new MutableArrayDataProvider<Tab["path"], Tab>(
    tabs.slice(0),
    { keyAttributes: "path" }
  );

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
              // alt="Oracle Logo"
              >
          </span>
            <h1
                class="oj-sm-only-hide oj-web-applayout-header-title"
                title="Application Name">
              {appName} Vendor Name: {vendorName}
            </h1>
          </div>
        <oj-tab-bar
          class="lvv-tabbar oj-sm-margin-8x-end"
          edge="top"
          data={tabbarDP}
          selection={activeTab}
          onselectionChanged={loadTabContent}
        >
          <template slot="itemTemplate" render={tabItemTemplate}></template>
        </oj-tab-bar>
          <div class="oj-flex-bar-end">
            {regions.length > 0 && !isCabling &&(
                <oj-combobox-one
                    ref={regionRef}
                    value={regionValue}
                    placeholder="Select Region"
                    label-hint="Region"
                    onMouseDown={(e: any) => {
                      const host = regionRef.current as HTMLElement | null;
                      if (!host) return;

                      const input = host.querySelector(
                        'input.oj-combobox-input, input[type="text"]'
                      ) as HTMLInputElement | null;
                      if (!input) return;

                      if (input.value) {
                        try {
                          setTimeout(() => {input.setSelectionRange(0, input.value.length)}, 100);
                        } catch {}
                      }
                    }}
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
                  <oj-option id="home" value="home">Home</oj-option>
                  <oj-option id="helpPortalGuide" value="helpPortalGuide">Portal User Guide</oj-option>
                  <oj-option id="helpValidationGuide" value="helpValidationGuide">Validation Failures &amp; Resolutions</oj-option>
                  <oj-option id="out" value="out">Sign Out</oj-option>
                </oj-menu>
              </oj-menu-button>
            </oj-toolbar>
          </div>
        </div>
      </header>
  );
}
