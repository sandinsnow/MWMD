import Icon from "./Icon";
import type { Lang } from "../i18n";

// Markdown 基本语法对照：左侧写法，右侧说明。code 中的 \n 配合 pre-wrap 换行显示。
const ROWS: { code: string; zh: string; en: string }[] = [
  { code: "# 标题", zh: "一级标题（H1）", en: "Heading level 1 (H1)" },
  { code: "##  …  ######", zh: "二至六级标题（H2–H6），# 越多级别越低", en: "Headings level 2–6; more # = lower level" },
  { code: "**粗体**", zh: "粗体", en: "Bold" },
  { code: "*斜体*", zh: "斜体", en: "Italic" },
  { code: "~~删除线~~", zh: "删除线", en: "Strikethrough" },
  { code: "`行内代码`", zh: "行内代码", en: "Inline code" },
  { code: "[链接文字](https://…)", zh: "超链接", en: "Hyperlink" },
  { code: "![替代文字](图片路径)", zh: "图片（本工具渲染为编号占位块）", en: "Image (rendered here as a numbered placeholder)" },
  { code: "> 引用内容", zh: "引用块", en: "Blockquote" },
  { code: "- 列表项", zh: "无序列表（也可用 * 或 +）", en: "Bulleted list (also * or +)" },
  { code: "1. 列表项", zh: "有序列表", en: "Numbered list" },
  { code: "- [ ] 待办\n- [x] 已完成", zh: "任务列表", en: "Task list" },
  { code: "```js\n代码\n```", zh: "围栏代码块（可标注语言）", en: "Fenced code block (optional language)" },
  { code: "| 列1 | 列2 |\n| --- | --- |\n| 甲 | 乙 |", zh: "表格", en: "Table" },
  { code: "---", zh: "分隔线", en: "Horizontal divider" },
  { code: "（空行）", zh: "空行分段，开始新段落", en: "A blank line starts a new paragraph" },
  { code: "行尾两个空格", zh: "段内强制换行", en: "Two trailing spaces force a line break" },
];

export default function HelpModal({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal help-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-head">
          <h2>{t("Markdown 语法说明", "Markdown syntax")}</h2>
          <button className="icon-btn" title={t("关闭", "Close")} onClick={onClose}>
            <Icon name="winClose" size={15} />
          </button>
        </div>
        <p className="help-sub">{t("左侧为 Markdown 写法，右侧为对应效果。", "Left: the Markdown you type. Right: what it produces.")}</p>
        <div className="help-body">
          {ROWS.map((r) => (
            <div className="help-row" key={r.code}>
              <code className="help-code">{r.code}</code>
              <span className="help-desc">{lang === "zh" ? r.zh : r.en}</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>{t("知道了", "Got it")}</button>
        </div>
      </div>
    </div>
  );
}
