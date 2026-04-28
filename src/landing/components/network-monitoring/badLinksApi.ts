/**
 * Network Monitoring API utilities
 * - Centralizes all fetch calls related to network monitoring.
 * - Used by:
 *    - useBuildingBadLinks (Rack page-only polling bound to current building)
 *    - BadLinksBanner (Rack page banner UI)
 */
import { getLvvApiBase } from "../../config/api";
import type { BadLinkDetail } from "./badLinksTypes";

const API_URL = getLvvApiBase();

/**
 * Fetch bad links for a specific building.
 *
 * Params:
 *  - building: current building shown in the Rack Validation view
 *
 * Notes:
 *  - Backend already filters to exactly what should be displayed (no client-side diffing).
 */
export async function getBadLinksByBuilding(
  building: string,
  region: string,
  signal?: AbortSignal
): Promise<BadLinkDetail[]> {
  const url = new URL(`${API_URL}/badLinks`);
  url.searchParams.set("regionName", region);
  url.searchParams.set("buildingName", building);

  // Keep fetch options minimal; same-origin cookies are sent by default (credentials: "same-origin")
  // and backend returns JSON without needing an explicit Accept header.
  const res = await fetch(url.href, { signal });

  if (!res.ok) {
    throw new Error(`Failed to fetch bad links: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (Array.isArray(data)) return data as BadLinkDetail[];
  if (data && Array.isArray((data as any).items)) return (data as any).items as BadLinkDetail[];
  return [];
}
