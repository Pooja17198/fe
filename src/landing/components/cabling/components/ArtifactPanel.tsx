import "ojs/ojtreeview";
import { useEffect, useState } from "preact/hooks";
import ArrayTreeDataProvider = require("ojs/ojarraytreedataprovider");
import { KeySetImpl } from "ojs/ojkeyset";

import { useDownloadArtifact } from "../api/hooks/artifactsApi";
import { FileMetadata } from "gen/clients/ide-lvv-client";

type ArtifactTreeNode = {
  id: string;
  label: string;
  createdAt?: string | Date; // only set on leaf nodes
  children?: ArtifactTreeNode[];
  filePath?: string;
};

type InternalNode = {
  label: string;
  artifact?: FileMetadata;
  children: Map<string, InternalNode>;
};

interface ArtifactPanelProps {
  artifacts: FileMetadata[] | undefined;
  roomName: string | undefined;
  loading: boolean;
}

function buildArtifactTree(
  artifacts: FileMetadata[] | undefined,
): ArtifactTreeNode[] {
  if (!artifacts?.length) return [];

  const root = new Map<string, InternalNode>();

  const addPath = (artifact: FileMetadata) => {
    const filePath = artifact.name;
    if (!filePath) return;

    const parts = filePath.split("/").filter(Boolean);
    if (parts.length <= 1) return; // need room + at least one segment

    // drop room name
    const segments = parts.slice(1);

    let currentLevel = root;

    segments.forEach((segment, index) => {
      const isLeaf = index === segments.length - 1;

      let node = currentLevel.get(segment);
      if (!node) {
        node = { label: segment, children: new Map() };
        currentLevel.set(segment, node);
      }

      if (isLeaf) {
        node.artifact = artifact;
      } else {
        currentLevel = node.children;
      }
    });
  };

  artifacts.forEach(addPath);

  const toTreeNodes = (
    level: Map<string, InternalNode>,
    prefix: string[] = [],
  ): ArtifactTreeNode[] =>
    Array.from(level.entries()).map(([label, internalNode]) => {
      const pathParts = [...prefix, label];
      const id = pathParts.join("/");
      const children = toTreeNodes(internalNode.children, pathParts);
      const filePath = internalNode.artifact?.name;

      return {
        id,
        label,
        createdAt: internalNode.artifact?.createdAt,
        children: children.length ? children : undefined,
        filePath,
      };
    });

  return toTreeNodes(root);
}

function formatCreatedAt(value: string | Date | undefined): string {
  if (!value) return "";
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function isFolderNode(node: ArtifactTreeNode): boolean {
  return Array.isArray(node.children) && node.children.length > 0;
}

export const ArtifactPanel = ({ artifacts, roomName, loading }: ArtifactPanelProps) => {
  const treeData: ArtifactTreeNode[] = buildArtifactTree(artifacts);

  const dataProvider = new ArrayTreeDataProvider<
    ArtifactTreeNode["id"],
    ArtifactTreeNode
  >(treeData, {
    keyAttributes: "id",
    childrenAttribute: "children",
  });

  const [expanded, setExpanded] = useState<KeySetImpl<string>>(
    () => new KeySetImpl<string>([]),
  );

  const onSuccess = () => {
    if (downloadLink.par) {
      window.open(downloadLink.par, "_blank", "noopener,noreferrer");
    }
  };

  const {
    data: downloadLink,
    isFetching: downloadLinkLoading,
    refetch: refetchDownloadLink,
  } = useDownloadArtifact(false, onSuccess);

  const handleExpandedChanged = (event: any) => {
    setExpanded(event.detail.value as KeySetImpl<string>);
  };

  const handleRowClick = (node: ArtifactTreeNode) => {
    if (isFolderNode(node)) return;
    if (!roomName) return;
    if (!node.filePath) return;
    refetchDownloadLink(roomName, node.filePath);
  };

  const createElement = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    textContent?: string,
  ): HTMLElementTagNameMap[K] => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent != null) el.textContent = textContent;
    return el;
  };

  const getIconClass = (isFolder: boolean, isExpanded: boolean): string => {
    if (!isFolder) return "oj-ux-ico-file";
    return isExpanded ? "oj-ux-ico-folder-open" : "oj-ux-ico-folder";
  };

  const renderItem = (context: any) => {
    const node = context.data as ArtifactTreeNode;
    const key = context.key as string;

    const isFolder = isFolderNode(node);
    const isExpanded = isFolder && expanded.has(key);
    const iconClass = `${getIconClass(isFolder, !!isExpanded)} artifact-icon`;

    const row = createElement("div", "artifact-row");

    const nameCol = createElement("div", "col-name");
    const nameContainer = createElement("span");

    const icon = createElement("span", iconClass);
    const label = createElement("span", undefined, node.label);

    nameContainer.appendChild(icon);
    nameContainer.appendChild(label);
    nameCol.appendChild(nameContainer);

    const createdCol = createElement(
      "div",
      "col-created",
      isFolder ? "" : formatCreatedAt(node.createdAt),
    );

    row.appendChild(nameCol);
    row.appendChild(createdCol);

    if (!isFolder) {
      row.classList.add("artifact-row--clickable");
      row.addEventListener("click", () => handleRowClick(node));
    }

    return { insert: row };
  };

  return (
    <div className="artifact-panel">
      {!loading && treeData.length === 0 && (
        <p className="oj-helper-text-align-center">No artifacts available</p>
      )}
      {treeData.length > 0 && (
        <>
          <div className="artifact-header">
            <div className="col-name">Name</div>
            <div className="col-created">Created At</div>
          </div>

          <oj-tree-view
            id="artifactsTree"
            aria-label="Artifacts tree"
            selection-mode="single"
            data={dataProvider}
            expanded={expanded}
            onexpandedChanged={handleExpandedChanged}
            selected={new KeySetImpl([])}
            item={{ renderer: renderItem }}
          />
        </>
      )}
      <oj-c-dialog
        opened={downloadLinkLoading}
        id="downloadDialogLoading"
        aria-describedby="desc"
      >
        <div slot="body" class="oj-helper-text-align-center">
          <oj-c-progress-circle
            aria-labelledby="lgLabel indetLabel"
            size="lg"
            value={-1}
          ></oj-c-progress-circle>
          <h4 class="oj-md-padding-5x-vertical">Loading download link...</h4>
        </div>
      </oj-c-dialog>
    </div>
  );
};

export default ArtifactPanel;
