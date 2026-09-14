import { useEffect, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import Icon, { type IconName } from "./Icon";
import { tr, type Lang } from "../i18n";

export interface ThemeParams {
  font_family: string;
  font_size: number;
  align: string;
}

interface Props {
  initial: string;
  lang: Lang;
  appearance: "light" | "dark";
  params: ThemeParams;
  onParams: (patch: Partial<ThemeParams>) => void;
  pickImage: () => Promise<string | null>;
  onChange: (v: string) => void;
}

const wrapSel = (v: EditorView, before: string, after: string, placeholder: string) => {
  const { from, to } = v.state.selection.main;
  const sel = v.state.sliceDoc(from, to) || placeholder;
  v.dispatch({
    changes: { from, to, insert: before + sel + after },
    selection: { anchor: from + before.length, head: from + before.length + sel.length },
  });
  v.focus();
};

const prefixLines = (v: EditorView, prefix: string) => {
  const { from, to } = v.state.selection.main;
  const startLine = v.state.doc.lineAt(from);
  const endLine = v.state.doc.lineAt(to);
  const changes = [];
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = v.state.doc.line(i);
    changes.push({ from: line.from, to: line.from, insert: prefix });
  }
  v.dispatch({ changes });
  v.focus();
};

const insertBlock = (v: EditorView, text: string) => {
  const pos = v.state.selection.main.from;
  v.dispatch({
    changes: { from: pos, to: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
  v.focus();
};

// level 0 = 正文（去掉标题标记）；1..6 = 对应 # 数量
const setHeadingLevel = (v: EditorView, level: number) => {
  const { from, to } = v.state.selection.main;
  const startLine = v.state.doc.lineAt(from);
  const endLine = v.state.doc.lineAt(to);
  const prefix = level > 0 ? "#".repeat(level) + " " : "";
  const changes = [];
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = v.state.doc.line(i);
    const stripped = line.text.replace(/^#{1,6}\s*/, "");
    changes.push({ from: line.from, to: line.to, insert: prefix + stripped });
  }
  v.dispatch({ changes });
  v.focus();
};

type Action =
  | { kind: "wrap"; before: string; after: string; ph: string }
  | { kind: "prefix"; prefix: string }
  | { kind: "block"; text: string };

interface Btn {
  icon: IconName;
  label?: string;
  titleKey: string;
  action: Action;
}

// 工具栏按功能分组：行内文字样式 / 段落与结构 / 插入对象
const INLINE_GROUP: Btn[] = [
  { icon: "bold", titleKey: "tbBold", action: { kind: "wrap", before: "**", after: "**", ph: "粗体" } },
  { icon: "italic", titleKey: "tbItalic", action: { kind: "wrap", before: "*", after: "*", ph: "斜体" } },
  { icon: "strike", titleKey: "tbStrike", action: { kind: "wrap", before: "~~", after: "~~", ph: "删除线" } },
  { icon: "code", titleKey: "tbCode", action: { kind: "wrap", before: "`", after: "`", ph: "code" } },
  { icon: "link", titleKey: "tbLink", action: { kind: "wrap", before: "[", after: "](https://)", ph: "链接文字" } },
];
const BLOCK_GROUP: Btn[] = [
  { icon: "quote", titleKey: "tbQuote", action: { kind: "prefix", prefix: "> " } },
  { icon: "ul", titleKey: "tbUl", action: { kind: "prefix", prefix: "- " } },
  { icon: "ol", titleKey: "tbOl", action: { kind: "prefix", prefix: "1. " } },
];
const INSERT_GROUP: Btn[] = [
  { icon: "codeblock", titleKey: "tbCodeBlock", action: { kind: "block", text: "\n```js\n\n```\n" } },
  { icon: "table", titleKey: "tbTable", action: { kind: "block", text: "\n| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n" } },
  { icon: "hr", titleKey: "tbHr", action: { kind: "block", text: "\n\n---\n\n" } },
];

const FONT_OPTIONS: { value: string; key?: string; label?: string }[] = [
  { value: "sans", key: "fontSans" },
  { value: "serif", key: "fontSerif" },
  { value: "mono", key: "fontMono" },
  { value: "kai", key: "fontKai" },
  { value: "song", key: "fontSong" },
  { value: "hei", key: "fontHei" },
  { value: "fangsong", key: "fontFangsong" },
  { value: "yahei", key: "fontYahei" },
  { value: "pingfang", key: "fontPingfang" },
  { value: "arial", label: "Arial" },
  { value: "georgia", label: "Georgia" },
  { value: "times", label: "Times New Roman" },
  { value: "verdana", label: "Verdana" },
  { value: "tahoma", label: "Tahoma" },
  { value: "trebuchet", label: "Trebuchet MS" },
  { value: "courier", label: "Courier New" },
  { value: "consolas", label: "Consolas" },
  { value: "cambria", label: "Cambria" },
];
const HEADING_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
const SIZE_OPTIONS = [14, 15, 16, 17, 18, 20];
const ALIGN_OPTIONS: { value: string; icon: IconName; key: string }[] = [
  { value: "left", icon: "alignLeft", key: "alignLeft" },
  { value: "center", icon: "alignCenter", key: "alignCenter" },
  { value: "right", icon: "alignRight", key: "alignRight" },
  { value: "justify", icon: "alignLeft", key: "alignJustify" },
];

const lightTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", backgroundColor: "#ffffff", color: "#2b2f36" },
  ".cm-scroller": { overflow: "auto", fontFamily: "Consolas, 'Cascadia Mono', monospace", lineHeight: "1.7" },
  ".cm-content": { padding: "16px 0" },
  ".cm-gutters": { backgroundColor: "#ffffff", borderRight: "1px solid #eef0f3", color: "#c0c6ce" },
  ".cm-activeLine": { backgroundColor: "#f7f8fa" },
  ".cm-activeLineGutter": { backgroundColor: "#f0f2f5" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "#ffe3cc !important" },
  ".cm-cursor": { borderLeftColor: "#ff6a00" },
});

const darkTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", backgroundColor: "#1e2126", color: "#d6dae0" },
  ".cm-scroller": { overflow: "auto", fontFamily: "Consolas, 'Cascadia Mono', monospace", lineHeight: "1.7" },
  ".cm-content": { padding: "16px 0" },
  ".cm-gutters": { backgroundColor: "#1e2126", borderRight: "1px solid #2b2f36", color: "#5a616b" },
  ".cm-activeLine": { backgroundColor: "#252930" },
  ".cm-activeLineGutter": { backgroundColor: "#2b2f36" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "#3a4150 !important" },
  ".cm-cursor": { borderLeftColor: "#ff8a3d" },
});

export default function Editor({ initial, lang, appearance, params, onParams, pickImage, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeComp = useRef(new Compartment());
  const cb = useRef(onChange);
  cb.current = onChange;
  const [hd, setHd] = useState("");

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: initial,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          themeComp.current.of(appearance === "dark" ? darkTheme : lightTheme),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current(u.state.doc.toString());
          }),
        ],
      }),
      parent: host.current!,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch({
      effects: themeComp.current.reconfigure(appearance === "dark" ? darkTheme : lightTheme),
    });
  }, [appearance]);

  const run = (a: Action) => {
    const v = viewRef.current;
    if (!v) return;
    if (a.kind === "wrap") wrapSel(v, a.before, a.after, a.ph);
    else if (a.kind === "prefix") prefixLines(v, a.prefix);
    else insertBlock(v, a.text);
  };

  const onImage = async () => {
    const v = viewRef.current;
    if (!v) return;
    const path = await pickImage();
    if (!path) return;
    const name = path.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
    insertBlock(v, `\n![${name}](${path})\n`);
  };

  const renderBtn = (b: Btn) => (
    <button
      key={b.titleKey}
      className="tb-btn"
      title={tr(lang, b.titleKey)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(b.action)}
    >
      <Icon name={b.icon} size={16} />
      {b.label && <span className="tb-badge">{b.label}</span>}
    </button>
  );

  return (
    <div className={"editor-wrap" + (appearance === "dark" ? " dark" : "")}>
      <div className="pane-head">
        <span>{tr(lang, "paneEditor")}</span>
      </div>
      <div className="toolbar">
        {/* 行内文字样式 */}
        <div className="tb-group">
          {INLINE_GROUP.map(renderBtn)}
        </div>

        {/* 段落与结构：标题级别 + 引用/列表 */}
        <div className="tb-group">
          <select
            className="tb-select tb-select-sm"
            title={tr(lang, "tbHeading")}
            value={hd}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value;
              setHd("");
              const view = viewRef.current;
              if (view) setHeadingLevel(view, Number(v));
            }}
          >
            <option value="">{tr(lang, "tbHeading")}</option>
            {HEADING_OPTIONS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl === 0 ? tr(lang, "hdBody") : tr(lang, "hdTitle", { n: lvl })}
              </option>
            ))}
          </select>
          {BLOCK_GROUP.map(renderBtn)}
        </div>

        {/* 插入对象：代码块/表格/分隔线/图片 */}
        <div className="tb-group">
          {INSERT_GROUP.map(renderBtn)}
          <button className="tb-btn" title={tr(lang, "tbImage")} onMouseDown={(e) => e.preventDefault()} onClick={onImage}>
            <Icon name="image" size={16} />
          </button>
        </div>

        <div className="tb-spacer" />

        <div className="tb-group tb-style">
          <span className="tb-lead"><Icon name="font" size={15} /></span>
          <select
            className="tb-select"
            title={tr(lang, "fontFamily")}
            value={params.font_family}
            onChange={(e) => onParams({ font_family: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.label ?? tr(lang, f.key!)}</option>
            ))}
          </select>
          <select
            className="tb-select tb-select-sm"
            title={tr(lang, "fontSize")}
            value={params.font_size}
            onChange={(e) => onParams({ font_size: Number(e.target.value) })}
          >
            {SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>
          <span className="tb-div" />
          {ALIGN_OPTIONS.map((a) => (
            <button
              key={a.value}
              className={"tb-btn" + (params.align === a.value ? " active" : "")}
              title={tr(lang, a.key)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onParams({ align: a.value })}
            >
              <Icon name={a.icon} size={16} />
            </button>
          ))}
        </div>
      </div>
      <div ref={host} className="editor" />
    </div>
  );
}
