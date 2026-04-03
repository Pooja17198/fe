import { useEffect, useState } from "preact/hooks";
import { getBadLinksByBuilding } from "./badLinksApi";
import type { BadLinkDetail } from "./badLinksTypes";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Building-scoped network monitoring hook used by the Rack Validation page.
 *
 * Behavior:
 * - When feature flag is disabled (`isEnabled = false`), polling is fully skipped.
 * This feature flag is controlled in config/featureFlags
 * - On mount (and whenever "building" changes), performs an immediate request
 *   so the user sees current bad links without waiting for the polling interval.
 * - Sets up a 5-minute polling loop to surface newly appeared links.
 * - Returns the current list to display. The backend already filters to exactly what should be shown,
 *   so no client-side diffing is required here.
 *
 * Why AbortController:
 * - Cancels in-flight requests when the building changes or when the component unmounts
 *   (prevents race conditions and memory leaks).
 * - Ensures only the currently selected building can update the banner.
 *
 */
export function useBuildingBadLinks(
  building: string | undefined | null,
  region: string,
  isEnabled: boolean
): BadLinkDetail[] {
  const [badLinks, setBadLinks] = useState<BadLinkDetail[]>([]);

  useEffect(() => {
    if (!isEnabled || !building) {
      setBadLinks([]);
      return;
    }

    let mounted = true;
    const controller = new AbortController();

    const fetchBadLinks = async () => {
      try {
        const list = await getBadLinksByBuilding(building, region, controller.signal);
        if (!mounted) return;
        setBadLinks(Array.isArray(list) ? list : []);
      } catch (err) {
        // Ignore abort errors (expected during unmount/building switch), log everything else.
        if ((err as any)?.name !== "AbortError") {
          console.error("Failed to fetch bad links", err);
        }
      }
    };

    // Fetch immediately on page load/building change, then poll every 5 minutes.
    fetchBadLinks();
    const intervalId = window.setInterval(fetchBadLinks, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [building, region, isEnabled]);

  return badLinks;
}
