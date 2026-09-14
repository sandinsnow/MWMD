import type { Lang } from "../i18n";
import type { ThemeMeta } from "./MenuBar";
import Icon from "./Icon";

export interface ThemeSpec {
  head: string;
  quote: string;
  table: string;
  rule: string;
  indent: boolean;
  lh: string;
  accent: string;
  soft: string;
  head_c: string;
  link: string;
  code_bg: string;
  code_fg: string;
  inline_bg: string;
  inline_fg: string;
  border: string;
  ph_border: string;
  ph_bg: string;
  ph_fg: string;
}

export interface CustomTheme {
  id: string;
  name_zh: string;
  name_en: string;
  spec: ThemeSpec;
}

export interface ThemeDraft {
  id: string | null;
  nameZh: string;
  nameEn: string;
  spec: ThemeSpec;
}

const HEADS: [string, string, string][] = [
  ["bar", "竖条", "Bar"],
  ["underline", "下划线", "Underline"],
  ["block", "色块", "Block"],
  ["pill", "胶囊", "Pill"],
  ["bracket", "双线", "Bracket"],
  ["academic", "学术", "Academic"],
  ["magazine", "杂志", "Magazine"],
  ["book", "书籍", "Book"],
];
const QUOTES: [string, string, string][] = [
  ["bar", "色条", "Bar"],
  ["card", "卡片", "Card"],
  ["rule", "细线", "Rule"],
];
const TABLES: [string, string, string][] = [
  ["grid", "全网格", "Grid"],
  ["striped", "斑马纹", "Striped"],
  ["three_line", "三线表", "Three-line"],
];
const RULES: [string, string, string][] = [
  ["solid", "实线", "Solid"],
  ["dashed", "虚线", "Dashed"],
  ["double", "双线", "Double"],
];

const COLORS: { key: keyof ThemeSpec; zh: string; en: string }[] = [
  { key: "accent", zh: "强调色", en: "Accent" },
  { key: "head_c", zh: "标题色", en: "Heading" },
  { key: "soft", zh: "柔和底色", en: "Soft bg" },
  { key: "link", zh: "链接色", en: "Link" },
  { key: "border", zh: "边框 / 分隔", en: "Border" },
  { key: "code_bg", zh: "代码块底色", en: "Code bg" },
  { key: "code_fg", zh: "代码块文字", en: "Code fg" },
  { key: "inline_bg", zh: "行内代码底", en: "Inline bg" },
  { key: "inline_fg", zh: "行内代码字", en: "Inline fg" },
  { key: "ph_border", zh: "占位块边框", en: "Placeholder border" },
  { key: "ph_bg", zh: "占位块底色", en: "Placeholder bg" },
  { key: "ph_fg", zh: "占位块文字", en: "Placeholder fg" },
];

interface Props {
  lang: Lang;
  presets: ThemeMeta[];
  draft: ThemeDraft;
  onSpec: (patch: Partial<ThemeSpec>) => void;
  onMeta: (patch: Partial<Pick<ThemeDraft, "nameZh" | "nameEn">>) => void;
  onBase: (presetId: string) => void;
  onSave: () => void;
  onSaveAsNew: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ThemeEditor({ lang, presets, draft, onSpec, onMeta, onBase, onSave, onSaveAsNew, onDelete, onClose }: Props) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const s = draft.spec;

  const sel = (label: string, value: string, opts: [string, string, string][], on: (v: string) => void) => (
    <label className="te-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => on(e.target.value)}>
        {opts.map(([v, zh, en]) => (
          <option key={v} value={v}>{lang === "zh" ? zh : en}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal theme-editor" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-head">
          <h2>{t("主题编辑器", "Theme editor")}</h2>
          <button className="icon-btn" title={t("关闭", "Close")} onClick={onClose}>
            <Icon name="winClose" size={15} />
          </button>
        </div>
        <p className="help-sub">{t("修改会实时反映在右侧预览；保存后才写入配置。", "Changes preview live on the right; saving writes them to config.")}</p>

        <div className="te-body">
          <div className="te-col">
            <label className="te-field">
              <span>{t("基于预设", "Base preset")}</span>
              <select defaultValue="" onChange={(e) => e.target.value && onBase(e.target.value)}>
                <option value="" disabled>{t("选择预设载入…", "Load a preset…")}</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{lang === "zh" ? p.name_zh : p.name_en}</option>
                ))}
              </select>
            </label>

            <div className="te-grid">
              {sel(t("标题版式", "Heading"), s.head, HEADS, (v) => onSpec({ head: v }))}
              {sel(t("引用版式", "Quote"), s.quote, QUOTES, (v) => onSpec({ quote: v }))}
              {sel(t("表格版式", "Table"), s.table, TABLES, (v) => onSpec({ table: v }))}
              {sel(t("分隔线", "Divider"), s.rule, RULES, (v) => onSpec({ rule: v }))}
            </div>

            <div className="te-grid">
              <label className="te-field">
                <span>{t("行距", "Line height")}</span>
                <input
                  type="number" min={1.2} max={2.4} step={0.05}
                  value={s.lh}
                  onChange={(e) => onSpec({ lh: e.target.value })}
                />
              </label>
              <label className="te-check">
                <input type="checkbox" checked={s.indent} onChange={(e) => onSpec({ indent: e.target.checked })} />
                <span>{t("首行缩进 2 字", "Indent first line")}</span>
              </label>
            </div>

            <div className="te-colors">
              {COLORS.map((c) => (
                <label className="te-color" key={c.key as string}>
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(s[c.key] as string) ? (s[c.key] as string) : "#000000"}
                    onChange={(e) => onSpec({ [c.key]: e.target.value } as Partial<ThemeSpec>)}
                  />
                  <span>{lang === "zh" ? c.zh : c.en}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="te-col te-meta">
            <label className="te-field">
              <span>{t("名称（中）", "Name (zh)")}</span>
              <input value={draft.nameZh} onChange={(e) => onMeta({ nameZh: e.target.value })} />
            </label>
            <label className="te-field">
              <span>{t("名称（英）", "Name (en)")}</span>
              <input value={draft.nameEn} onChange={(e) => onMeta({ nameEn: e.target.value })} />
            </label>
          </div>
        </div>

        <div className="modal-actions">
          {draft.id && (
            <button className="danger" onClick={onDelete}>{t("删除", "Delete")}</button>
          )}
          <button className="ghost" onClick={onClose}>{t("取消", "Cancel")}</button>
          {draft.id && (
            <button className="ghost" onClick={onSave}>{t("保存修改", "Save")}</button>
          )}
          <button className="primary" onClick={onSaveAsNew}>{draft.id ? t("另存为新主题", "Save as new") : t("保存为主题", "Save as theme")}</button>
        </div>
      </div>
    </div>
  );
}
