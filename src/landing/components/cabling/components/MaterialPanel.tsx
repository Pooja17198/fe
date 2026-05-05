import { MaterialSummary } from "gen/clients/ide-lvv-client";

interface MaterialPanelProps {
  materials: MaterialSummary[] | undefined;
  loading: boolean;
  headerText: string;
}

export const MaterialPanel = ({
  materials,
  loading,
  headerText,
}: MaterialPanelProps) => {
  return (
    <div className="material-panel">
      {loading ? null : !materials || materials?.length === 0 ? (
        <p className="oj-helper-text-align-center">
          No materials available for {headerText}
        </p>
      ) : (
        <>
          <h5 className="rack-detail-header">
            Matrials for {headerText}
          </h5>

          {materials?.map((material: MaterialSummary, index: number) => {
            return (
              <div key={material.id} className="material-info">
                <div className="info-section">
                  <h6>Material {index + 1}</h6>
                  <ul>
                    {material.count && (
                      <li key="count">
                        <span className="info-key">count:</span>
                        <span className="info-value">{material.count}</span>
                      </li>
                    )}{" "}
                    {material.catalog && (
                      <li>
                        <span className="info-key">Catalog:</span>
                        <ul>
                          {Object.keys(material.catalog).map(
                            (catalogKey: string) => (
                              <li key={catalogKey}>
                                <span className="info-key oj-sm-margin-2x-start">
                                  {catalogKey}:
                                </span>
                                <span className="info-value oj-sm-margin-2x-start">
                                  {
                                    /* @ts-ignore-next-line */
                                    `${material.catalog[catalogKey] || ""}`
                                  }
                                </span>
                              </li>
                            ),
                          )}
                        </ul>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
