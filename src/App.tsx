import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Editor, { type ThemeParams } from "./components/Editor";
import FileTree, { Node } from "./components/FileTree";
import ImagePreview, { type PreviewTarget } from "./components/ImagePreview";
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
const extOf = (name: string) => /\.[^./\\]+$/.exec(name)?.[0] ?? "";
// 图片改名必须保住原扩展名：丢了 .png 就既不在树里显示、也无法预览。新名已带同一扩展名则不重复追加。
const keepExt = (name: string, orig: string) => {
  const e = extOf(orig);
  return e && !name.toLowerCase().endsWith(e.toLowerCase()) ? name + e : name;
};
const DEFAULT_PARAMS: ThemeParams = { font_family: "sans", font_size: 16, align: "left" };

interface SearchHit {
  name: string;
  path: string;
  line: number;
  snippet: string;
}

type DocEncoding = "utf8" | "utf8-bom" | "gbk";
interface DocStat {
  mtime_ms: number;
  len: number;
}
// save_doc 的返回：新基线 + 实际写入编码 + 是否因 GBK 不可映射字符提升为 UTF-8。
interface DocSaveResult extends DocStat {
  encoding: DocEncoding;
  promoted: boolean;
}
interface DocFile extends DocStat {
  content: string;
  encoding: DocEncoding;
}

export default function App() {
  const [booted, setBooted] = useState(false);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [tree, setTree] = useState<Node[]>([]);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [md, setMd] = useState("");
  // 磁盘基线：savedMd 是「已知落盘」的正文（派生脏标记），docStat/docEnc 供冲突检测与保真回写。
  const [savedMd, setSavedMd] = useState("");
  const [docStat, setDocStat] = useState<DocStat | null>(null);
  const [docEnc, setDocEnc] = useState<DocEncoding>("utf8");
  const [conflict, setConflict] = useState(false);
  // 重新载入同一路径时 Editor 的 key 不变、不会重挂载，靠 epoch 强制重建以丢弃旧视图。
  const [epoch, setEpoch] = useState(0);
  const [html, setHtml] = useState("");
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"name" | "content">("name");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 仅「检查更新」这类可中断的等待提供取消按钮；导出 PDF 不可中途取消。
  const [busyCancel, setBusyCancel] = useState<(() => void) | null>(null);
  const [lang, setLang] = useState<Lang>("zh");
  const [theme, setTheme] = useState("default");
  const [editorTheme, setEditorTheme] = useState<"light" | "dark" | "system">("light");
  // 「跟随系统」下 OS 的深浅色偏好；resolvedTheme 才是实际应用到界面/编辑器的深浅。
  const [sysDark, setSysDark] = useState(false);
  const resolvedTheme: "light" | "dark" = editorTheme === "system" ? (sysDark ? "dark" : "light") : editorTheme;
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
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  // 联动滚动：编辑器滚动容器（由 Editor 写入 CodeMirror 的 .cm-scroller）与预览滚动容器（.preview）。
  const editorScrollRef = useRef<HTMLElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const win = useMemo(() => getCurrentWindow(), []);
  const modal = useModal();
  const t = useCallback((k: string, vars?: Record<string, string | number>) => tr(lang, k, vars), [lang]);
  const wsRef = useRef<string[]>([]);
  wsRef.current = workspaces;
  const langRef = useRef(lang);
  langRef.current = lang;
  // 防抖窗口内尚未落盘的那一次自动保存。切换文档、重命名/删除当前文件、关窗前都必须先写掉，
  // 否则 effect 的 cleanup 会 clearTimeout，把最后 800ms 内的编辑静默丢弃。
  const pendingSave = useRef<{ path: string; content: string; encoding: DocEncoding; base: DocStat } | null>(null);
  // 串行化落盘：所有 flush 调用挂到一条 promise 链上严格排队，既不并发双写，
  // 也不因「正在保存」而静默放弃（调用方会等到轮到自己、拿到真实结果）。
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  // async 命令可并发返回：用递增序号丢弃慢的旧响应，避免乱序覆盖预览/文件树（同步时代天然有序）。
  const renderSeqRef = useRef(0);
  const treeSeqRef = useRef(0);
  // 关窗守卫要读最新的脏标记；用 ref 避免把 dirty 塞进监听 effect 的依赖里反复重注册。
  const dirtyRef = useRef(false);
  // 与 dirty 同步的最新草稿：CodeMirror 更新不经 React 事件系统，从 onChange 到下次 render
  // 之间若关窗，pendingSave 可能还没建立；close handler 用它兜底构造待写内容，避免丢稿。
  const draftRef = useRef<{ path: string; content: string; encoding: DocEncoding; base: DocStat } | null>(null);
  // 最新磁盘基线：保存成功时同步写入，供 saveNow 判定「外部改动」时避开自己刚完成的自动保存。
  const docStatRef = useRef<DocStat | null>(null);

  const showToast = (msg: string, error = false) => {
    setToast({ msg: msg, error });
    setTimeout(() => setToast(null), 2600);
  };

  // 落盘待写内容。写前比对磁盘基线：被外部改过则暂停（保留 pending + 冲突条），绝不静默覆盖。
  // force=true 表示用户已明确选择覆盖。返回 false 表示本次没写（冲突或出错）。
  // 关键：只有 save_doc 真正成功才清空 pendingSave；stat 冲突或写盘出错一律保留，
  // 否则关窗守卫看不到待写内容、会把用户的编辑静默丢掉。
  const flushSave = useCallback((force = false): Promise<boolean> => {
    // 挂到串行队列尾部：轮到自己时才读取当时的 pendingSave，天然避免并发双写与旧内容覆盖。
    const job = saveChainRef.current.then(async (): Promise<boolean> => {
      const p = pendingSave.current;
      if (!p) return true;
      try {
        if (!force) {
          const st = await invoke<DocStat>("stat_doc", { path: p.path });
          if (st.mtime_ms !== p.base.mtime_ms || st.len !== p.base.len) {
            setConflict(true);
            return false;
          }
        }
        const ns = await invoke<DocSaveResult>("save_doc", { path: p.path, content: p.content, encoding: p.encoding });
        const freshStat = { mtime_ms: ns.mtime_ms, len: ns.len };
        // 只清理由本 job 写入的那份快照：save_doc 在飞期间用户可能又打字（onDocChange 把
        // pendingSave 换成更新的 md_new），若无条件清空会抹掉新快照，随后关窗的 job 读到
        // 空 pending 直接返回 true -> 窗口销毁 -> md_new 静默丢失。快照已被替换则保留，
        // 让 autosave effect（savedMd=p.content、md=新内容 -> 脏）重新调度一次新基线的保存。
        if (pendingSave.current?.content === p.content && pendingSave.current?.path === p.path) {
          pendingSave.current = null;
        } else if (pendingSave.current?.path === p.path) {
          // 存活快照的基线刷新为本次落盘后的真实磁盘状态：否则下一个 job 的 stat_doc
          // 会把「自己刚写的 md_old」误判成外部改动、弹出无谓的冲突条。
          // 限定同路径，避免跨文档串基线；job A 之后的外部真实修改 stat 必然不同，仍会被检出。
          pendingSave.current = { ...pendingSave.current, base: freshStat };
        }
        docStatRef.current = freshStat;
        setSavedMd(p.content);
        setDocStat(freshStat);
        setDocEnc(ns.encoding);
        if (ns.promoted) showToast(tr(langRef.current, "encodedPromoted"));
        setConflict(false);
        return true;
      } catch (e) {
        // 出错也保留 pendingSave + 拉起冲突条，给用户「重新载入/覆盖保存」的恢复路径。
        setConflict(true);
        showToast(tr(langRef.current, "errSave", { e: String(e) }), true);
        return false;
      }
    });
    // 队列永不拒绝：即使本次 job 抛错也继续向后执行（错误已在 job 内消化）。
    saveChainRef.current = job.then(() => {}, () => {});
    return job;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const ctrl = new AbortController();
    let userCancelled = false;
    // 断网/被墙时 fetch 可能挂很久，忙碌遮罩会锁死整个界面：10 秒超时兜底 + 允许用户主动取消。
    const timer = setTimeout(() => ctrl.abort(), 10000);
    setBusy(t("updateChecking"));
    // 外层箭头是必需的：setState 会把函数参数当成 updater 立即执行。
    setBusyCancel(() => () => { userCancelled = true; ctrl.abort(); });
    try {
      const latest = await fetchLatest(ctrl.signal);
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
      if (!userCancelled) showToast(t("updateFail"), true);
    } finally {
      clearTimeout(timer);
      setBusy(null);
      setBusyCancel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, lang]);

  const refresh = useCallback(async (roots: string[]) => {
    const seq = ++treeSeqRef.current;
    if (roots.length === 0) {
      setTree([]);
      return;
    }
    try {
      const tr2 = await invoke<Node[]>("list_tree", { roots });
      // async 命令可并发：丢弃过期响应，避免慢的旧扫描覆盖新的文件树。
      if (seq !== treeSeqRef.current) return;
      setTree(tr2);
    } catch (e) {
      if (seq !== treeSeqRef.current) return;
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
        if (cfg.editor_theme === "dark" || cfg.editor_theme === "light" || cfg.editor_theme === "system") setEditorTheme(cfg.editor_theme);
        if (cfg.ui_font_family) setUiFont(cfg.ui_font_family);
        if (cfg.ui_font_size) setUiSize(cfg.ui_font_size);
        // wxDark 不再从配置独立恢复：改由 resolvedTheme 派生同步（见下方 effect），保证预览深浅随主界面。
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
    const seq = ++renderSeqRef.current;
    const id = setTimeout(() => {
      invoke<string>("render_markdown", { md, theme, params, spec: activeSpec })
        .then((res) => { if (seq === renderSeqRef.current) setHtml(res); })
        .catch(() => {});
    }, 150);
    return () => clearTimeout(id);
  }, [md, theme, params, activeSpec]);

  // 只在「确实脏了」时调度自动保存：打开文档不再产生一次冗余写盘。
  // 冲突期间不调度，等用户在冲突条上选择，避免每 800ms 空转一次 stat。
  useEffect(() => {
    if (!current || !docStat || conflict || md === savedMd) return;
    pendingSave.current = { path: current, content: md, encoding: docEnc, base: docStat };
    const id = setTimeout(() => { void flushSave(); }, 800);
    return () => clearTimeout(id);
  }, [md, current, savedMd, docStat, docEnc, conflict, flushSave]);

  // 关窗（标题栏 × 和 Alt+F4 都走 close-requested）前把待落盘的编辑写掉。
  // 一旦注册了 JS 监听，Rust 侧就会先 prevent_close，所以必须自己 destroy，否则窗口关不掉。
  // 冲突未解决时不 destroy：宁可留着窗口，也不能把未落盘的编辑关掉丢死。
  useEffect(() => {
    let un: (() => void) | undefined;
    let disposed = false;
    win.onCloseRequested(async (event) => {
      // dirty 也算：编辑刚发生、pending 尚未建立的极短窗口内也不能放行。
      if (!dirtyRef.current && !pendingSave.current) return;
      event.preventDefault();
      // 时间窗兜底：dirtyRef 已置位但 autosave effect 尚未把 pending 建立时，
      // 用与 dirty 同步的草稿快照构造 pendingSave，避免 flushSave 见空直接返回而丢稿。
      if (dirtyRef.current && !pendingSave.current && draftRef.current) {
        pendingSave.current = draftRef.current;
      }
      // flush 失败（冲突/写盘错误）时保持窗口不销毁，让用户用冲突条处理。
      if (!(await flushSave())) return;
      await win.destroy();
    })
      .then((f) => { if (disposed) f(); else un = f; })
      .catch(() => {});
    return () => { disposed = true; un?.(); };
  }, [win, flushSave]);

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

  // 「跟随系统」：监听 OS 深浅色偏好（WebView2 的 prefers-color-scheme 跟随系统），实时更新 sysDark。
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSysDark(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // 界面字体/字号/深色 → 应用到根元素，全局 chrome 生效（文章预览用 Rust 内联样式，不受影响）
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--ui-font", UI_FONT_STACK[uiFont] ?? UI_FONT_STACK.sans);
    root.style.setProperty("--ui-size", `${uiSize}px`);
    root.classList.toggle("dark", resolvedTheme === "dark");
  }, [uiFont, uiSize, resolvedTheme]);

  // 需求2：界面深浅切换（含「跟随系统」下 OS 变化）时，微信深色预览同步，使预览区随主界面深浅一致。
  useEffect(() => {
    setWxDark(resolvedTheme === "dark");
  }, [resolvedTheme]);

  const changeLang = (l: Lang) => { setLang(l); persist({ lang: l }); };
  const changeTheme = (id: string) => { setTheme(id); persist({ theme: id }); };
  const changeEditorTheme = (v: "light" | "dark" | "system") => { setEditorTheme(v); persist({ editorTheme: v }); };
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
    // 清理当前文档状态前先把待写内容落盘，失败则中止（保留窗口与冲突条供恢复）。
    if (!(await flushSave())) return;
    try {
      await invoke("remove_workspace", { path });
      const next = workspaces.filter((w) => w !== path);
      setWorkspaces(next);
      if (selectedDir === path) setSelectedDir(next[0] ?? null);
      if (current && current.startsWith(path)) {
        setCurrent(null);
        setMd("");
        setSavedMd("");
        setDocStat(null);
        docStatRef.current = null;
        setConflict(false);
      }
      await refresh(next);
    } catch (e) {
      showToast(t("errRemove", { e: String(e) }), true);
    }
  };

  const adopt = (path: string, d: DocFile) => {
    pendingSave.current = null;
    const st = { mtime_ms: d.mtime_ms, len: d.len };
    docStatRef.current = st;
    setCurrent(path);
    setMd(d.content);
    setSavedMd(d.content);
    setDocEnc(d.encoding);
    setDocStat(st);
    setConflict(false);
    // 统一在这里递增：Editor 的 key 是 `${path}#${epoch}`，重开当前文件也会重建并加载新内容。
    setEpoch((e) => e + 1);
  };

  const openDoc = async (n: Node) => {
    try {
      // 旧文档若处于冲突未决，flush 会返回 false：先让用户处理，不能把它的编辑切丢。
      if (!(await flushSave())) return;
      const d = await invoke<DocFile>("read_doc", { path: n.path });
      adopt(n.path, d);
    } catch (e) {
      showToast(t("errOpen", { e: String(e) }), true);
    }
  };

  const openFile = async () => {
    try {
      const path = await invoke<string | null>("pick_file");
      if (!path) return;
      if (!(await flushSave())) return;
      const d = await invoke<DocFile>("read_doc", { path });
      adopt(path, d);
    } catch (e) {
      showToast(t("errOpen", { e: String(e) }), true);
    }
  };

  // 冲突条「重新载入」：丢弃内存编辑、以磁盘为准（用户明确点击，非静默）。
  const reloadCurrent = async () => {
    if (!current) return;
    try {
      const d = await invoke<DocFile>("read_doc", { path: current });
      adopt(current, d); // adopt 已递增 epoch，避免双增导致重复重建
    } catch (e) {
      showToast(t("errOpen", { e: String(e) }), true);
    }
  };

  // 冲突后强制覆盖：先把 pendingSave 重置为「当前编辑器里的最新内容 + 最新基线」，
  // 否则 pending 还是冲突发生时的旧快照，会把冲突期间新打的字漏掉。
  const overwriteNow = async () => {
    if (!current || !docStat) return;
    pendingSave.current = { path: current, content: md, encoding: docEnc, base: docStat };
    if (await flushSave(true)) showToast(t("saved"));
  };

  const saveNow = async () => {
    if (!current || !docStat) return showToast(t("needWorkspace"), true);
    // 先把当前编辑器内容装进 pending，再走「带磁盘基线比对」的正常保存路径。
    // 绝不能像以前那样直接 force：外部刚改完文件、800ms 自动保存尚未触发的窗口里，
    // conflict 仍是 false，force 会静默覆盖外部修改，违反「绝不静默覆盖」的设计。
    pendingSave.current = { path: current, content: md, encoding: docEnc, base: docStat };
    if (await flushSave(false)) {
      showToast(t("saved"));
      return;
    }
    // 保存失败：用实时 stat_doc 与最新基线比对，区分「外部修改冲突」和「写盘出错」。
    // 用 docStatRef（保存成功会同步更新）而非闭包里的 docStat：若刚才有自动保存完成，
    // 用它可避免把「自己的写入」误判成外部冲突。也不读 conflict（异步后可能是旧值）。
    const base = docStatRef.current ?? docStat;
    let changedExternally = false;
    try {
      const st = await invoke<DocStat>("stat_doc", { path: current });
      changedExternally = st.mtime_ms !== base.mtime_ms || st.len !== base.len;
    } catch {
      // stat 失败不弹覆盖确认；错误 toast 已由 flushSave 给出。
    }
    if (!changedExternally) return;
    const go = await modal.confirm({
      title: t("conflictOverwrite"),
      message: t("conflictAsk"),
      okText: t("conflictOverwrite"),
      cancelText: t("cancel"),
      danger: true,
    });
    if (!go) return;
    await overwriteNow();
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
      await openDoc({ name, path, is_dir: false, is_image: false });
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
    // 文档沿用 ensureMd；图片保住原扩展名，不能被追加 .md（a.png → a.png.md 会同时废掉预览和文中引用）。
    const finalName = n.is_dir ? name : n.is_image ? keepExt(name, n.name) : ensureMd(name);
    const np = join(parent, finalName);
    try {
      // 先落盘再改名，否则待写回的旧路径会在改名后被重新创建出来。
      if (!(await flushSave())) return;
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
      // 先落盘再删：否则待写回的内容会在删除后把文件重新创建出来。
      if (!(await flushSave())) return;
      await invoke("delete_path", { path: n.path });
      if (current === n.path) {
        setCurrent(null);
        setMd("");
        setSavedMd("");
        setDocStat(null);
        docStatRef.current = null;
        setConflict(false);
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

  // 预览里的链接必须交给系统浏览器：不拦截的话 WebView2 会把整个应用窗口导航到该 URL，
  // 界面直接消失且没有后退入口（Tauri 未注册 on_navigation 时默认放行所有导航）。
  const onPreviewClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href");
    if (!href) return;
    invoke("open_external", { url: href }).catch((err) =>
      showToast(t("errOpenLink", { e: String(err) }), true)
    );
  };

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

  // 编辑器 ⇄ 预览联动滚动：以「最后被用户操作的面板」为主面板，按比例镜像滚动到另一侧，
  // 忽略非主面板的 scroll 事件（程序化滚动回波），避免反馈循环抖动。
  useEffect(() => {
    const ed = editorScrollRef.current;
    const pv = previewScrollRef.current;
    if (!ed || !pv) return;
    let master: "ed" | "pv" | null = null;
    const mirror = (src: HTMLElement, dst: HTMLElement) => {
      const sDen = src.scrollHeight - src.clientHeight;
      const dDen = dst.scrollHeight - dst.clientHeight;
      if (sDen <= 0 || dDen <= 0) return;
      dst.scrollTop = (src.scrollTop / sDen) * dDen;
    };
    const setEd = () => { master = "ed"; };
    const setPv = () => { master = "pv"; };
    const onEdScroll = () => { if (master === "ed") mirror(ed, pv); };
    const onPvScroll = () => { if (master === "pv") mirror(pv, ed); };
    ed.addEventListener("scroll", onEdScroll, { passive: true });
    pv.addEventListener("scroll", onPvScroll, { passive: true });
    const intents: [HTMLElement, () => void][] = [[ed, setEd], [pv, setPv]];
    for (const [el, m] of intents) {
      el.addEventListener("wheel", m, { passive: true });
      el.addEventListener("touchstart", m, { passive: true });
      el.addEventListener("pointerdown", m);
      el.addEventListener("keydown", m);
    }
    return () => {
      ed.removeEventListener("scroll", onEdScroll);
      pv.removeEventListener("scroll", onPvScroll);
      for (const [el, m] of intents) {
        el.removeEventListener("wheel", m);
        el.removeEventListener("touchstart", m);
        el.removeEventListener("pointerdown", m);
        el.removeEventListener("keydown", m);
      }
    };
  }, [current, previewCollapsed]);

  const dirty = current !== null && md !== savedMd;
  dirtyRef.current = dirty;
  // 每次渲染同步草稿快照（dirty 时才有意义）；close handler 经 ref 读取，不捕获旧 state。
  draftRef.current = dirty && current && docStat
    ? { path: current, content: md, encoding: docEnc, base: docStat }
    : null;

  // 同步兜底：CodeMirror 的更新不经 React 事件系统，从 onChange 到下次 render 更新 dirtyRef
  // 之间存在时间窗；用户此刻关窗会读到旧 dirtyRef=false 而放行、丢掉刚打的字。
  // onChange 里同步写 dirtyRef 与 pendingSave，配合 autosave effect 形成双保险。
  const onDocChange = (v: string) => {
    if (current && docStat) {
      dirtyRef.current = true;
      pendingSave.current = { path: current, content: v, encoding: docEnc, base: docStat };
    }
    setMd(v);
  };

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

        {conflict && (
          <div className="conflict-bar">
            <span>{t("conflictMsg")}</span>
            <button className="ghost" onClick={reloadCurrent}>{t("conflictReload")}</button>
            <button className="danger" onClick={() => void overwriteNow()}>{t("conflictOverwrite")}</button>
          </div>
        )}

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
                          onClick={() => openDoc({ name: h.name, path: h.path, is_dir: false, is_image: false })}
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
                    onPreview={(n) => setPreview({ name: n.name, path: n.path })}
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
            key={`${current ?? "untitled"}#${epoch}`}
            initial={md}
            lang={lang}
            appearance={resolvedTheme}
            params={params}
            onParams={changeParams}
            pickImage={pickImage}
            onChange={onDocChange}
            dirty={dirty}
            scrollElementRef={editorScrollRef}
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
              <div ref={previewScrollRef} className={"preview" + (wxDark ? " wx-dark" : "")}>
                <div className="pv-content" onClick={onPreviewClick} onAuxClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: previewHtml }} />
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

      {preview && <ImagePreview target={preview} lang={lang} onClose={() => setPreview(null)} />}
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
            {busyCancel && <button className="busy-cancel" onClick={busyCancel}>{t("cancel")}</button>}
          </div>
        </div>
      )}
      {toast && <div className={"toast" + (toast.error ? " error" : "")}>{toast.msg}</div>}
    </div>
  );
}
