declare global {
  interface Window {
    __LVV_API_BASE__?: string;
  }
}

const LOCAL_API_BASE = "http://localhost:21000/lvv";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getLvvApiBase(): string {
  const override = window.__LVV_API_BASE__;
  if (typeof override === "string" && override.trim() !== "") {
    return trimTrailingSlash(override.trim());
  }

  if (window.location.host.includes("localhost")) {
    return LOCAL_API_BASE;
  }

  return `https://${window.location.host}/lvv`;
}
