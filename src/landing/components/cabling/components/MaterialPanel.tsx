import { MaterialSummary } from "gen/clients/ide-lvv-client";

interface MaterialPanelProps {
  materials: MaterialSummary[] | undefined;
  loading: boolean;
}

export const MaterialPanel = ({ materials, loading }: MaterialPanelProps) => {
  return (
    <div className="material-panel">
      {loading ? null : !materials || materials?.length === 0 ? (
        <p className="oj-helper-text-align-center">No materials available</p>
      ) : (
        materials?.map((material: MaterialSummary) => {
          return (
            <div key={material.id} className="material-info">
              <div className="info-section">
                <h4>Material {material.id}</h4>
                <ul>
                  {Object.keys(material).map((key) => {
                    const value = material[key as keyof MaterialSummary] as any;
                    if (key === "id" || key === "catalog") return null; // Skip id and catalog for now
                    return (
                      <li key={key}>
                        <span className="info-key">{key}:</span>
                        <span className="info-value">
                          {typeof value === "object"
                            ? JSON.stringify(value)
                            : typeof value === "boolean"
                              ? value.toString()
                              : value}
                        </span>
                      </li>
                    )
                  })}
                  {material.catalog && (
                    <li>
                      <span className="info-key">Catalog:</span>
                      <ul>
                        {Object.keys(material.catalog).map(
                          (catalogKey: string) => (
                            <li key={catalogKey}>
                              <span className="info-key">{catalogKey}:</span>
                              <span className="info-value">
                                {
                                  /* @ts-ignore-next-line */
                                  `${material.catalog[catalogKey] || ""}`
                                }
                              </span>
                            </li>
                          )
                        )}
                      </ul>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
