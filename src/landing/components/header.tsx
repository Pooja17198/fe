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
  vendorName: string
}>;

export function Header({ appName, userLogin, vendorName }: Props) {
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

  const logoutUrl = `/logout`;

  // TODO: Add a Home Button
  return (
    <header role="banner" class="oj-web-applayout-header">
      <div class="oj-web-applayout-max-width oj-flex-bar oj-sm-align-items-center">
        <div class="oj-flex-bar-middle oj-sm-align-items-baseline">
          <span
            role="img"
            class="oj-icon demo-oracle-icon"
            title="Oracle Logo"
            alt="Oracle Logo"></span>
          <h1
            class="oj-sm-only-hide oj-web-applayout-header-title"
            title="Application Name">
            {appName} Vendor Name: {vendorName}
          </h1>
        </div>
        <div class="oj-flex-bar-center-absolute">
        
        </div>
        <div class="oj-flex-bar-end">
        <oj-toolbar>
          <oj-menu-button id="userMenu" display={getDisplayType()} chroming="borderless">
            <span aria-label={userLogin}>{userLogin}</span>
            <span slot="endIcon" class={getEndIconClass()}></span>
            <oj-menu id="menu1" slot="menu">
              <oj-option id="pref" value="pref">Preferences (Coming Soon)</oj-option>
              <oj-option id="help" value="help">Help (Coming Soon)</oj-option>
              <oj-option id="about" value="about">About (Coming Soon)</oj-option>
              <oj-option id="out" value="out"><a href={logoutUrl}>Sign Out</a></oj-option>
            </oj-menu>
          </oj-menu-button>
        </oj-toolbar>
        {/* <oj-combobox-one
                value="PHX"
                label-hint="Region Picker (coming soon)"
                class="oj-form-control-max-width-md oj-form-control-max-width-sm demo-percentage-width">
                <oj-option value="Sea">PHX</oj-option>
                <oj-option value="Firefox">SEA</oj-option>
                <oj-option value="Chrome">SIN</oj-option>
              </oj-combobox-one> */}
        </div>
      </div>
    </header>
  );  
}
