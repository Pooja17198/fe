import { h } from "preact";
import { useState } from "preact/hooks";
import type { BadLinkDetail } from "./badLinksTypes";

type Props = {
  building: string;
  badLinks: BadLinkDetail[];
  initialShowDetails?: boolean;
};

/**
 * BadLinksBanner (Rack-scoped)
 * - Uses a semantic table with a numbered column and a single header row (Device | Remote device | Jira ticket).
 * - Presentational only: receives `building` and `badLinks` from the hook.
 * - Jira link: opens in new tab to the provided ticket.
 */
export function BadLinksBanner({ building, badLinks, initialShowDetails = false }: Props) {
  const [showDetails, setShowDetails] = useState<boolean>(initialShowDetails);
  if (!Array.isArray(badLinks) || badLinks.length === 0) return null;

  return (
    <div
      class="bad-links-banner"
      style="background-color:rgb(255,153,102);border:1px solid #ffd54f;color:#1A1A1A;padding:10px 14px;margin:8px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.08)"
      role="status"
      aria-live="polite"
    >
      <div class="badlinks-header" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;row-gap:6px;width:100%;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span aria-hidden="true" style="font-size:18px;">⚠️</span>
          <strong>Link down alerts in {building}</strong>
          <span style="margin-left:6px;font-weight:700;">( {badLinks.length} )</span>
        </div>
        <oj-c-button
          chroming="borderless"
          size="sm"
          label={showDetails ? "Hide details" : "View details"}
          onojAction={() => setShowDetails(v => !v)}
        ></oj-c-button>
      </div>

      {showDetails && (
        <div
          class="bad-links-details"
          style="margin-top:8px;background-color:#fffef6;border:1px solid #ffe082;border-radius:6px;padding:10px 12px;"
        >
          <div class="table-wrap" style="background:#FFFAF0;border:1px solid rgba(0,0,0,0.08);border-radius:6px;overflow-x:auto;overflow-y:auto;max-width:100%;max-height:360px;-webkit-overflow-scrolling:touch;">
            <table
              class="badlinks-table"
              style="width:100%;border-collapse:collapse;font-size:14px;"
            >
              <caption style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">
                Bad links for {building}
              </caption>
              <thead>
                <tr>
                  <th scope="col" style="width:2ch;text-align:right;color:#4A2C00;font-weight:700;background:rgba(255,255,255,0.6);padding:8px 10px;">#</th>
                  <th scope="col" style="text-align:left;color:#4A2C00;font-weight:700;background:rgba(255,255,255,0.6);padding:8px 10px;">Device</th>
                  <th scope="col" style="text-align:left;color:#4A2C00;font-weight:700;background:rgba(255,255,255,0.6);padding:8px 10px;">Remote Device</th>
                  <th scope="col" style="text-align:left;color:#4A2C00;font-weight:700;background:rgba(255,255,255,0.6);padding:8px 10px;">Jira</th>
                </tr>
              </thead>
              <tbody>
                {badLinks.map((item, idx) => (
                  <tr key={`${item.device}-${item.remoteDevice}-${item.jiraTicket ?? idx}`}>
                    <td style="width:2ch;text-align:right;color:#4A2C00;font-weight:600;padding:8px 10px;border-top:1px solid rgba(0,0,0,0.06);">
                      {idx + 1}
                    </td>
                    <td style="padding:8px 10px;border-top:1px solid rgba(0,0,0,0.06);white-space:nowrap;font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">
                      {item.device}
                    </td>
                    <td style="padding:8px 10px;border-top:1px solid rgba(0,0,0,0.06);white-space:nowrap;font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">
                      {item.remoteDevice}
                    </td>
                    <td style="padding:8px 10px;border-top:1px solid rgba(0,0,0,0.06);">
                      {item.jiraTicket ? (
                        <a
                          href={`https://jira-sd.mc1.oracleiaas.com/browse/${encodeURIComponent(item.jiraTicket)}`}
                          target="_blank"
                          rel="noopener"
                          style="color:#005A9E;font-weight:600;text-decoration:underline;"
                        >
                          {item.jiraTicket}
                        </a>
                      ) : (
                        <span style="opacity:0.7;">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style="font-size:12px;color:#4A2C00;opacity:0.8;margin-top:6px;">
            Tip: Scroll vertically to see more rows, or horizontally if columns overflow.
          </div>
        </div>
      )}
    </div>
  );
}