import { useEffect, useState } from "react";
import Icon from "./Icon";
import { tr, type Lang } from "../i18n";

export interface Node {
  name: string;
  path: string;
  is_dir: boolean;
  children?: Node[];
}

interface Props {
  nodes: Node[];
  current: string | null;
  lang: Lang;
  depth?: number;
  roots?: Set<string>;
  onOpen: (n: Node) => void;
  onSelectDir: (path: string) => void;
  onRename: (n: Node) => void;
  onDelete: (n: Node) => void;
  onRemoveRoot?: (path: string) => void;
}

export default function FileTree({
  nodes,
  current,
  lang,
  depth = 0,
  roots,
  onOpen,
  onSelectDir,
  onRename,
  onDelete,
  onRemoveRoot,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(roots ? Array.from(roots) : []));

  useEffect(() => {
    if (!roots) return;
    setExpanded((s) => {
      let changed = false;
      const n = new Set(s);
      for (const r of roots) {
        if (!n.has(r)) {
          n.add(r);
          changed = true;
        }
      }
      return changed ? n : s;
    });
  }, [roots]);

  const toggle = (p: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  return (
    <div className="tree">
      {nodes.map((n) => {
        const isRoot = !!roots && roots.has(n.path);
        return (
          <div key={n.path}>
            <div
              className={"row" + (current === n.path ? " active" : "") + (isRoot ? " root" : "")}
              style={{ paddingLeft: depth * 12 + 8 }}
              onClick={() => {
                if (n.is_dir) {
                  toggle(n.path);
                  onSelectDir(n.path);
                } else {
                  onOpen(n);
                }
              }}
            >
              <span className="caret">
                {n.is_dir ? (
                  <Icon name={expanded.has(n.path) ? "chevronDown" : "chevronRight"} size={12} />
                ) : null}
              </span>
              <span className="ticon">
                <Icon name={n.is_dir ? "folder" : "file"} size={14} />
              </span>
              <span className="name" title={n.path}>{n.name}</span>
              <span className="actions">
                {isRoot ? (
                  <button
                    title={tr(lang, "removeRoot")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveRoot?.(n.path);
                    }}
                  >
                    <Icon name="minusCircle" size={13} />
                  </button>
                ) : (
                  <>
                    <button title={tr(lang, "rename")} onClick={(e) => { e.stopPropagation(); onRename(n); }}>
                      <Icon name="pencil" size={13} />
                    </button>
                    <button title={tr(lang, "remove")} onClick={(e) => { e.stopPropagation(); onDelete(n); }}>
                      <Icon name="trash" size={13} />
                    </button>
                  </>
                )}
              </span>
            </div>
            {n.is_dir && expanded.has(n.path) && n.children && (
              <FileTree
                nodes={n.children}
                current={current}
                lang={lang}
                depth={depth + 1}
                roots={roots}
                onOpen={onOpen}
                onSelectDir={onSelectDir}
                onRename={onRename}
                onDelete={onDelete}
                onRemoveRoot={onRemoveRoot}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
