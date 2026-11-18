import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Icon from "./Icon";
import { tr, type Lang } from "../i18n";

interface DocImage {
  no: number;
  src: string;
  path: string;
  name: string;
  exists: boolean;
  size: number;
}
interface WorkspaceImage {
  name: string;
  path: string;
  size: number;
}
interface ViewerTarget {
  title: string;
  path: string;
  key: string;
}

interface Props {
  docPath: string | null;
  md: string;
  roots: string[];
  lang: Lang;
}

// data URL 缓存。键含 size：图片被替换（大小变化）后会重新读取，同一文件不重复读盘。
const urlCache = new Map<string, string>();
const errCache = new Map<string, string>();

const cacheKey = (path: string, size: number) => path + "|" + size;

function fmtSize(n: number): string {
  if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
  if (n >= 1024) return Math.round(n / 1024) + " KB";
  return n + " B";
}

function loadImage(key: string, path: string): Promise<string> {
  const hit = urlCache.get(key);
  if (hit) return Promise.resolve(hit);
  const bad = errCache.get(key);
  if (bad) return Promise.reject(bad);
  return invoke<string>("read_image", { path })
    .then((u) => {
      urlCache.set(key, u);
      return u;
    })
    .catch((e) => {
      const m = String(e);
      errCache.set(key, m);
      return Promise.reject(m);
    });
}

// 缩略图：滚到可见才读盘。工作区图片可达数百张，一次性灌 base64 会拖垮侧栏。
function Thumb({ path, size, exists }: { path: string; size: number; exists: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const key = cacheKey(path, size);
  const [src, setSrc] = useState<string | null>(() => urlCache.get(key) ?? null);

  useEffect(() => {
    if (!exists || src) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      loadImage(key, path).then(setSrc).catch(() => {});
    });
    io.observe(el);
    return () => io.disconnect();
  }, [exists, src, key, path]);

  return (
    <span ref={ref} className="img-thumb">
      {src ? <img src={src} alt="" /> : <Icon name={exists ? "image" : "info"} size={14} />}
    </span>
  );
}

function Viewer({ target, lang, onClose }: { target: ViewerTarget; lang: Lang; onClose: () => void }) {
  const t = useCallback((k: string) => tr(lang, k), [lang]);
  const [src, setSrc] = useState<string | null>(() => urlCache.get(target.key) ?? null);
  const [err, setErr] = useState<string | null>(() => errCache.get(target.key) ?? null);

  useEffect(() => {
    if (src || err) return;
    let alive = true;
    loadImage(target.key, target.path)
      .then((u) => alive && setSrc(u))
      .catch((e) => alive && setErr(e));
    return () => {
      alive = false;
    };
  }, [target, src, err]);

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
          <span className="img-viewer-title">{target.title}</span>
          <button className="icon-btn" title={t("close")} onClick={onClose}>
            <Icon name="minusCircle" size={15} />
          </button>
        </div>
        <div className="img-body">
          {src ? <img src={src} alt={target.title} /> : <div className="img-viewer-note">{err ?? "…"}</div>}
        </div>
        <div className="img-viewer-foot">{target.path}</div>
      </div>
    </div>
  );
}

export default function ImagePanel({ docPath, md, roots, lang }: Props) {
  const t = useCallback(
    (k: string, vars?: Record<string, string | number>) => tr(lang, k, vars),
    [lang]
  );
  const [docImgs, setDocImgs] = useState<DocImage[]>([]);
  const [wsImgs, setWsImgs] = useState<WorkspaceImage[]>([]);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);

  // 文中图片：与预览同节奏防抖。编号由 Rust 用同一套解析选项产出，始终对齐占位块。
  useEffect(() => {
    if (!docPath) {
      setDocImgs([]);
      return;
    }
    const id = setTimeout(() => {
      invoke<DocImage[]>("list_doc_images", { md, docPath })
        .then(setDocImgs)
        .catch(() => setDocImgs([]));
    }, 150);
    return () => clearTimeout(id);
  }, [md, docPath]);

  // 工作区图片：挂载即取一次，之后随文件系统事件防抖刷新。
  useEffect(() => {
    const pull = () => {
      if (!roots.length) {
        setWsImgs([]);
        return;
      }
      invoke<WorkspaceImage[]>("list_workspace_images", { roots })
        .then(setWsImgs)
        .catch(() => setWsImgs([]));
    };
    pull();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let un: (() => void) | undefined;
    listen("fs-changed", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(pull, 400);
    })
      .then((f) => {
        un = f;
      })
      .catch(() => {});
    return () => {
      if (timer) clearTimeout(timer);
      un?.();
    };
  }, [roots]);

  const open = (title: string, path: string, size: number) =>
    setViewer({ title, path, key: cacheKey(path, size) });

  return (
    <div className="img-panel">
      <section className="img-group">
        <div className="img-group-head">
          <Icon name="file" size={12} />
          <span>{t("imgInDoc")}</span>
          {!!docImgs.length && <span className="img-count">{t("imgCount", { n: docImgs.length })}</span>}
        </div>
        {!docPath && <div className="img-empty">{t("imgNeedSaved")}</div>}
        {!!docPath && !docImgs.length && <div className="img-empty">{t("imgEmptyDoc")}</div>}
        {docImgs.map((d) => (
          <button
            key={d.no}
            className={"img-row" + (d.exists ? "" : " off")}
            title={d.path}
            disabled={!d.exists}
            onClick={() => open("#" + d.no + " " + d.name, d.path, d.size)}
          >
            <Thumb path={d.path} size={d.size} exists={d.exists} />
            <span className="img-meta">
              <span className="img-name">{d.name}</span>
              <span className="img-sub">
                <span className="img-no">{d.no}</span>
                <span className={d.exists ? "" : "warn"}>{d.exists ? fmtSize(d.size) : t("imgMissing")}</span>
              </span>
            </span>
          </button>
        ))}
      </section>

      <section className="img-group">
        <div className="img-group-head">
          <Icon name="folder" size={12} />
          <span>{t("imgInWorkspace")}</span>
          {!!wsImgs.length && <span className="img-count">{t("imgCount", { n: wsImgs.length })}</span>}
        </div>
        {!roots.length && <div className="img-empty">{t("noWorkspace")}</div>}
        {!!roots.length && !wsImgs.length && <div className="img-empty">{t("imgEmptyWorkspace")}</div>}
        {wsImgs.map((w) => (
          <button key={w.path} className="img-row" title={w.path} onClick={() => open(w.name, w.path, w.size)}>
            <Thumb path={w.path} size={w.size} exists />
            <span className="img-meta">
              <span className="img-name">{w.name}</span>
              <span className="img-sub">
                <span>{fmtSize(w.size)}</span>
              </span>
            </span>
          </button>
        ))}
      </section>

      {viewer && <Viewer target={viewer} lang={lang} onClose={() => setViewer(null)} />}
    </div>
  );
}
