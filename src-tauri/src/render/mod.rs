use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use syntect::easy::HighlightLines;
use syntect::highlighting::ThemeSet;
use syntect::html::{styled_line_to_highlighted_html, IncludeBackground};
use syntect::parsing::{SyntaxReference, SyntaxSet};

/// 主题 = 「元素 → 内联样式串」映射。微信只保留内联样式，故主题不能用 CSS 类。
#[derive(Clone)]
pub struct Theme {
    pub h1: String,
    pub h2: String,
    pub h3: String,
    pub h4: String,
    pub h5: String,
    pub h6: String,
    pub p: String,
    pub strong: String,
    pub em: String,
    pub del: String,
    pub code_inline: String,
    pub pre: String,
    pub code: String,
    /// 代码块底色是否为深色：决定语法高亮取暗色/亮色配色，保证在浅底主题（如 minimal）也可读。
    pub code_dark: bool,
    pub blockquote: String,
    pub ul: String,
    pub ol: String,
    pub li: String,
    pub a: String,
    pub table: String,
    pub th: String,
    pub td: String,
    pub td_alt: String,
    pub hr: String,
    pub placeholder: String,
    pub placeholder_label: String,
    pub placeholder_caption: String,
}

impl Theme {
    /// 取预设主题（单一入口）。17 套 = 8 套「配色主题」+ 9 套「出版风格主题」。
    /// 每套用「标题版式 + 引用/表格/分隔线版式 + 调色板」组合，故不仅配色不同、版式结构也不同。
    pub fn by_id(id: &str) -> Self {
        build(preset_spec(id))
    }
}

/// 预设主题的规格表（`&'static str` 字面量）。`by_id` 与可视化编辑器的「从预设起步」共用此表。
fn preset_spec(id: &str) -> Spec<'static> {
    match id {
        // ---------- 配色主题 ----------
        "wechat" => Spec {
            head: HeadStyle::Pill, quote: QuoteStyle::Bar, table: TableStyle::Grid, rule: RuleStyle::Solid,
            indent: false, lh: "1.75",
            accent: "#07c160", soft: "#eafaf1", head_c: "#1a1a1a", link: "#576b95",
            code_bg: "#282c34", code_fg: "#abb2bf", inline_bg: "#eef7f1", inline_fg: "#0a7a43",
            border: "#d7ece0", ph_border: "#07c160", ph_bg: "#eafaf1", ph_fg: "#0a7a43",
        },
        "minimal" => Spec {
            head: HeadStyle::Underline, quote: QuoteStyle::Rule, table: TableStyle::ThreeLine, rule: RuleStyle::Solid,
            indent: false, lh: "1.7",
            accent: "#333333", soft: "#f5f5f5", head_c: "#000000", link: "#000000",
            code_bg: "#f5f5f5", code_fg: "#333333", inline_bg: "#f2f2f2", inline_fg: "#333333",
            border: "#cccccc", ph_border: "#999999", ph_bg: "#f5f5f5", ph_fg: "#333333",
        },
        "purple" => Spec {
            head: HeadStyle::Block, quote: QuoteStyle::Card, table: TableStyle::Grid, rule: RuleStyle::Solid,
            indent: false, lh: "1.75",
            accent: "#7c3aed", soft: "#f5f0ff", head_c: "#241a3a", link: "#7c3aed",
            code_bg: "#241f31", code_fg: "#dcd6f0", inline_bg: "#f3eeff", inline_fg: "#6d28d9",
            border: "#ddd3f2", ph_border: "#7c3aed", ph_bg: "#f5f0ff", ph_fg: "#5b21b6",
        },
        "teal" => Spec {
            head: HeadStyle::Bar, quote: QuoteStyle::Bar, table: TableStyle::Striped, rule: RuleStyle::Solid,
            indent: false, lh: "1.75",
            accent: "#0d9488", soft: "#e9f7f5", head_c: "#10312e", link: "#0f766e",
            code_bg: "#16282a", code_fg: "#cfe9e5", inline_bg: "#e6f4f2", inline_fg: "#0f766e",
            border: "#cfe6e2", ph_border: "#0d9488", ph_bg: "#e9f7f5", ph_fg: "#0f766e",
        },
        "crimson" => Spec {
            head: HeadStyle::Pill, quote: QuoteStyle::Card, table: TableStyle::Grid, rule: RuleStyle::Dashed,
            indent: false, lh: "1.75",
            accent: "#e11d48", soft: "#fdeef2", head_c: "#33121c", link: "#be123c",
            code_bg: "#2a1a1e", code_fg: "#f0d6dc", inline_bg: "#fdeaef", inline_fg: "#be123c",
            border: "#f0d3da", ph_border: "#e11d48", ph_bg: "#fdeef2", ph_fg: "#be123c",
        },
        "forest" => Spec {
            head: HeadStyle::Underline, quote: QuoteStyle::Bar, table: TableStyle::ThreeLine, rule: RuleStyle::Solid,
            indent: false, lh: "1.8",
            accent: "#2f855a", soft: "#ecf7f0", head_c: "#14301f", link: "#276749",
            code_bg: "#1b2a20", code_fg: "#d3e9da", inline_bg: "#e8f4ec", inline_fg: "#276749",
            border: "#d2e7da", ph_border: "#2f855a", ph_bg: "#ecf7f0", ph_fg: "#276749",
        },
        "morandi" => Spec {
            head: HeadStyle::Bracket, quote: QuoteStyle::Rule, table: TableStyle::Grid, rule: RuleStyle::Solid,
            indent: false, lh: "1.85",
            accent: "#a98467", soft: "#f4efe9", head_c: "#4a4238", link: "#8a7259",
            code_bg: "#2e2a26", code_fg: "#e3dcd2", inline_bg: "#efe9e1", inline_fg: "#7c6650",
            border: "#e0d7cb", ph_border: "#a98467", ph_bg: "#f4efe9", ph_fg: "#7c6650",
        },

        // ---------- 出版风格主题 ----------
        // 商务
        "business" => Spec {
            head: HeadStyle::Bracket, quote: QuoteStyle::Bar, table: TableStyle::Striped, rule: RuleStyle::Solid,
            indent: false, lh: "1.7",
            accent: "#2f5597", soft: "#eef2f9", head_c: "#1f2937", link: "#2f5597",
            code_bg: "#232a36", code_fg: "#d7dde8", inline_bg: "#eef2f9", inline_fg: "#2f5597",
            border: "#d3dbe8", ph_border: "#2f5597", ph_bg: "#eef2f9", ph_fg: "#2f5597",
        },
        // 科技
        "tech" => Spec {
            head: HeadStyle::Block, quote: QuoteStyle::Card, table: TableStyle::Striped, rule: RuleStyle::Solid,
            indent: false, lh: "1.7",
            accent: "#2f6fed", soft: "#eef3fe", head_c: "#16233d", link: "#2f6fed",
            code_bg: "#1e2430", code_fg: "#d6deeb", inline_bg: "#eef1f6", inline_fg: "#2f6fed",
            border: "#d5dcec", ph_border: "#2f6fed", ph_bg: "#eef3fe", ph_fg: "#1e40af",
        },
        // 学术
        "academic" => Spec {
            head: HeadStyle::Academic, quote: QuoteStyle::Rule, table: TableStyle::ThreeLine, rule: RuleStyle::Solid,
            indent: false, lh: "1.85",
            accent: "#2c5282", soft: "#eef2f8", head_c: "#1a202c", link: "#2c5282",
            code_bg: "#232a36", code_fg: "#dbe2ee", inline_bg: "#eef2f8", inline_fg: "#2c5282",
            border: "#d3dae6", ph_border: "#2c5282", ph_bg: "#eef2f8", ph_fg: "#2c5282",
        },
        // 科研
        "research" => Spec {
            head: HeadStyle::Underline, quote: QuoteStyle::Card, table: TableStyle::ThreeLine, rule: RuleStyle::Solid,
            indent: false, lh: "1.75",
            accent: "#0369a1", soft: "#e8f3fa", head_c: "#0c2233", link: "#0369a1",
            code_bg: "#0f1b26", code_fg: "#cfe3f0", inline_bg: "#e8f3fa", inline_fg: "#0369a1",
            border: "#cfe1ee", ph_border: "#0369a1", ph_bg: "#e8f3fa", ph_fg: "#0369a1",
        },
        // 职场
        "workplace" => Spec {
            head: HeadStyle::Bar, quote: QuoteStyle::Card, table: TableStyle::Striped, rule: RuleStyle::Solid,
            indent: false, lh: "1.75",
            accent: "#4f46e5", soft: "#eef0fe", head_c: "#1e1b4b", link: "#4f46e5",
            code_bg: "#1f2233", code_fg: "#dcdff5", inline_bg: "#eef0fe", inline_fg: "#4338ca",
            border: "#d6d9f5", ph_border: "#4f46e5", ph_bg: "#eef0fe", ph_fg: "#4338ca",
        },
        // 报告
        "report" => Spec {
            head: HeadStyle::Bar, quote: QuoteStyle::Bar, table: TableStyle::Striped, rule: RuleStyle::Double,
            indent: false, lh: "1.7",
            accent: "#1d4ed8", soft: "#eaf0fe", head_c: "#111827", link: "#1d4ed8",
            code_bg: "#1f2637", code_fg: "#dbe4f5", inline_bg: "#eaf0fe", inline_fg: "#1d4ed8",
            border: "#d2dcf2", ph_border: "#1d4ed8", ph_bg: "#eaf0fe", ph_fg: "#1d4ed8",
        },
        // 论文（首行缩进 + 大行距）
        "paper" => Spec {
            head: HeadStyle::Academic, quote: QuoteStyle::Rule, table: TableStyle::ThreeLine, rule: RuleStyle::Solid,
            indent: true, lh: "1.9",
            accent: "#3f3f46", soft: "#f2f2f3", head_c: "#18181b", link: "#3f3f46",
            code_bg: "#27272a", code_fg: "#e4e4e7", inline_bg: "#f2f2f3", inline_fg: "#3f3f46",
            border: "#dcdcdf", ph_border: "#3f3f46", ph_bg: "#f2f2f3", ph_fg: "#3f3f46",
        },
        // 杂志
        "magazine" => Spec {
            head: HeadStyle::Magazine, quote: QuoteStyle::Card, table: TableStyle::Striped, rule: RuleStyle::Dashed,
            indent: false, lh: "1.7",
            accent: "#db2777", soft: "#fdecf3", head_c: "#1f2937", link: "#be185d",
            code_bg: "#2a1c26", code_fg: "#f3d9e6", inline_bg: "#fdecf3", inline_fg: "#be185d",
            border: "#f2d5e2", ph_border: "#db2777", ph_bg: "#fdecf3", ph_fg: "#be185d",
        },
        // 书籍（居中 + 首行缩进 + 宽松行距）
        "book" => Spec {
            head: HeadStyle::Book, quote: QuoteStyle::Rule, table: TableStyle::Grid, rule: RuleStyle::Solid,
            indent: true, lh: "1.95",
            accent: "#8a5a2b", soft: "#f5efe6", head_c: "#3f2d1c", link: "#8a5a2b",
            code_bg: "#2e2a26", code_fg: "#e6ddcd", inline_bg: "#f5efe6", inline_fg: "#7c5326",
            border: "#e0d6c5", ph_border: "#8a5a2b", ph_bg: "#f5efe6", ph_fg: "#7c5326",
        },
        // default · 活力橙（未知 id 的兜底）
        _ => Spec {
            head: HeadStyle::Bar, quote: QuoteStyle::Bar, table: TableStyle::Grid, rule: RuleStyle::Solid,
            indent: false, lh: "1.75",
            accent: "#ff6a00", soft: "#fff3ea", head_c: "#1a1a1a", link: "#576b95",
            code_bg: "#282c34", code_fg: "#abb2bf", inline_bg: "#fff1e6", inline_fg: "#c2410c",
            border: "#dddddd", ph_border: "#ff8a3d", ph_bg: "#fff6ef", ph_fg: "#b3541e",
        },
    }
}

/// 标题版式：决定 H1–H6 的结构与装饰（配合调色板 → 每套主题版式不同，而非仅换色）。
#[derive(Clone, Copy)]
enum HeadStyle {
    Bar,       // 左侧竖色条，逐级变细
    Underline, // 下划线递进
    Block,     // 色块填充（白字）
    Pill,      // 圆角胶囊 / 柔和底
    Bracket,   // 双线 / 角标（商务杂志）
    Academic,  // 学术：居中主标题 + 底线小节 + 斜体三级
    Magazine,  // 杂志：超大主标题 + 粗底线 + 左侧色条
    Book,      // 书籍：居中 + 疏朗字距 + 斜体小节
}

/// 引用块版式。
#[derive(Clone, Copy)]
enum QuoteStyle {
    Bar,   // 左侧色条 + 柔和底
    Card,  // 描边卡片 + 斜体
    Rule,  // 上下细线 + 居中斜体（学术/书籍）
}

/// 表格版式。
#[derive(Clone, Copy)]
enum TableStyle {
    Grid,      // 全网格描边
    Striped,   // 表头强调 + 隔行斑马底
    ThreeLine, // 三线表（学术规范：仅顶/表头底/底三条线）
}

/// 分隔线版式。
#[derive(Clone, Copy)]
enum RuleStyle {
    Solid,
    Dashed,
    Double,
}

/// 主题规格：标题/引用/表格/分隔线版式 + 缩进/行距 + 少量颜色，组合生成整套内联样式主题。
/// 生命周期 `'a` 让预设（`&'static str` 字面量）与可视化编辑器的自定义主题（借用 owned String）共用同一构造器。
struct Spec<'a> {
    head: HeadStyle,
    quote: QuoteStyle,
    table: TableStyle,
    rule: RuleStyle,
    indent: bool,
    lh: &'a str,
    accent: &'a str,
    soft: &'a str,
    head_c: &'a str,
    link: &'a str,
    code_bg: &'a str,
    code_fg: &'a str,
    inline_bg: &'a str,
    inline_fg: &'a str,
    border: &'a str,
    ph_border: &'a str,
    ph_bg: &'a str,
    ph_fg: &'a str,
}

/// 生成 H1–H6 六级标题：字号/字重/颜色/装饰逐级递减，形成清晰层级；
/// 不同 `HeadStyle` 版式给出结构性差异（竖条 / 下划线 / 色块 / 胶囊 / 双线 / 学术 / 杂志 / 书籍）。
fn headings(kind: HeadStyle, accent: &str, head: &str, soft: &str, border: &str) -> [String; 6] {
    let dim = "#98a0ab";
    match kind {
        HeadStyle::Bar => [
            format!("font-size:26px;font-weight:bold;color:{};text-align:center;letter-spacing:1px;margin:30px 0 18px;", head),
            format!("font-size:22px;font-weight:bold;color:{};border-left:5px solid {};background:{};padding:6px 0 6px 12px;line-height:1.4;margin:28px 0 14px;", accent, accent, soft),
            format!("font-size:19px;font-weight:bold;color:{};border-left:3px solid {};padding-left:10px;margin:24px 0 12px;", head, accent),
            format!("font-size:17px;font-weight:bold;color:{};margin:20px 0 10px;", accent),
            format!("font-size:15px;font-weight:bold;color:{};letter-spacing:0.5px;margin:18px 0 8px;", head),
            format!("font-size:14px;font-weight:bold;color:{};letter-spacing:1px;margin:16px 0 8px;", dim),
        ],
        HeadStyle::Underline => [
            format!("font-size:26px;font-weight:bold;color:{};text-align:center;letter-spacing:1px;margin:30px 0 18px;", head),
            format!("font-size:22px;font-weight:bold;color:{};border-bottom:2px solid {};padding-bottom:8px;margin:28px 0 14px;", head, accent),
            format!("font-size:19px;font-weight:bold;color:{};border-bottom:1px solid {};padding-bottom:6px;margin:24px 0 12px;", accent, border),
            format!("font-size:17px;font-weight:bold;color:{};margin:20px 0 10px;", head),
            format!("font-size:15px;font-weight:bold;color:{};margin:18px 0 8px;", accent),
            format!("font-size:14px;font-weight:bold;color:{};letter-spacing:1px;margin:16px 0 8px;", dim),
        ],
        HeadStyle::Block => [
            format!("font-size:26px;font-weight:bold;color:#ffffff;background:{};text-align:center;padding:12px 16px;border-radius:8px;letter-spacing:1px;margin:30px 0 18px;", accent),
            format!("font-size:21px;font-weight:bold;color:#ffffff;background:{};padding:8px 14px;border-radius:6px;margin:28px 0 14px;", accent),
            format!("font-size:19px;font-weight:bold;color:{};background:{};padding:6px 12px;border-radius:6px;margin:24px 0 12px;", accent, soft),
            format!("font-size:17px;font-weight:bold;color:{};border-left:4px solid {};padding-left:10px;margin:20px 0 10px;", head, accent),
            format!("font-size:15px;font-weight:bold;color:{};margin:18px 0 8px;", accent),
            format!("font-size:14px;font-weight:bold;color:{};letter-spacing:1px;margin:16px 0 8px;", dim),
        ],
        HeadStyle::Pill => [
            format!("font-size:26px;font-weight:bold;color:{};text-align:center;letter-spacing:1px;margin:30px 0 18px;", head),
            format!("font-size:21px;font-weight:bold;color:{};background:{};text-align:center;padding:9px 18px;border-radius:14px;margin:28px 0 14px;", accent, soft),
            format!("font-size:19px;font-weight:bold;color:{};background:{};padding:5px 12px;border-radius:10px;margin:24px 0 12px;", accent, soft),
            format!("font-size:17px;font-weight:bold;color:{};border-left:4px solid {};border-radius:2px;padding-left:10px;margin:20px 0 10px;", head, accent),
            format!("font-size:15px;font-weight:bold;color:{};margin:18px 0 8px;", accent),
            format!("font-size:14px;font-weight:bold;color:{};letter-spacing:1px;margin:16px 0 8px;", dim),
        ],
        HeadStyle::Bracket => [
            format!("font-size:26px;font-weight:bold;color:{};text-align:center;letter-spacing:2px;margin:30px 0 18px;", head),
            format!("font-size:21px;font-weight:bold;color:{};text-align:center;border-top:1px solid {};border-bottom:1px solid {};padding:8px 0;letter-spacing:1px;margin:28px 0 14px;", head, accent, accent),
            format!("font-size:19px;font-weight:bold;color:{};border-bottom:1px dotted {};padding-bottom:5px;margin:24px 0 12px;", accent, border),
            format!("font-size:17px;font-weight:bold;color:{};letter-spacing:0.5px;margin:20px 0 10px;", head),
            format!("font-size:15px;font-weight:bold;color:{};margin:18px 0 8px;", accent),
            format!("font-size:14px;font-weight:bold;color:{};letter-spacing:1px;margin:16px 0 8px;", dim),
        ],
        HeadStyle::Academic => [
            format!("font-size:24px;font-weight:bold;color:{};text-align:center;letter-spacing:0.5px;margin:32px 0 20px;", head),
            format!("font-size:20px;font-weight:bold;color:{};border-bottom:1px solid {};padding-bottom:6px;margin:28px 0 14px;", head, border),
            format!("font-size:17px;font-weight:bold;font-style:italic;color:{};margin:24px 0 12px;", head),
            format!("font-size:15px;font-weight:bold;color:{};margin:20px 0 10px;", accent),
            format!("font-size:14px;font-weight:bold;color:{};margin:18px 0 8px;", head),
            format!("font-size:13px;font-weight:bold;color:{};letter-spacing:1px;margin:16px 0 8px;", dim),
        ],
        HeadStyle::Magazine => [
            format!("font-size:30px;font-weight:bold;color:{};line-height:1.2;letter-spacing:0.5px;margin:30px 0 18px;", accent),
            format!("font-size:24px;font-weight:bold;color:{};border-bottom:3px solid {};padding-bottom:6px;margin:28px 0 14px;", head, accent),
            format!("font-size:20px;font-weight:bold;color:{};margin:24px 0 12px;", accent),
            format!("font-size:17px;font-weight:bold;color:{};border-left:4px solid {};padding-left:10px;margin:20px 0 10px;", head, accent),
            format!("font-size:15px;font-weight:bold;color:{};letter-spacing:0.5px;margin:18px 0 8px;", accent),
            format!("font-size:13px;font-weight:bold;color:{};letter-spacing:1.5px;margin:16px 0 8px;", dim),
        ],
        HeadStyle::Book => [
            format!("font-size:28px;font-weight:bold;color:{};text-align:center;letter-spacing:2px;margin:34px 0 22px;", head),
            format!("font-size:22px;font-weight:bold;color:{};text-align:center;border-bottom:1px solid {};padding-bottom:8px;margin:30px 0 16px;", head, border),
            format!("font-size:19px;font-weight:bold;color:{};margin:26px 0 12px;", accent),
            format!("font-size:17px;font-weight:bold;font-style:italic;color:{};margin:22px 0 10px;", head),
            format!("font-size:15px;font-weight:bold;color:{};margin:18px 0 8px;", accent),
            format!("font-size:14px;font-style:italic;color:{};margin:16px 0 8px;", dim),
        ],
    }
}

/// 形状语言：色块/胶囊圆润，竖条/双线/杂志方正，下划线/学术利落，书籍柔和。
fn radius(h: HeadStyle) -> i32 {
    match h {
        HeadStyle::Block | HeadStyle::Pill => 10,
        HeadStyle::Bar | HeadStyle::Bracket | HeadStyle::Magazine => 4,
        HeadStyle::Underline | HeadStyle::Academic => 2,
        HeadStyle::Book => 6,
    }
}

fn quote_style(q: QuoteStyle, accent: &str, soft: &str, border: &str, r: i32) -> String {
    match q {
        QuoteStyle::Bar => format!(
            "border-left:4px solid {};background:{};color:#5a6069;padding:10px 14px;border-radius:{}px;margin:16px 0;",
            accent, soft, r
        ),
        QuoteStyle::Card => format!(
            "border:1px solid {};background:{};color:#5a6069;padding:12px 16px;border-radius:{}px;margin:18px 0;font-style:italic;",
            border, soft, r + 2
        ),
        QuoteStyle::Rule => format!(
            "border-top:1px solid {};border-bottom:1px solid {};color:#6a7079;padding:12px 6px;margin:18px 0;font-style:italic;text-align:center;",
            border, border
        ),
    }
}

fn rule_style(r: RuleStyle, border: &str) -> String {
    match r {
        RuleStyle::Solid => format!("border:none;border-top:1px solid {};margin:24px 0;", border),
        RuleStyle::Dashed => format!("border:none;border-top:1px dashed {};margin:24px 0;", border),
        RuleStyle::Double => format!("border:none;border-top:3px double {};margin:26px 0;", border),
    }
}

/// 表格三件套 + 隔行底色（td_alt）。三线表无竖线，是学术/科研规范。
fn table_style(tb: TableStyle, accent: &str, soft: &str, head_c: &str, border: &str) -> (String, String, String, String) {
    match tb {
        TableStyle::Grid => {
            let table = format!("border-collapse:collapse;width:100%;margin:16px 0;border:1px solid {};", border);
            let th = format!("border:1px solid {};background:{};padding:8px 10px;text-align:left;font-weight:bold;color:{};", border, soft, head_c);
            let td = format!("border:1px solid {};padding:8px 10px;", border);
            (table, th, td.clone(), td)
        }
        TableStyle::Striped => {
            let table = format!("border-collapse:collapse;width:100%;margin:16px 0;border:1px solid {};", border);
            let th = format!("border:1px solid {};background:{};color:#ffffff;padding:8px 10px;text-align:left;font-weight:bold;", border, accent);
            let td = format!("border:1px solid {};padding:8px 10px;background:#ffffff;", border);
            let td_alt = format!("border:1px solid {};padding:8px 10px;background:{};", border, soft);
            (table, th, td, td_alt)
        }
        TableStyle::ThreeLine => {
            let table = format!("border-collapse:collapse;width:100%;margin:18px 0;border-top:2px solid {};border-bottom:2px solid {};", head_c, head_c);
            let th = format!("border:none;border-bottom:1px solid {};padding:8px 10px;text-align:left;font-weight:bold;color:{};", head_c, head_c);
            let td = "border:none;padding:8px 10px;".to_string();
            (table, th, td.clone(), td)
        }
    }
}

/// 判断十六进制底色是否为深色（相对亮度 < 0.5）。用于给语法高亮选暗/亮配色。
fn is_dark_hex(hex: &str) -> bool {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 {
        return true;
    }
    let chan = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).unwrap_or(0) as f64;
    let lum = (0.299 * chan(0) + 0.587 * chan(2) + 0.114 * chan(4)) / 255.0;
    lum < 0.5
}

/// syntect 默认语法集（含换行版，逐行高亮所需）。体积大，进程内缓存一次。
fn syntax_set() -> &'static SyntaxSet {
    static SS: OnceLock<SyntaxSet> = OnceLock::new();
    SS.get_or_init(SyntaxSet::load_defaults_newlines)
}

/// syntect 默认配色集。进程内缓存一次。
fn theme_set() -> &'static ThemeSet {
    static TS: OnceLock<ThemeSet> = OnceLock::new();
    TS.get_or_init(ThemeSet::load_defaults)
}

fn find_syntax<'a>(ss: &'a SyntaxSet, lang: &str) -> Option<&'a SyntaxReference> {
    ss.find_syntax_by_token(lang).or_else(|| ss.find_syntax_by_extension(lang))
}

/// 把围栏代码块高亮为「内联颜色 span」串（微信剥离 class，必须内联）。
/// 无语言或无法识别时回退为转义纯文本，保留主题自身的 code/pre 配色。
/// 仅产出前景色 span，背景仍由主题的 `pre` 决定；深色预览下 `pre` 整体二次反相，配色不失真。
fn highlight_code(code: &str, lang: &str, dark: bool) -> String {
    if lang.trim().is_empty() {
        return escape_html(code);
    }
    let ss = syntax_set();
    let syntax = match find_syntax(ss, lang.trim()) {
        Some(s) => s,
        None => return escape_html(code),
    };
    let ts = theme_set();
    let name = if dark { "base16-ocean.dark" } else { "base16-ocean.light" };
    let theme = match ts.themes.get(name).or_else(|| ts.themes.values().next()) {
        Some(t) => t,
        None => return escape_html(code),
    };
    let mut hl = HighlightLines::new(syntax, theme);
    let mut html = String::with_capacity(code.len() * 2);
    for line in code.split_inclusive('\n') {
        let rendered = hl
            .highlight_line(line, ss)
            .and_then(|ranges| styled_line_to_highlighted_html(&ranges, IncludeBackground::No));
        match rendered {
            Ok(snippet) => html.push_str(&snippet),
            Err(_) => html.push_str(&escape_html(line)),
        }
    }
    html
}

fn build<'a>(s: Spec<'a>) -> Theme {
    let [h1, h2, h3, h4, h5, h6] = headings(s.head, s.accent, s.head_c, s.soft, s.border);
    let r = radius(s.head);
    let (table, th, td, td_alt) = table_style(s.table, s.accent, s.soft, s.head_c, s.border);
    let p = format!("margin:12px 0;line-height:{};{}", s.lh, if s.indent { "text-indent:2em;" } else { "" });
    Theme {
        h1, h2, h3, h4, h5, h6,
        p,
        strong: format!("color:{};font-weight:bold;", s.accent),
        em: "font-style:italic;".into(),
        del: "text-decoration:line-through;color:#999999;".into(),
        code_inline: format!(
            "background:{};color:{};padding:2px 5px;border-radius:{}px;font-family:Consolas,monospace;font-size:14px;",
            s.inline_bg, s.inline_fg, r.clamp(3, 4)
        ),
        pre: format!(
            "background:{};color:{};padding:14px;border-radius:{}px;overflow:auto;font-family:Consolas,'Liberation Mono',Menlo,monospace;font-size:14px;line-height:1.6;margin:16px 0;",
            s.code_bg, s.code_fg, r + 2
        ),
        code: "font-family:Consolas,'Liberation Mono',Menlo,monospace;font-size:14px;".into(),
        code_dark: is_dark_hex(s.code_bg),
        blockquote: quote_style(s.quote, s.accent, s.soft, s.border, r),
        ul: "margin:12px 0;padding-left:24px;".into(),
        ol: "margin:12px 0;padding-left:24px;".into(),
        li: "margin:6px 0;line-height:1.75;".into(),
        a: format!("color:{};text-decoration:none;", s.link),
        table,
        th,
        td,
        td_alt,
        hr: rule_style(s.rule, s.border),
        placeholder: format!(
            "border:2px dashed {};background:{};color:{};text-align:center;padding:16px;margin:16px 0;border-radius:{}px;",
            s.ph_border, s.ph_bg, s.ph_fg, r + 2
        ),
        placeholder_label: "margin:0;font-size:15px;font-weight:bold;".into(),
        placeholder_caption: "margin:6px 0 0;font-size:12px;opacity:0.8;".into(),
    }
}

// ===== 可视化主题编辑器：可序列化的主题规格 =====

/// 版式枚举 ↔ 字符串 token（前端下拉/持久化用）。token 稳定，作为自定义主题的存储格式。
fn head_token(h: HeadStyle) -> &'static str {
    match h {
        HeadStyle::Bar => "bar",
        HeadStyle::Underline => "underline",
        HeadStyle::Block => "block",
        HeadStyle::Pill => "pill",
        HeadStyle::Bracket => "bracket",
        HeadStyle::Academic => "academic",
        HeadStyle::Magazine => "magazine",
        HeadStyle::Book => "book",
    }
}
fn head_from(s: &str) -> HeadStyle {
    match s {
        "underline" => HeadStyle::Underline,
        "block" => HeadStyle::Block,
        "pill" => HeadStyle::Pill,
        "bracket" => HeadStyle::Bracket,
        "academic" => HeadStyle::Academic,
        "magazine" => HeadStyle::Magazine,
        "book" => HeadStyle::Book,
        _ => HeadStyle::Bar,
    }
}
fn quote_token(q: QuoteStyle) -> &'static str {
    match q {
        QuoteStyle::Bar => "bar",
        QuoteStyle::Card => "card",
        QuoteStyle::Rule => "rule",
    }
}
fn quote_from(s: &str) -> QuoteStyle {
    match s {
        "card" => QuoteStyle::Card,
        "rule" => QuoteStyle::Rule,
        _ => QuoteStyle::Bar,
    }
}
fn table_token(t: TableStyle) -> &'static str {
    match t {
        TableStyle::Grid => "grid",
        TableStyle::Striped => "striped",
        TableStyle::ThreeLine => "three_line",
    }
}
fn table_from(s: &str) -> TableStyle {
    match s {
        "striped" => TableStyle::Striped,
        "three_line" => TableStyle::ThreeLine,
        _ => TableStyle::Grid,
    }
}
fn rule_token(r: RuleStyle) -> &'static str {
    match r {
        RuleStyle::Solid => "solid",
        RuleStyle::Dashed => "dashed",
        RuleStyle::Double => "double",
    }
}
fn rule_from(s: &str) -> RuleStyle {
    match s {
        "dashed" => RuleStyle::Dashed,
        "double" => RuleStyle::Double,
        _ => RuleStyle::Solid,
    }
}

/// 可视化主题编辑器的可序列化规格：颜色为 owned String，版式为字符串 token。
/// 与内部 `Spec` 一一对应；前端编辑后回传，`to_theme` 借用其字符串构造 `Spec<'_>` → `build`。
#[derive(Serialize, Deserialize, Clone)]
pub struct ThemeSpec {
    pub head: String,
    pub quote: String,
    pub table: String,
    pub rule: String,
    pub indent: bool,
    pub lh: String,
    pub accent: String,
    pub soft: String,
    pub head_c: String,
    pub link: String,
    pub code_bg: String,
    pub code_fg: String,
    pub inline_bg: String,
    pub inline_fg: String,
    pub border: String,
    pub ph_border: String,
    pub ph_bg: String,
    pub ph_fg: String,
}

impl ThemeSpec {
    /// 从预设 id 取一份可编辑副本（编辑器「基于现有主题起步」）。
    pub fn from_preset(id: &str) -> Self {
        let s = preset_spec(id);
        ThemeSpec {
            head: head_token(s.head).into(),
            quote: quote_token(s.quote).into(),
            table: table_token(s.table).into(),
            rule: rule_token(s.rule).into(),
            indent: s.indent,
            lh: s.lh.into(),
            accent: s.accent.into(),
            soft: s.soft.into(),
            head_c: s.head_c.into(),
            link: s.link.into(),
            code_bg: s.code_bg.into(),
            code_fg: s.code_fg.into(),
            inline_bg: s.inline_bg.into(),
            inline_fg: s.inline_fg.into(),
            border: s.border.into(),
            ph_border: s.ph_border.into(),
            ph_bg: s.ph_bg.into(),
            ph_fg: s.ph_fg.into(),
        }
    }

    /// 用本规格构造内联样式主题（不含全局字体/字号/对齐参数，那由 `themed_spec` 追加）。
    pub fn to_theme(&self) -> Theme {
        build(Spec {
            head: head_from(&self.head),
            quote: quote_from(&self.quote),
            table: table_from(&self.table),
            rule: rule_from(&self.rule),
            indent: self.indent,
            lh: &self.lh,
            accent: &self.accent,
            soft: &self.soft,
            head_c: &self.head_c,
            link: &self.link,
            code_bg: &self.code_bg,
            code_fg: &self.code_fg,
            inline_bg: &self.inline_bg,
            inline_fg: &self.inline_fg,
            border: &self.border,
            ph_border: &self.ph_border,
            ph_bg: &self.ph_bg,
            ph_fg: &self.ph_fg,
        })
    }
}

impl Default for ThemeSpec {
    fn default() -> Self {
        ThemeSpec::from_preset("default")
    }
}

#[derive(Serialize, Clone)]
pub struct ThemeMeta {
    pub id: String,
    pub name_zh: String,
    pub name_en: String,
    pub category: String,
}

pub fn available_themes() -> Vec<ThemeMeta> {
    let c = |id: &str, zh: &str, en: &str, cat: &str| ThemeMeta {
        id: id.into(), name_zh: zh.into(), name_en: en.into(), category: cat.into(),
    };
    vec![
        // 配色主题
        c("default", "活力橙", "Vivid Orange", "color"),
        c("wechat", "微信绿", "WeChat Green", "color"),
        c("minimal", "极简黑白", "Minimal Mono", "color"),
        c("purple", "暗夜紫", "Royal Purple", "color"),
        c("teal", "清新青", "Fresh Teal", "color"),
        c("crimson", "暖阳红", "Warm Crimson", "color"),
        c("forest", "森林绿", "Forest Green", "color"),
        c("morandi", "莫兰迪", "Morandi Mist", "color"),
        // 出版风格主题
        c("business", "商务", "Business", "publish"),
        c("tech", "科技", "Tech", "publish"),
        c("academic", "学术", "Academic", "publish"),
        c("research", "科研", "Research", "publish"),
        c("workplace", "职场", "Workplace", "publish"),
        c("report", "报告", "Report", "publish"),
        c("paper", "论文", "Paper", "publish"),
        c("magazine", "杂志", "Magazine", "publish"),
        c("book", "书籍", "Book", "publish"),
    ]
}


pub fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn escape_attr(s: &str) -> String {
    escape_html(s).replace('"', "&quot;")
}

/// 把内联样式的文章 HTML 包成可独立打开 / 打印的完整文档。
/// 用于导出单文件 HTML 与「打印为 PDF」（同一份带打印 CSS 的文档，离线、无外部依赖）。
pub fn standalone_document(content_html: &str, title: &str) -> String {
    let t = escape_html(title);
    format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
@page {{ margin: 18mm; }}
html, body {{ margin: 0; padding: 0; }}
body {{ background: #fff; color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.doc {{ max-width: 820px; margin: 0 auto; padding: 24px; }}
.doc pre {{ white-space: pre-wrap; word-wrap: break-word; }}
.doc img, .doc pre, .doc blockquote, .doc table {{ break-inside: avoid; page-break-inside: avoid; }}
.doc h1, .doc h2, .doc h3, .doc h4, .doc h5, .doc h6 {{ break-after: avoid; page-break-after: avoid; }}
</style>
</head>
<body>
<div class="doc">
{content}
</div>
</body>
</html>"#,
        title = t,
        content = content_html
    )
}

fn heading_style(t: &Theme, level: u8) -> &str {
    match level {
        1 => &t.h1,
        2 => &t.h2,
        3 => &t.h3,
        4 => &t.h4,
        5 => &t.h5,
        _ => &t.h6,
    }
}

fn placeholder_html(t: &Theme, n: usize, src: &str) -> String {
    let label = format!("【此处插入图片 {}】", n);
    format!(
        "<section style=\"{}\"><p style=\"{}\">{}</p><p style=\"{}\">{}</p></section>",
        t.placeholder,
        t.placeholder_label,
        label,
        t.placeholder_caption,
        escape_html(src)
    )
}

/// 全局主题参数：字体 / 正文字号 / 对齐。作用于整篇文章（单一渲染源），随主题一起持久化。
#[derive(Serialize, Deserialize, Clone)]
pub struct ThemeParams {
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default = "default_align")]
    pub align: String,
}

fn default_font_family() -> String {
    "sans".into()
}
fn default_font_size() -> u32 {
    16
}
fn default_align() -> String {
    "left".into()
}

impl Default for ThemeParams {
    fn default() -> Self {
        ThemeParams {
            font_family: default_font_family(),
            font_size: default_font_size(),
            align: default_align(),
        }
    }
}

fn font_stack(token: &str) -> &'static str {
    match token {
        "serif" => "Georgia,'Times New Roman','Songti SC','SimSun',serif",
        "mono" => "Consolas,'Courier New',monospace",
        "kai" => "'Kaiti SC','KaiTi','STKaiti',serif",
        "song" => "'Songti SC','SimSun',serif",
        "hei" => "'Heiti SC','SimHei','Microsoft YaHei',sans-serif",
        "fangsong" => "'FangSong','STFangsong','FangSong_GB2312',serif",
        "yahei" => "'Microsoft YaHei','微软雅黑','PingFang SC',sans-serif",
        "pingfang" => "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif",
        "arial" => "Arial,Helvetica,'PingFang SC','Microsoft YaHei',sans-serif",
        "georgia" => "Georgia,'Times New Roman',serif",
        "times" => "'Times New Roman',Times,serif",
        "verdana" => "Verdana,Geneva,Tahoma,sans-serif",
        "tahoma" => "Tahoma,Verdana,'Segoe UI',sans-serif",
        "trebuchet" => "'Trebuchet MS','Lucida Grande',sans-serif",
        "courier" => "'Courier New',Courier,monospace",
        "consolas" => "Consolas,'Cascadia Mono','Courier New',monospace",
        "cambria" => "Cambria,Georgia,serif",
        _ => "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
    }
}

fn align_css(a: &str) -> &'static str {
    match a {
        "center" => "center",
        "right" => "right",
        "justify" => "justify",
        _ => "left",
    }
}

/// 把全局参数（字体/字号/对齐）以内联样式追加到相关元素。
/// 内联 CSS 中后声明者胜，故追加即可覆盖预设里的同名属性。
/// 注意：字号阶梯与对齐属于**主题版式设计**，标题只套用界面选择的字体族，不被全局字号/对齐覆盖。
fn apply_params(mut t: Theme, p: &ThemeParams) -> Theme {
    let ff = format!("font-family:{};", font_stack(&p.font_family));
    let fs = format!("font-size:{}px;", p.font_size);
    let al = format!("text-align:{};", align_css(&p.align));

    t.p = format!("{}{}{}{}", t.p, ff, fs, al);
    t.li = format!("{}{}{}", t.li, ff, fs);
    t.blockquote = format!("{}{}", t.blockquote, ff);
    t.td = format!("{}{}", t.td, ff);
    t.td_alt = format!("{}{}", t.td_alt, ff);
    t.th = format!("{}{}", t.th, ff);
    t.h1 = format!("{}{}", t.h1, ff);
    t.h2 = format!("{}{}", t.h2, ff);
    t.h3 = format!("{}{}", t.h3, ff);
    t.h4 = format!("{}{}", t.h4, ff);
    t.h5 = format!("{}{}", t.h5, ff);
    t.h6 = format!("{}{}", t.h6, ff);
    t
}

/// 按 id 取预设主题并叠加全局参数。
pub fn themed(id: &str, p: &ThemeParams) -> Theme {
    apply_params(Theme::by_id(id), p)
}

/// 按可视化编辑器产出的自定义规格构造主题并叠加全局参数。
pub fn themed_spec(spec: &ThemeSpec, p: &ThemeParams) -> Theme {
    apply_params(spec.to_theme(), p)
}

/// 把 Markdown 渲染为「全内联样式」HTML。图片/公式统一为编号占位块（共用同一编号序列）。
/// 占位文案固定中文（面向公众号读者），不随界面语言变化。
pub fn render_markdown(md: &str, t: &Theme) -> String {
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TASKLISTS);
    opts.insert(Options::ENABLE_FOOTNOTES);

    let mut out = String::new();
    let mut counter = 0usize;
    let mut in_code = false;
    let mut in_image = false;
    let mut in_thead = false;
    let mut tbody_open = false;
    let mut body_row = 0usize;
    let mut row_alt = false;
    let mut code_lang = String::new();
    let mut code_buf = String::new();

    for ev in Parser::new_ext(md, opts) {
        match ev {
            Event::Start(tag) => match tag {
                Tag::Heading { level, .. } => {
                    out.push_str(&format!("<h{} style=\"{}\">", level as u8, heading_style(t, level as u8)))
                }
                Tag::Paragraph => out.push_str(&format!("<p style=\"{}\">", t.p)),
                Tag::Strong => out.push_str(&format!("<strong style=\"{}\">", t.strong)),
                Tag::Emphasis => out.push_str(&format!("<em style=\"{}\">", t.em)),
                Tag::Strikethrough => out.push_str(&format!("<del style=\"{}\">", t.del)),
                Tag::CodeBlock(kind) => {
                    in_code = true;
                    code_buf.clear();
                    code_lang = match kind {
                        CodeBlockKind::Fenced(info) => info.split_whitespace().next().unwrap_or("").to_string(),
                        CodeBlockKind::Indented => String::new(),
                    };
                    out.push_str(&format!("<pre style=\"{}\"><code style=\"{}\">", t.pre, t.code));
                }
                Tag::Link { dest_url, .. } => {
                    out.push_str(&format!("<a style=\"{}\" href=\"{}\">", t.a, escape_attr(&dest_url)))
                }
                Tag::Image { dest_url, .. } => {
                    counter += 1;
                    out.push_str(&placeholder_html(t, counter, &dest_url));
                    in_image = true;
                }
                Tag::List(Some(start)) => out.push_str(&format!("<ol style=\"{}\" start=\"{}\">", t.ol, start)),
                Tag::List(None) => out.push_str(&format!("<ul style=\"{}\">", t.ul)),
                Tag::Item => out.push_str(&format!("<li style=\"{}\">", t.li)),
                Tag::BlockQuote(..) => out.push_str(&format!("<blockquote style=\"{}\">", t.blockquote)),
                Tag::Table(_) => {
                    body_row = 0;
                    row_alt = false;
                    out.push_str(&format!("<table style=\"{}\">", t.table));
                }
                Tag::TableHead => {
                    in_thead = true;
                    out.push_str("<thead><tr>");
                }
                Tag::TableRow => {
                    body_row += 1;
                    row_alt = body_row % 2 == 0;
                    out.push_str("<tr>");
                }
                Tag::TableCell => {
                    if in_thead {
                        out.push_str(&format!("<th style=\"{}\">", t.th));
                    } else {
                        let cell = if row_alt { &t.td_alt } else { &t.td };
                        out.push_str(&format!("<td style=\"{}\">", cell));
                    }
                }
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Heading(level) => out.push_str(&format!("</h{}>", level as u8)),
                TagEnd::Paragraph => out.push_str("</p>"),
                TagEnd::Strong => out.push_str("</strong>"),
                TagEnd::Emphasis => out.push_str("</em>"),
                TagEnd::Strikethrough => out.push_str("</del>"),
                TagEnd::CodeBlock => {
                    in_code = false;
                    out.push_str(&highlight_code(&code_buf, &code_lang, t.code_dark));
                    out.push_str("</code></pre>");
                    code_buf.clear();
                    code_lang.clear();
                }
                TagEnd::Link => out.push_str("</a>"),
                TagEnd::Image => in_image = false,
                TagEnd::List(true) => out.push_str("</ol>"),
                TagEnd::List(false) => out.push_str("</ul>"),
                TagEnd::Item => out.push_str("</li>"),
                TagEnd::BlockQuote(..) => out.push_str("</blockquote>"),
                TagEnd::TableHead => {
                    in_thead = false;
                    tbody_open = true;
                    out.push_str("</tr></thead><tbody>");
                }
                TagEnd::TableRow => out.push_str("</tr>"),
                TagEnd::TableCell => {
                    if in_thead {
                        out.push_str("</th>");
                    } else {
                        out.push_str("</td>");
                    }
                }
                TagEnd::Table => {
                    if tbody_open {
                        out.push_str("</tbody>");
                        tbody_open = false;
                    }
                    out.push_str("</table>");
                }
                _ => {}
            },
            Event::Text(txt) => {
                if in_code {
                    code_buf.push_str(&txt);
                } else if !in_image {
                    out.push_str(&escape_html(&txt));
                }
            }
            Event::Code(txt) => {
                out.push_str(&format!("<code style=\"{}\">{}</code>", t.code_inline, escape_html(&txt)))
            }
            Event::SoftBreak => out.push('\n'),
            Event::HardBreak => out.push_str("<br/>"),
            Event::Rule => out.push_str(&format!("<hr style=\"{}\"/>", t.hr)),
            Event::Html(h) | Event::InlineHtml(h) => out.push_str(&escape_html(&h)),
            Event::TaskListMarker(checked) => out.push_str(&format!(
                "<span style=\"{}\">{}</span> ",
                t.code_inline,
                if checked { "☑" } else { "☐" }
            )),
            _ => {}
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholder_numbering_and_inline_styles() {
        let md = "# T\n\n![a](x.png)\n\n![b](y.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
        let html = render_markdown(md, &Theme::by_id("default"));
        assert!(html.contains("【此处插入图片 1】"));
        assert!(html.contains("【此处插入图片 2】"));
        assert!(html.contains("style=\""));
        assert!(html.contains("<table"));
        assert!(html.contains("border:1px solid #dddddd"));
        assert!(!html.contains("<img"), "不应输出真实 img 标签");
    }

    #[test]
    fn placeholder_is_always_chinese() {
        let html = render_markdown("![a](x.png)\n", &Theme::by_id("default"));
        assert!(html.contains("【此处插入图片 1】"));
        assert!(!html.contains("Insert image"));
    }

    #[test]
    fn params_inject_font_size_and_align() {
        let p = ThemeParams { font_family: "serif".into(), font_size: 18, align: "center".into() };
        let t = themed("default", &p);
        let html = render_markdown("hello\n", &t);
        assert!(html.contains("font-size:18px"));
        assert!(html.contains("text-align:center"));
        assert!(html.contains("Georgia"));
    }

    #[test]
    fn six_heading_levels_are_distinct() {
        let t = themed("default", &ThemeParams::default());
        let md = "# 1\n\n## 2\n\n### 3\n\n#### 4\n\n##### 5\n\n###### 6\n";
        let html = render_markdown(md, &t);
        for tag in ["h1", "h2", "h3", "h4", "h5", "h6"] {
            assert!(html.contains(&format!("<{} ", tag)), "缺少 {tag}");
        }
        // 六级样式两两不同（此前 h4/h5/h6 与 h3 完全一致，层级不清）
        let levels = [&t.h1, &t.h2, &t.h3, &t.h4, &t.h5, &t.h6];
        for i in 0..levels.len() {
            for j in (i + 1)..levels.len() {
                assert_ne!(levels[i], levels[j], "h{} 与 h{} 样式重复", i + 1, j + 1);
            }
        }
    }

    #[test]
    fn themes_have_varied_heading_layouts() {
        let p = ThemeParams::default();
        let h2s: Vec<String> = available_themes().iter().map(|m| themed(&m.id, &p).h2).collect();
        // 各主题的 H2 版式互不相同（同一版式族 + 不同调色板 → 颜色不同即视为不同版式实例）
        let mut uniq = h2s.clone();
        uniq.sort();
        uniq.dedup();
        assert_eq!(uniq.len(), h2s.len(), "存在重复的 H2 版式");
        // 覆盖多类结构：竖条 / 下划线 / 色块(白字) / 双线
        let joined = h2s.join("\n");
        assert!(joined.contains("border-left"), "缺少竖条版式");
        assert!(joined.contains("border-bottom"), "缺少下划线/双线版式");
        assert!(joined.contains("color:#ffffff"), "缺少色块填充版式");
        assert!(joined.contains("border-top"), "缺少双线版式");
    }

    #[test]
    fn three_line_table_has_no_vertical_rules() {
        // 学术/论文用三线表：单元格不应有竖向 border
        let t = themed("academic", &ThemeParams::default());
        let md = "| a | b |\n|---|---|\n| 1 | 2 |\n";
        let html = render_markdown(md, &t);
        assert!(t.td.starts_with("border:none;"), "三线表单元格应无竖线，实为 {}", t.td);
        assert!(t.table.contains("border-top:2px solid"), "三线表应有顶线");
        assert!(html.contains("<td style=\"border:none;"));
    }

    #[test]
    fn striped_table_alternates_rows() {
        // 科技主题：偶数行用 soft 底色，奇数行白底
        let t = themed("tech", &ThemeParams::default());
        let md = "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n";
        let html = render_markdown(md, &t);
        assert!(t.td.contains("background:#ffffff"), "奇数行应白底");
        assert!(t.td_alt.contains("background:#eef3fe"), "偶数行应着色");
        assert!(html.contains("background:#ffffff"), "应出现白底单元格");
        assert!(html.contains("background:#eef3fe"), "应出现斑马底单元格");
    }

    #[test]
    fn paper_theme_indents_body() {
        let t = themed("paper", &ThemeParams::default());
        assert!(t.p.contains("text-indent:2em"), "论文主题正文应首行缩进");
        let html = render_markdown("段落\n", &t);
        assert!(html.contains("text-indent:2em"));
    }

    #[test]
    fn fenced_code_is_syntax_highlighted() {
        let t = themed("default", &ThemeParams::default());
        let md = "```rust\nfn main() { let x = 1; }\n```\n";
        let html = render_markdown(md, &t);
        assert!(html.contains("<pre style="), "应保留 pre 包裹");
        assert!(html.contains("<code style="), "应保留 code 包裹");
        assert!(html.contains("</code></pre>"), "应正确闭合");
        assert!(html.contains("<span style="), "应输出内联样式 span：{}", html);
        assert!(html.contains("color:#"), "span 应含内联颜色（微信剥离 class，必须内联）：{}", html);
    }

    #[test]
    fn code_without_language_stays_plain_and_escaped() {
        let t = themed("default", &ThemeParams::default());
        let md = "```\nplain <text> & more\n```\n";
        let html = render_markdown(md, &t);
        assert!(html.contains("plain &lt;text&gt; &amp; more"), "无语言应转义为纯文本：{}", html);
        assert!(!html.contains("<span style="), "无语言不应高亮：{}", html);
    }

    #[test]
    fn code_palette_matches_block_background() {
        // minimal 代码块为浅底 → 亮色高亮；default 为深底 → 暗色高亮（否则浅底配浅色字不可读）
        assert!(!themed("minimal", &ThemeParams::default()).code_dark, "minimal 代码底应判为浅色");
        assert!(themed("default", &ThemeParams::default()).code_dark, "default 代码底应判为深色");
    }

    #[test]
    fn all_themes_render() {
        let list = available_themes();
        assert_eq!(list.len(), 17, "应有 17 套主题");
        for m in list {
            let html = render_markdown("# H\n\n**b** text\n\n> q\n\n---\n", &themed(&m.id, &ThemeParams::default()));
            assert!(html.contains("<h1"), "主题 {} 应渲染 h1", m.id);
            assert!(html.contains("<blockquote"), "主题 {} 应渲染引用", m.id);
        }
    }

    #[test]
    fn standalone_document_wraps_content_for_print() {
        let body = render_markdown("# H <x>\n", &themed("default", &ThemeParams::default()));
        let doc = standalone_document(&body, "My Title & More");
        assert!(doc.starts_with("<!DOCTYPE html>"), "应为完整文档");
        assert!(doc.contains("<title>My Title &amp; More</title>"), "标题应转义");
        assert!(doc.contains("@page"), "应含打印分页 CSS");
        assert!(doc.contains("print-color-adjust: exact"), "应强制打印保留底色");
        assert!(doc.contains(&body), "应原样内嵌渲染结果");
        assert!(doc.trim_end().ends_with("</html>"));
    }

    #[test]
    fn custom_spec_from_preset_matches_preset_theme() {
        let p = ThemeParams::default();
        for m in available_themes() {
            let spec = ThemeSpec::from_preset(&m.id);
            assert_eq!(
                themed_spec(&spec, &p).h2,
                themed(&m.id, &p).h2,
                "from_preset({}) 应等价于预设主题",
                m.id
            );
        }
    }

    #[test]
    fn custom_spec_edits_propagate_to_output() {
        let p = ThemeParams::default();
        let mut spec = ThemeSpec::from_preset("wechat");
        spec.accent = "#123456".into();
        let t = themed_spec(&spec, &p);
        assert!(t.strong.contains("#123456"), "自定义强调色应生效：{}", t.strong);
        let html = render_markdown("**b**\n", &t);
        assert!(html.contains("#123456"), "渲染输出应含自定义强调色：{}", html);
    }

    #[test]
    fn custom_spec_enum_tokens_select_layouts_and_unknown_falls_back() {
        let p = ThemeParams::default();
        let mut spec = ThemeSpec::default();
        spec.head = "academic".into();
        spec.table = "three_line".into();
        let t = themed_spec(&spec, &p);
        assert!(t.h1.contains("text-align:center"), "学术版式 H1 应居中：{}", t.h1);
        assert!(t.td.starts_with("border:none;"), "三线表单元格应无竖线：{}", t.td);
        // 未知 token 回退默认版式而非 panic
        spec.head = "not-a-style".into();
        let _ = themed_spec(&spec, &p);
    }
}
