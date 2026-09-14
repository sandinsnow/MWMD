import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Editor, { type ThemeParams } from "./components/Editor";
import FileTree, { Node } from "./components/FileTree";
import MenuBar, { type ThemeMeta } from "./components/MenuBar";
import HelpModal from "./components/HelpModal";
import ThemeEditor, { type CustomTheme, type ThemeDraft, type ThemeSpec } from "./components/ThemeEditor";
import Icon from "./components/Icon";
import { useModal } from "./components/Modal";
import { tr, langFromLocale, type Lang } from "./i18n";
import { toWxDark } from "./wxDark";
import { compareVersions, fetchLatest, RELEASES_PAGE } from "./update";
import appIconUrl from "./app-icon.svg";

const UI_FONT_STACK: Record<string, string> = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  serif: "Georgia, 'Times New Roman', 'Songti SC', 'SimSun', serif",
  mono: "Consolas, 'Cascadia Mono', 'Courier New', monospace",
};

function filterTree(nodes: Node[], q: string): Node[] {
  if (!q) return nodes;
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.is_dir) {
      const kids = filterTree(n.children ?? [], q);
      if (kids.length > 0 || n.name.toLowerCase().includes(q)) {
        out.push({ ...n, children: kids.length ? kids : n.children });
      }
    } else if (n.name.toLowerCase().includes(q)) {
      out.push(n);
    }
  }
  return out;
}

const join = (dir: string, name: string) => dir.replace(/[/\\]+$/, "") + "\\" + name;
const ensureMd = (name: string) => (name.toLowerCase().endsWith(".md") ? name : name + ".md");
const DEFAULT_PARAMS: ThemeParams = { font_family: "sans", font_size: 16, align: "left" };

interface SearchHit {
  name: string;
  path: string;
  line: number;
  snippet: string;
}

export default function App() {
  const [booted, setBooted] = useState(false);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [tree, setTree] = useState<Node[]>([]);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [md, setMd] = useState("");
  const [html, setHtml] = useState("");
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"name" | "content">("name");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("zh");
  const [theme, setTheme] = useState("default");
  const [editorTheme, setEditorTheme] = useState<"light" | "dark">("light");
  const [wxDark, setWxDark] = useState(false);
  const [params, setParams] = useState<ThemeParams>(DEFAULT_PARAMS);
  const [themes, setThemes] = useState<ThemeMeta[]>([]);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [draft, setDraft] = useState<ThemeDraft | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [uiFont, setUiFont] = useState("sans");
  const [uiSize, setUiSize] = useState(13);
  const [version, setVersion] = useState("");
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const win = getCurrentWindow();
  const modal = useModal();
  const t = useCallback((k: string, vars?: Record<string, string | number>) => tr(lang, k, vars), [lang]);
  const wsRef = useRef<string[]>([]);
  wsRef.current = workspaces;

  const showToast = (msg: string, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 2600);
  };

  const persist = (over: Partial<{ lang: Lang; theme: string; editorTheme: string; uiFont: string; uiSize: number; wxDark: boolean; params: ThemeParams; customThemes: CustomTheme[] }>) => {
    const nextLang = over.lang ?? lang;
    invoke("save_prefs", {
      prefs: {
        locale: nextLang === "zh" ? "zh-CN" : "en-US",
        theme: over.theme ?? theme,
        editor_theme: over.editorTheme ?? editorTheme,
        ui_font_family: over.uiFont ?? uiFont,
        ui_font_size: over.uiSize ?? uiSize,
        wx_dark: over.wxDark ?? wxDark,
        params: over.params ?? params,
        custom_themes: over.customThemes ?? customThemes,
      },
    }).catch(() => {});
  };

  const checkUpdate = useCallback(async () => {
    setBusy(t("updateChecking"));
    try {
      const latest = await fetchLatest();
      setBusy(null);
      if (!latest.version) throw new Error("malformed latest.json");
      if (compareVersions(latest.version, version) > 0) {
        const go = await modal.confirm({
          title: t("updateTitle"),
          message: t("updateFound", { v: latest.version, cur: version || "?", url: RELEASES_PAGE }),
          okText: t("updateOpen"),
          cancelText: t("cancel"),
        });
        if (go) invoke("open_external", { url: RELEASES_PAGE }).catch(() => {});
      } else {
        showToast(t("updateLatest", { v: version || latest.version }));
      }
    } catch {
      setBusy(null);
      showToast(t("updateFail"), true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, lang]);

  const refresh = useCallback(async (roots: string[]) => {
    if (roots.length === 0) {
      setTree([]);
      return;
    }
    try {
      const tr2 = await invoke<Node[]>("list_tree", { roots });
      setTree(tr2);
    } catch (e) {
      showToast(tr(lang, "errListTree", { e: String(e) }), true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, th] = await Promise.all([
          invoke<{
            workspaces?: string[];
            workspace?: string | null;
            locale?: string | null;
            theme?: string | null;
            editor_theme?: string | null;
            ui_font_family?: string | null;
            ui_font_size?: number | null;
            wx_dark?: boolean | null;
            params?: Partial<ThemeParams>;
            custom_themes?: CustomTheme[];
          }>("get_config"),
          invoke<ThemeMeta[]>("list_themes"),
        ]);
        setThemes(th);
        if (Array.isArray(cfg.custom_themes)) setCustomThemes(cfg.custom_themes);
        setLang(langFromLocale(cfg.locale));
        if (cfg.theme) setTheme(cfg.theme);
        if (cfg.editor_theme === "dark" || cfg.editor_theme === "light") setEditorTheme(cfg.editor_theme);
        if (cfg.ui_font_family) setUiFont(cfg.ui_font_family);
        if (cfg.ui_font_size) setUiSize(cfg.ui_font_size);
        // 从未持久化过则默认跟随界面外观（保留 v1.3「深色界面→深色预览」的直觉）；此后完全独立。
        if (typeof cfg.wx_dark === "boolean") setWxDark(cfg.wx_dark);
        else setWxDark(cfg.editor_theme === "dark");
        if (cfg.params) setParams({ ...DEFAULT_PARAMS, ...cfg.params });
        getVersion().then(setVersion).catch(() => {});
        let roots = Array.isArray(cfg.workspaces) ? cfg.workspaces : [];
        if (roots.length === 0 && cfg.workspace) roots = [cfg.workspace];
        setWorkspaces(roots);
        if (roots.length) setSelectedDir(roots[0]);
        await refresh(roots);
      } finally {
        setBooted(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当前生效的自定义规格：编辑器草稿优先，其次所选自定义主题；预设主题为 null。
  const activeSpec = useMemo<ThemeSpec | null>(() => {
    if (draft) return draft.spec;
    if (theme.startsWith("custom:")) {
      const id = theme.slice("custom:".length);
      return customThemes.find((c) => c.id === id)?.spec ?? null;
    }
    return null;
  }, [draft, theme, customThemes]);

  useEffect(() => {
    const id = setTimeout(() => {
      invoke<string>("render_markdown", { md, theme, params, spec: activeSpec }).then(setHtml).catch(() => {});
    }, 150);
    return () => clearTimeout(id);
  }, [md, theme, params, activeSpec]);

  useEffect(() => {
    if (!current) return;
    const id = setTimeout(() => {
      invoke("save_doc", { path: current, content: md }).catch((e) =>
        showToast(tr(lang, "errSave", { e: String(e) }), true)
      );
    }, 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md, current, lang]);

  // 工作区变化时重建目录监听
  useEffect(() => {
    invoke("watch_workspaces", { roots: workspaces }).catch(() => {});
  }, [workspaces]);

  // 外部改动（拖放/新建/删除）→ 防抖刷新树
  useEffect(() => {
    let un: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    listen("fs-changed", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refresh(wsRef.current), 400);
    })
      .then((f) => { un = f; })
      .catch(() => {});
    return () => {
      if (timer) clearTimeout(timer);
      un?.();
    };
  }, [refresh]);

  // 界面字体/字号/深色 → 应用到根元素，全局 chrome 生效（文章预览用 Rust 内联样式，不受影响）
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--ui-font", UI_FONT_STACK[uiFont] ?? UI_FONT_STACK.sans);
    root.style.setProperty("--ui-size", `${uiSize}px`);
    root.classList.toggle("dark", editorTheme === "dark");
  }, [uiFont, uiSize, editorTheme]);

  const changeLang = (l: Lang) => { setLang(l); persist({ lang: l }); };
  const changeTheme = (id: string) => { setTheme(id); persist({ theme: id }); };
  const changeEditorTheme = (v: "light" | "dark") => { setEditorTheme(v); persist({ editorTheme: v }); };
  const toggleWxDark = () => { const v = !wxDark; setWxDark(v); persist({ wxDark: v }); };
  const changeUiFont = (v: string) => { setUiFont(v); persist({ uiFont: v }); };
  const changeUiSize = (v: number) => { setUiSize(v); persist({ uiSize: v }); };
  const changeParams = (patch: Partial<ThemeParams>) => {
    const next = { ...params, ...patch };
    setParams(next);
    persist({ params: next });
  };

  const CUSTOM_PREFIX = "custom:";

  const openThemeEditor = async () => {
    if (theme.startsWith(CUSTOM_PREFIX)) {
      const c = customThemes.find((x) => x.id === theme.slice(CUSTOM_PREFIX.length));
      if (c) {
        setDraft({ id: c.id, nameZh: c.name_zh, nameEn: c.name_en, spec: { ...c.spec } });
        return;
      }
    }
    try {
      const spec = await invoke<ThemeSpec>("get_preset_spec", { id: theme });
      setDraft({ id: null, nameZh: "", nameEn: "", spec });
    } catch { /* 预设载入失败则不打开编辑器 */ }
  };

  const patchDraftSpec = (patch: Partial<ThemeSpec>) =>
    setDraft((d) => (d ? { ...d, spec: { ...d.spec, ...patch } } : d));
  const patchDraftMeta = (patch: Partial<Pick<ThemeDraft, "nameZh" | "nameEn">>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const loadBasePreset = async (presetId: string) => {
    try {
      const spec = await invoke<ThemeSpec>("get_preset_spec", { id: presetId });
      setDraft((d) => (d ? { ...d, spec } : d));
    } catch { /* ignore */ }
  };

  const saveDraft = (asNew: boolean) => {
    if (!draft) return;
    const fallback = lang === "zh" ? "自定义主题" : "Custom theme";
    const nameZh = draft.nameZh.trim() || fallback;
    const nameEn = draft.nameEn.trim() || nameZh;
    const id = asNew || !draft.id ? "ct" + Date.now().toString(36) : draft.id;
    const next = asNew || !draft.id
      ? [...customThemes, { id, name_zh: nameZh, name_en: nameEn, spec: draft.spec }]
      : customThemes.map((c) => (c.id === draft.id ? { ...c, name_zh: nameZh, name_en: nameEn, spec: draft.spec } : c));
    const sel = CUSTOM_PREFIX + id;
    setCustomThemes(next);
    setDraft(null);
    setTheme(sel);
    persist({ customThemes: next, theme: sel });
  };

  const deleteDraft = () => {
    if (!draft?.id) return;
    const id = draft.id;
    const next = customThemes.filter((c) => c.id !== id);
    setCustomThemes(next);
    setDraft(null);
    if (theme === CUSTOM_PREFIX + id) {
      setTheme("default");
      persist({ customThemes: next, theme: "default" });
    } else {
      persist({ customThemes: next });
    }
  };

  const baseDir = () => selectedDir ?? workspaces[0] ?? null;

  const addWorkspace = async () => {
    try {
      const p = await invoke<string | null>("add_workspace");
      if (!p) return;
      setWorkspaces((ws) => {
        const next = ws.includes(p) ? ws : [...ws, p];
        refresh(next);
        return next;
      });
      setSelectedDir(p);
    } catch (e) {
      showToast(t("errAddWs", { e: String(e) }), true);
    }
  };

  const removeRoot = async (path: string) => {
    const ok = await modal.confirm({
      title: t("removeRootTitle"),
      message: t("removeRootMsg", { path }),
      okText: t("removeBtn"),
      cancelText: t("cancel"),
      danger: true,
    });
    if (!ok) return;
    try {
      await invoke("remove_workspace", { path });
      const next = workspaces.filter((w) => w !== path);
      setWorkspaces(next);
      if (selectedDir === path) setSelectedDir(next[0] ?? null);
      if (current && current.startsWith(path)) {
        setCurrent(null);
        setMd("");
      }
      await refresh(next);
    } catch (e) {
      showToast(t("errRemove", { e: String(e) }), true);
    }
  };

  const openDoc = async (n: Node) => {
    try {
      const content = await invoke<string>("read_doc", { path: n.path });
      setCurrent(n.path);
      setMd(content);
    } catch (e) {
      showToast(t("errOpen", { e: String(e) }), true);
    }
  };

  const openFile = async () => {
    try {
      const path = await invoke<string | null>("pick_file");
      if (!path) return;
      const content = await invoke<string>("read_doc", { path });
      setCurrent(path);
      setMd(content);
    } catch (e) {
      showToast(t("errOpen", { e: String(e) }), true);
    }
  };

  const saveNow = async () => {
    if (!current) return showToast(t("needWorkspace"), true);
    try {
      await invoke("save_doc", { path: current, content: md });
      showToast(t("saved"));
    } catch (e) {
      showToast(t("errSave", { e: String(e) }), true);
    }
  };

  const newFile = async () => {
    const base = baseDir();
    if (!base) return showToast(t("needWorkspace"), true);
    const name = await modal.prompt({ title: t("newFile"), label: t("newFileLabel"), okText: t("create"), cancelText: t("cancel") });
    if (!name) return;
    const path = join(base, ensureMd(name));
    try {
      await invoke("create_doc", { path });
      await refresh(workspaces);
      await openDoc({ name, path, is_dir: false });
      showToast(t("created", { name }));
    } catch (e) {
      showToast(t("errCreateFile", { e: String(e) }), true);
    }
  };

  const newFolder = async () => {
    const base = baseDir();
    if (!base) return showToast(t("needWorkspace"), true);
    const name = await modal.prompt({ title: t("newFolder"), label: t("newFolderLabel"), okText: t("create"), cancelText: t("cancel") });
    if (!name) return;
    try {
      await invoke("create_dir", { path: join(base, name) });
      await refresh(workspaces);
      showToast(t("createdFolder", { name }));
    } catch (e) {
      showToast(t("errCreateFolder", { e: String(e) }), true);
    }
  };

  const rename = async (n: Node) => {
    const name = await modal.prompt({ title: t("renameTitle"), initial: n.name, okText: t("ok"), cancelText: t("cancel") });
    if (!name || name === n.name) return;
    const parent = n.path.replace(/[\\/][^\\/]+$/, "");
    const finalName = n.is_dir ? name : ensureMd(name);
    const np = join(parent, finalName);
    try {
      await invoke("rename_path", { old: n.path, new: np });
      if (current === n.path) setCurrent(np);
      await refresh(workspaces);
      showToast(t("renamed", { name: finalName }));
    } catch (e) {
      showToast(t("errRename", { e: String(e) }), true);
    }
  };

  const del = async (n: Node) => {
    const ok = await modal.confirm({
      title: t("deleteTitle"),
      message: t("deleteMsg", { name: n.name }),
      okText: t("remove"),
      cancelText: t("cancel"),
      danger: true,
    });
    if (!ok) return;
    try {
      await invoke("delete_path", { path: n.path });
      if (current === n.path) {
        setCurrent(null);
        setMd("");
      }
      await refresh(workspaces);
      showToast(t("deleted", { name: n.name }));
    } catch (e) {
      showToast(t("errDelete", { e: String(e) }), true);
    }
  };

  const copy = async () => {
    try {
      await invoke("copy_html", { md, theme, params, spec: activeSpec });
      showToast(t("copied"));
    } catch (e) {
      showToast(t("errCopy", { e: String(e) }), true);
    }
  };

  const docTitle = () => {
    if (!current) return "document";
    const base = current.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "document";
    return base.replace(/\.(md|markdown)$/i, "");
  };

  const exportHtml = async () => {
    if (!md.trim()) return showToast(t("needWorkspace"), true);
    setBusy(t("exporting"));
    try {
      const path = await invoke<string | null>("export_html", {
        md,
        theme,
        params,
        spec: activeSpec,
        title: docTitle(),
        suggested: docTitle() + ".html",
      });
      if (path) showToast(t("exportedHtml", { path }));
    } catch (e) {
      showToast(t("errExport", { e: String(e) }), true);
    } finally {
      setBusy(null);
    }
  };

  const exportPdf = async () => {
    if (!md.trim()) return showToast(t("needWorkspace"), true);
    setBusy(t("exporting"));
    try {
      const path = await invoke<string | null>("export_pdf", {
        md,
        theme,
        params,
        spec: activeSpec,
        title: docTitle(),
        suggested: docTitle() + ".pdf",
      });
      if (path) showToast(t("exportedPdf", { path }));
    } catch (e) {
      showToast(t("errExport", { e: String(e) }), true);
    } finally {
      setBusy(null);
    }
  };

  const pickImage = useCallback(async () => {
    try {
      return await invoke<string | null>("pick_image");
    } catch {
      return null;
    }
  }, []);

  const shown = useMemo(() => filterTree(tree, query.trim().toLowerCase()), [tree, query]);
  const rootSet = useMemo(() => new Set(workspaces), [workspaces]);
  // 微信深色预览：仅对预览 HTML 做颜色重映射；复制/导出在 Rust 侧从 md 重新渲染，绝不受影响。
  const previewHtml = useMemo(() => (wxDark ? toWxDark(html) : html), [html, wxDark]);

  // 内容级全文检索：仅在「内容」模式且有关键词时防抖触发，遍历工作区所有 .md。
  useEffect(() => {
    const q = query.trim();
    if (searchMode !== "content" || !q || workspaces.length === 0) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const id = setTimeout(() => {
      invoke<SearchHit[]>("search_content", { roots: workspaces, query: q })
        .then((res) => { if (!cancelled) setHits(res); })
        .catch(() => { if (!cancelled) setHits([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [searchMode, query, workspaces]);

  return (
    <div className="app">
      <header className="titlebar">
        <div className="tb-brand" data-tauri-drag-region onDoubleClick={() => win.toggleMaximize()}>
          <img className="appicon" src={appIconUrl} width={22} height={22} alt="MWMD" draggable={false} />
        </div>

        <MenuBar
          lang={lang}
          themes={themes}
          theme={theme}
          editorTheme={editorTheme}
          uiFont={uiFont}
          uiSize={uiSize}
          onNewFile={newFile}
          onNewFolder={newFolder}
          onOpenFile={openFile}
          onOpenFolder={addWorkspace}
          onSave={saveNow}
          onCopy={copy}
          onExportHtml={exportHtml}
          onExportPdf={exportPdf}
          onTheme={changeTheme}
          onThemeEditor={openThemeEditor}
          customThemes={customThemes}
          onEditorTheme={changeEditorTheme}
          onUiFont={changeUiFont}
          onUiSize={changeUiSize}
          onLang={changeLang}
          onHelp={() => setHelpOpen(true)}
          onCheckUpdate={checkUpdate}
          onAbout={() => setAboutOpen(true)}
        />

        <div className="drag" data-tauri-drag-region onDoubleClick={() => win.toggleMaximize()} />
        <div className="tools">
          <button className="primary copy-btn" onClick={copy}>
            <Icon name="copy" size={14} />
            <span>{t("copy")}</span>
          </button>
        </div>
        <div className="winbtns">
          <button title={t("minimize")} onClick={() => win.minimize()}><Icon name="winMin" size={14} /></button>
          <button title={t("maximize")} onClick={() => win.toggleMaximize()}><Icon name="winMax" size={13} /></button>
          <button className="winclose" title={t("close")} onClick={() => win.close()}><Icon name="winClose" size={14} /></button>
        </div>
      </header>

      <main className="body">
        {sideCollapsed ? (
          <div
            className="rail rail-left"
            title={t("expandSidebar")}
            onClick={() => setSideCollapsed(false)}
          >
            <Icon name="chevronRight" size={16} />
          </div>
        ) : (
          <aside className="sidebar">
            <div className="side-head">
              <div className="search-box">
                <Icon name="search" size={13} />
                <input
                  placeholder={searchMode === "content" ? t("searchContentPlaceholder") : t("searchPlaceholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button className="icon-btn" title={t("newFile")} onClick={newFile}><Icon name="filePlus" size={15} /></button>
              <button className="icon-btn" title={t("newFolder")} onClick={newFolder}><Icon name="folderPlus" size={15} /></button>
              <button className="icon-btn" title={t("collapseSidebar")} onClick={() => setSideCollapsed(true)}><Icon name="chevronLeft" size={15} /></button>
            </div>
            <div className="search-modes">
              <button
                className={"seg" + (searchMode === "name" ? " on" : "")}
                onClick={() => setSearchMode("name")}
              >{t("searchModeName")}</button>
              <button
                className={"seg" + (searchMode === "content" ? " on" : "")}
                onClick={() => setSearchMode("content")}
              >{t("searchModeContent")}</button>
              {searchMode === "content" && query.trim() && (
                <span className="search-count">
                  {searching ? "…" : t("searchHits", { n: hits.length })}
                </span>
              )}
            </div>
            <div className="side-tree">
              {searchMode === "content" ? (
                query.trim() ? (
                  hits.length ? (
                    <div className="hits">
                      {hits.map((h) => (
                        <button
                          key={h.path + ":" + h.line}
                          className={"hit" + (current === h.path ? " active" : "")}
                          onClick={() => openDoc({ name: h.name, path: h.path, is_dir: false })}
                          title={h.path}
                        >
                          <span className="hit-head">
                            <Icon name="file" size={12} />
                            <span className="hit-name">{h.name}</span>
                            <span className="hit-line">{t("searchLine", { n: h.line })}</span>
                          </span>
                          <span className="hit-snippet">{h.snippet}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    !searching && <div className="hits-empty">{t("searchNoResult")}</div>
                  )
                ) : null
              ) : (
                workspaces.length > 0 && (
                  <FileTree
                    nodes={shown}
                    current={current}
                    lang={lang}
                    roots={rootSet}
                    onOpen={openDoc}
                    onSelectDir={setSelectedDir}
                    onRename={rename}
                    onDelete={del}
                    onRemoveRoot={removeRoot}
                  />
                )
              )}
            </div>
            <div className="side-foot">
              <span className="ws" title={workspaces.join("\n")}>
                {workspaces.length ? t("workspaceCount", { n: workspaces.length }) : t("noWorkspace")}
              </span>
              <button className="icon-btn" title={t("add")} onClick={addWorkspace}>
                <Icon name="plus" size={14} /><span>{t("add")}</span>
              </button>
            </div>
          </aside>
        )}

        <section className="split">
          <Editor
            key={current ?? "untitled"}
            initial={md}
            lang={lang}
            appearance={editorTheme}
            params={params}
            onParams={changeParams}
            pickImage={pickImage}
            onChange={setMd}
          />
          {previewCollapsed ? (
            <div
              className="rail rail-right"
              title={t("expandPreview")}
              onClick={() => setPreviewCollapsed(false)}
            >
              <Icon name="chevronLeft" size={16} />
            </div>
          ) : (
            <div className="preview-wrap">
              <div className="pane-head">
                <span>{t("panePreview")}</span>
                <button
                  className={"icon-btn wx-dark-btn" + (wxDark ? " on" : "")}
                  title={wxDark ? t("wxDarkOn") : t("wxDarkOff")}
                  onClick={toggleWxDark}
                >
                  <Icon name={wxDark ? "sun" : "moon"} size={14} />
                  <span>{t("wxDarkPreview")}</span>
                </button>
                <button className="icon-btn" title={t("collapsePreview")} onClick={() => setPreviewCollapsed(true)}>
                  <Icon name="chevronRight" size={15} />
                </button>
              </div>
              <div className={"preview" + (wxDark ? " wx-dark" : "")}>
                <div className="pv-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          )}
        </section>
      </main>

      {booted && workspaces.length === 0 && (
        <div className="modal-mask">
          <div className="modal">
            <h2>{t("onboardTitle")}</h2>
            <p>{t("onboardBody")}</p>
            <button className="primary" onClick={addWorkspace}>{t("chooseFolder")}</button>
          </div>
        </div>
      )}

      {aboutOpen && (
        <div className="modal-mask" onMouseDown={() => setAboutOpen(false)}>
          <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
            <h2>{t("aboutTitle")}</h2>
            <p className="modal-label">{t("aboutBody")}</p>
            {version && <p className="modal-label">{t("versionLabel")} {version}</p>}
            <div className="modal-actions">
              <button className="primary" onClick={() => setAboutOpen(false)}>{t("ok")}</button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && <HelpModal lang={lang} onClose={() => setHelpOpen(false)} />}
      {draft && (
        <ThemeEditor
          lang={lang}
          presets={themes}
          draft={draft}
          onSpec={patchDraftSpec}
          onMeta={patchDraftMeta}
          onBase={loadBasePreset}
          onSave={() => saveDraft(false)}
          onSaveAsNew={() => saveDraft(true)}
          onDelete={deleteDraft}
          onClose={() => setDraft(null)}
        />
      )}

      {modal.element}
      {busy && (
        <div className="busy-mask">
          <div className="busy-box">
            <div className="busy-bar"><span /></div>
            <div className="busy-label">{busy}</div>
          </div>
        </div>
      )}
      {toast && <div className={"toast" + (toast.error ? " error" : "")}>{toast.msg}</div>}
    </div>
  );
}
