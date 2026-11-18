import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Icon from "./Icon";
import { tr, type Lang } from "../i18n";

export interface PreviewTarget {
  name: string;
  path: string;
}

// 同一张图本次会话只读一次盘。
const urlCache = new Map<string, string>();

/**
 * 本地图片的大图预览层（纯离线：Rust 读字节回 data URL）。
 * 入口只有文档树里的图片节点，因此不再有独立的图片列表面板。
 */
export default function ImagePreview({
  target,
  lang,
  onClose,
}: {
  target: PreviewTarget;
  lang: Lang;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<string | null>(() => urlCache.get(target.path) ?? null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const hit = urlCache.get(target.path);
    if (hit) {
      setSrc(hit);
      return;
    }
    let alive = true;
    invoke<string>("read_image", { path: target.path })
      .then((u) => {
        if (!alive) return;
        urlCache.set(target.path, u);
        setSrc(u);
      })
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [target.path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="img-mask" onClick={onClose}>
      <div className="img-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="img-viewer-head">
          <span className="img-viewer-title">{target.name}</span>
          <button className="icon-btn" title={tr(lang, "close")} onClick={onClose}>
            <Icon name="minusCircle" size={15} />
          </button>
        </div>
        <div className="img-body">
          {src ? <img src={src} alt={target.name} /> : <div className="img-viewer-note">{err ?? "…"}</div>}
        </div>
        <div className="img-viewer-foot">{target.path}</div>
      </div>
    </div>
  );
}
