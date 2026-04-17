// import ArrayDataProvider from "ojs/ojarraydataprovider";
// import {
//   INTERFACE_FAILURE_COLUMNS,
//   LLDP_FAILURE_COLUMNS,
//   OPTIC_FAILURE_COLUMNS,
// } from "../../rack/columns";
// import { getSectionColumns } from "../../rack/DeviceAccordion";
// import {
//   booleanStatusTemplate,
//   currentBLocationTemplate,
//   deviceALocationTemplate,
//   errorMessageClampTemplate,
//   expectedBLocationTemplate,
//   gpuLldpErrorDetailsTemplate,
//   gpuMultilineErrorMessageTemplate,
//   lldpStatusTemplate,
//   patchPanelMatrixTemplate,
//   rxPowerTemplate,
//   sourceDeviceLocationTemplate,
// } from "../../rack/templates";

// interface ValidationErrorInCablingProps {
//   lldpErrors: string[] | undefined;
//   opticErrors: string[] | undefined;
//   interfaceErrors: string[] | undefined;}

// export const ValidationErrorInCabling = ({lldpErrors, opticErrors, interfaceErrors}: ValidationErrorInCablingProps) => {

// function parseKeyValueErrorString(raw: string): Record<string, string> {
//   const text = raw.trim();
//   const withoutBraces =
//     text.startsWith("{") && text.endsWith("}")
//       ? text.slice(1, -1)
//       : text;

//   const result: Record<string, string> = {};
//   // Split on ", " at top level – safe for current mock format
//   const parts = withoutBraces.split(/,\s*/);

//   for (const part of parts) {
//     const eqIndex = part.indexOf("=");
//     if (eqIndex === -1) continue;
//     const key = part.slice(0, eqIndex).trim();
//     const value = part.slice(eqIndex + 1).trim();
//     result[key] = value;
//   }
//   return result;
// }

//   const TEST_SECTIONS: any[] = [
//     {
//       id: "interfaces",
//       title: "Interface Errors",
//       columns: INTERFACE_FAILURE_COLUMNS,
//     },
//     { id: "lldp", title: "LLDP Errors", columns: LLDP_FAILURE_COLUMNS },
//     { id: "optics", title: "Optic Errors", columns: OPTIC_FAILURE_COLUMNS },
//   ];

//   return (
//     <oj-accordion multiple={true}>
//       {TEST_SECTIONS.map((section) => {
//         let sectionRows: any[] = [] ;
//         if (section.id === "interfaces") {
//           sectionRows = interfaceErrors?.map((error, index) => ({
//             ...parseKeyValueErrorString(error),
//             _key: `interface-${index}`,
//           })) || [];
//         } else if (section.id === "lldp") {
//           sectionRows = lldpErrors?.map((error, index) => ({
//             ...parseKeyValueErrorString(error),
//             _key: `lldp-${index}`,
//           })) || [];
//         } else if (section.id === "optics") {
//           sectionRows = opticErrors?.map((error, index) => ({
//             ...parseKeyValueErrorString(error),
//             _key: `optic-${index}`,
//           })) || [];
//         }
//         const sectionDataProvider = new ArrayDataProvider(sectionRows, {
//           keyAttributes: "_key",
//         });

//         return (
//           <oj-collapsible
//             id={`device--${section.id}`}
//             key={`${section.id}`}
//             expanded={false}
//           >
//             <h4 slot="header" className="test-section-header">
//               <span>{section.title}</span>
//               <span className="test-section-count">{sectionRows.length}</span>
//             </h4>
//             <div className="oj-flex">
//               <div className="oj-flex-item rack-panel table-wrapper-full">
//                 <oj-table
//                   class="selectable-table table-full"
//                   display="grid"
//                   horizontal-grid-visible="enabled"
//                   layout="contents"
//                   vertical-grid-visible="enabled"
//                   aria-label={`${section.title} Action Items`}
//                   id={`ValidationFailureItemsTable-${section.id}`}
//                   scroll-policy="loadMoreOnScroll"
//                   scroll-policy-options='{"fetchSize": 10}'
//                   columns={section.columns}
//                   data={sectionDataProvider}
//                 >
//                   <template
//                     slot="lldpStatusTemplate"
//                     render={lldpStatusTemplate}
//                   />
//                   <template
//                     slot="booleanStatusTemplate"
//                     render={booleanStatusTemplate}
//                   />
//                   <template slot="rxPowerTemplate" render={rxPowerTemplate} />
//                   <template
//                     slot="deviceALocationTemplate"
//                     render={deviceALocationTemplate}
//                   />
//                   <template
//                     slot="currentBLocationTemplate"
//                     render={currentBLocationTemplate}
//                   />
//                   <template
//                     slot="expectedBLocationTemplate"
//                     render={expectedBLocationTemplate}
//                   />
//                   <template
//                     slot="sourceDeviceLocationTemplate"
//                     render={sourceDeviceLocationTemplate}
//                   />
//                   <template
//                     slot="gpuLldpErrorDetailsTemplate"
//                     render={gpuLldpErrorDetailsTemplate}
//                   />
//                   <template
//                     slot="gpuMultilineErrorMessageTemplate"
//                     render={gpuMultilineErrorMessageTemplate}
//                   />
//                   <template
//                     slot="errorMessageClampTemplate"
//                     render={errorMessageClampTemplate}
//                   />
//                 </oj-table>
//               </div>
//             </div>
//           </oj-collapsible>
//         );
//       })}
//     </oj-accordion>
//   );
// };
