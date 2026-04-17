/**
 * ValidationErrorsTab
 * Uses oj-table to show mocked Jira tickets.
 */

import "ojs/ojtable";
import "ojs/ojbufferingdataprovider";
import "oj-c/button";
import { useMemo, useState } from "preact/hooks";
import MutableArrayDataProvider = require("ojs/ojmutablearraydataprovider");

type EasyMark = {
  host: { rack: string; device: string; port: string };
  switch: { rack: string; device: string; elevation: string; port: string };
  mac: string;
};

type JiraTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  rack: string;
  block: string;
  actualEasyMark?: EasyMark;
  expectedEasyMark?: EasyMark;
};

type ColumnDef = {
  headerText: string;
  field: keyof JiraTicket;
  id: string;
  template?: string;
};

export interface ValidationErrorsTabProps {
  // Called when a rack cell is clicked
  onRackClick?: (rack: string, hostPort?: string) => void;
}

export const ValidationErrorsTab = ({
  onRackClick,
}: ValidationErrorsTabProps) => {
  // Mock Jira tickets in the component itself
  const [tickets] = useState<JiraTicket[]>([
    {
      id: "1",
      ticketNumber: "LVV-101",
      title: "Mismatch between design and installed cable",
      rack: "9127",
      block: "1",
      expectedEasyMark: {
        host: {
          rack: "9127",
          device: "phx23-q2-p3-t0-r86",
          port: "swp10s1",
        },
        switch: {
          rack: "0706",
          device: "phx23-q2-p4-t0-r26",
          elevation: "7",
          port: "swp9s2",
        },
        mac: "90:e3:17:ce:d0:25",
      },
      actualEasyMark: {
        host: {
          rack: "9127",
          device: "phx23-q2-p3-t0-r86",
          port: "swp10s0",
        },
        switch: {
          rack: "0706",
          device: "phx23-q2-p4-t0-r26",
          elevation: "7",
          port: "swp9s0",
        },
        mac: "90:e3:17:bc:95:a3",
      },
    },
    {
      id: "2",
      ticketNumber: "LVV-102",
      title: "Invalid patch panel port mapping",
      rack: "9126",
      block: "1",
      expectedEasyMark: {
        host: {
          rack: "9126",
          device: "phx23-q2-p2-t0-r88",
          port: "swp63s1",
        },
        switch: {
          rack: "0706",
          device: "phx23-q2-p4-t0-r26",
          elevation: "7",
          port: "swp9s2",
        },
        mac: "90:e3:17:ce:d0:25",
      },
      actualEasyMark: {
        host: {
          rack: "9126",
          device: "phx23-q2-p2-t0-r88",
          port: "swp63s0",
        },
        switch: {
          rack: "0706",
          device: "phx23-q2-p4-t0-r26",
          elevation: "7",
          port: "swp9s0",
        },
        mac: "90:e3:17:bc:95:a3",
      },
    },
  ]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTicket, setDialogTicket] = useState<JiraTicket | null>(null);

  const dataProvider = useMemo(
    () =>
      new MutableArrayDataProvider<JiraTicket["id"], JiraTicket>(tickets, {
        keyAttributes: "id",
      }),
    [tickets],
  );

  const columns: ColumnDef[] = [
    {
      id: "ticketNumber",
      headerText: "Jira Ticket",
      field: "ticketNumber",
      template: "ticketNumberTemplate",
    },
    {
      id: "title",
      headerText: "Title",
      field: "title",
      template: "titleTemplate",
    },
    {
      id: "rack",
      headerText: "Rack",
      field: "rack",
      template: "rackTemplate",
    },
    {
      id: "block",
      headerText: "Block",
      field: "block",
      template: "blockTemplate",
    },
  ];

  const renderTextCell = (field: keyof JiraTicket) => (context: any) => {
    const row: JiraTicket = context.item.data;
    return <span>{row[field]}</span>;
  };

  const ticketNumberTemplate = renderTextCell("ticketNumber");
  const blockTemplate = renderTextCell("block");

  // Title cell: show title and a button to open EasyMark dialog
  const titleTemplate = (context: any) => {
    const row: JiraTicket = context.item.data as JiraTicket;

    const handleOpenDialog = (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      setDialogTicket(row);
      setDialogOpen(true);
    };

    return (
      <div className="validation-title-cell">
        <span className="validation-title-text">{row.title}</span>
        <oj-c-button
          chroming="borderless"
          display="all"
          size='xs'
          onojAction={(e) => {handleOpenDialog(e)}}
          label="Compare actual/expected"
        >
        </oj-c-button>
      </div>
    );
  };

  // Rack cell: clickable, uses expectedEasyMark.host
  const rackTemplate = (context: any) => {
    const row: JiraTicket = context.item.data;
    const rack = row.rack;
    const hostPort = row.expectedEasyMark?.host?.port as string | undefined;

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onRackClick && rack) {
        onRackClick(rack, hostPort);
      }
    };

    return (
      <button
        type="button"
        className="oj-button-link rack-cell-link"
        onClick={handleClick}
      >
        {rack}
      </button>
    );
  };

  const handleResolve = () => {
    // placeholder for resolve action (e.g., call API then close)
    setDialogOpen(false);
  };

  const handleCancel = () => {
    setDialogOpen(false);
  };

  const actual = dialogTicket?.actualEasyMark;
  const expected = dialogTicket?.expectedEasyMark;

  return (
    <div className="validation-errors-panel">
      {tickets.length === 0 ? (
        <p className="oj-helper-text-align-center">
          No validation errors available
        </p>
      ) : (
        <>
          <oj-table
            class="selectable-table table-full"
            display="grid"
            horizontal-grid-visible="enabled"
            layout="contents"
            vertical-grid-visible="enabled"
            aria-label="Validation Errors"
            id="ValidationErrorsTable"
            scroll-policy="loadMoreOnScroll"
            scroll-policy-options='{"fetchSize": 10}'
            columns={columns.map((c) => ({
              headerText: c.headerText,
              field: c.field,
              id: c.id,
              template: c.template,
            }))}
            data={dataProvider}
          >
            <template
              slot="ticketNumberTemplate"
              render={ticketNumberTemplate}
            />
            <template slot="titleTemplate" render={titleTemplate} />
            <template slot="rackTemplate" render={rackTemplate} />
            <template slot="blockTemplate" render={blockTemplate} />
          </oj-table>
        </>
      )}
      <oj-c-dialog
        id="easymarkCompareDialog"
        opened={dialogOpen}
        aria-describedby="easymarkCompareBody"
        dialog-title={
          dialogTicket
            ? `EasyMark Comparison - ${dialogTicket.ticketNumber}`
            : "EasyMark Comparison"
        }
      >
        <div
          slot="body"
          id="easymarkCompareBody"
          class="oj-sm-padding-4x validation-easymark-dialog-body"
        >
          <div className="validation-easymark-columns">
            <div className="validation-easymark-column">
              <h5>Actual EasyMark</h5>
              {actual ? (
                <div className="easymark-section">
                  <div>
                    <b>Host</b>
                    <div>Rack: {actual.host.rack}</div>
                    <div>Device: {actual.host.device}</div>
                    <div>Port: {actual.host.port}</div>
                  </div>
                  <div className="oj-sm-margin-2x-top">
                    <b>Switch</b>
                    <div>Rack: {actual.switch.rack}</div>
                    <div>Device: {actual.switch.device}</div>
                    <div>Elevation: {actual.switch.elevation}</div>
                    <div>Port: {actual.switch.port}</div>
                  </div>
                  <div className="oj-sm-margin-2x-top">
                    <b>MAC</b>
                    <div>{actual.mac}</div>
                  </div>
                </div>
              ) : (
                <div>No actual EasyMark data</div>
              )}
            </div>

            <div className="validation-easymark-column">
              <h5>Expected EasyMark</h5>
              {expected ? (
                <div className="easymark-section">
                  <div>
                    <b>Host</b>
                    <div>Rack: {expected.host.rack}</div>
                    <div>Device: {expected.host.device}</div>
                    <div>Port: {expected.host.port}</div>
                  </div>
                  <div className="oj-sm-margin-2x-top">
                    <b>Switch</b>
                    <div>Rack: {expected.switch.rack}</div>
                    <div>Device: {expected.switch.device}</div>
                    <div>Elevation: {expected.switch.elevation}</div>
                    <div>Port: {expected.switch.port}</div>
                  </div>
                  <div className="oj-sm-margin-2x-top">
                    <b>MAC</b>
                    <div>{expected.mac}</div>
                  </div>
                </div>
              ) : (
                <div>No expected EasyMark data</div>
              )}
            </div>
          </div>
        </div>

        <div
          slot="footer"
          class="oj-sm-padding-2x oj-sm-flex oj-sm-justify-content-flex-end"
        >
          <oj-c-button
            chroming="solid"
            onojAction={handleResolve}
            class="oj-sm-margin-2x-end"
            label="Resolve"
          >
          </oj-c-button>
          <oj-c-button chroming="borderless" onojAction={handleCancel} label="Cancel">
            
          </oj-c-button>
        </div>
      </oj-c-dialog>
    </div>
  );
};

export default ValidationErrorsTab;
