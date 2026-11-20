mod clipboard;
#[cfg(windows)]
mod pdf;
mod render;
mod workspace;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use workspace::Node;

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Config {
    #[serde(default)]
    pub workspaces: Vec<String>,
    pub locale: Option<String>,
    pub theme: Option<String>,
    pub editor_theme: Option<String>,
    pub ui_font_family: Option<String>,
    pub ui_font_size: Option<u32>,
    pub wx_dark: Option<bool>,
    #[serde(default)]
    pub params: render::ThemeParams,
    #[serde(default)]
    pub custom_themes: Vec<CustomTheme>,
}

/// 可视化主题编辑器保存的自定义主题：名称 + 可序列化规格。
#[derive(Serialize, Deserialize, Clone)]
pub struct CustomTheme {
    pub id: String,
    pub name_zh: String,
    pub name_en: String,
    pub spec: render::ThemeSpec,
}

#[derive(Deserialize)]
pub struct Prefs {
    pub locale: Option<String>,
    pub theme: Option<String>,
    pub editor_theme: Option<String>,
    pub ui_font_family: Option<String>,
    pub ui_font_size: Option<u32>,
    pub wx_dark: Option<bool>,
    pub params: Option<render::ThemeParams>,
    pub custom_themes: Option<Vec<CustomTheme>>,
}

/// 持有目录监听器；workspaces 变化时整体重建（替换即停止旧监听）。
struct WatcherState(Mutex<Option<notify::RecommendedWatcher>>);

/// 最近由本进程写过的路径。监听器收到「全是自写」的事件时不再发 fs-changed，
/// 否则每次自动保存都会触发一次全工作区递归重扫（打字时尤其浪费）。
struct SelfWrites(std::sync::Arc<Mutex<std::collections::HashMap<String, std::time::Instant>>>);

const SELF_WRITE_TTL: std::time::Duration = std::time::Duration::from_secs(5);

/// 规范化路径用于「自写抑制」比对：Windows 下 JS 侧与 notify 事件侧的路径可能
/// 一个是 `\\?\` 长路径前缀、一个是普通盘符，分隔符/大小写也可能不同；不统一
/// 会导致抑制失效，每次保存仍触发全工作区重扫。
fn normalize_path(p: &str) -> String {
    let mut s = p.trim().replace('/', "\\");
    if let Some(rest) = s.strip_prefix("\\\\?\\") {
        s = rest.to_string();
        // UNC 长路径：\\?\UNC\server\share → \\server\share
        if let Some(rest2) = s.strip_prefix("UNC\\") {
            s = format!("\\\\{}", rest2);
        }
    }
    s.to_lowercase()
}

fn mark_self_write(state: &SelfWrites, paths: &[&str]) {
    let mut m = state.0.lock().unwrap();
    let now = std::time::Instant::now();
    m.retain(|_, t| now.duration_since(*t) < SELF_WRITE_TTL);
    for p in paths {
        m.insert(normalize_path(p), now);
    }
}

/// 事件路径是否全部可归因于本进程刚刚的写（含原子写的隐藏临时文件）。
fn all_self_written(m: &std::collections::HashMap<String, std::time::Instant>, paths: &[String]) -> bool {
    if paths.is_empty() {
        return false;
    }
    paths.iter().all(|p| {
        let norm = normalize_path(p);
        let name = Path::new(&norm).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        name.starts_with(workspace::TMP_PREFIX)
            || m.get(&norm).map(|t| t.elapsed() < SELF_WRITE_TTL).unwrap_or(false)
    })
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

fn load_config(app: &tauri::AppHandle) -> Config {
    match config_path(app).and_then(|p| fs::read_to_string(p).map_err(|e| e.to_string())) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Config::default(),
    }
}

fn save_config(app: &tauri::AppHandle, c: &Config) -> Result<(), String> {
    let p = config_path(app)?;
    fs::write(p, serde_json::to_string_pretty(c).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// 解析最终主题：优先用可视化编辑器的自定义规格，否则回退预设 id。
fn resolve_theme(theme: &str, spec: &Option<render::ThemeSpec>, params: &render::ThemeParams) -> render::Theme {
    match spec {
        Some(s) => render::themed_spec(s, params),
        None => render::themed(theme, params),
    }
}

/// CPU 密集（pulldown-cmark + syntect），离开主线程避免打字时界面卡顿。
#[tauri::command(async)]
fn render_markdown(md: String, theme: String, params: render::ThemeParams, spec: Option<render::ThemeSpec>) -> String {
    render::render_markdown(&md, &resolve_theme(&theme, &spec, &params))
}

#[tauri::command]
async fn copy_html(md: String, theme: String, params: render::ThemeParams, spec: Option<render::ThemeSpec>) -> Result<(), String> {
    let html = render::render_markdown(&md, &resolve_theme(&theme, &spec, &params));
    let plain = "MWMD: 已复制微信富文本，请在公众号编辑器粘贴。".to_string();
    tauri::async_runtime::spawn_blocking(move || clipboard::copy_html(&html, &plain))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn list_themes() -> Vec<render::ThemeMeta> {
    render::available_themes()
}

/// 取某预设主题的可编辑规格副本（可视化编辑器「基于现有主题起步」）。
#[tauri::command]
fn get_preset_spec(id: String) -> render::ThemeSpec {
    render::ThemeSpec::from_preset(&id)
}

/// 渲染为可独立打开 / 打印的完整 HTML 文档（供导出单文件 HTML 与 PDF 共用）。
fn build_document(md: String, theme: String, params: render::ThemeParams, spec: Option<render::ThemeSpec>, title: String) -> String {
    let body = render::render_markdown(&md, &resolve_theme(&theme, &spec, &params));
    render::standalone_document(&body, &title)
}

/// 导出单文件 HTML：弹出保存对话框，写入完整文档，返回落盘路径（用户取消则 None）。
/// 必须是 async：Tauri 同步命令跑在主线程，阻塞会导致整个界面冻结。
#[tauri::command]
async fn export_html(md: String, theme: String, params: render::ThemeParams, spec: Option<render::ThemeSpec>, title: String, suggested: String) -> Result<Option<String>, String> {
    let doc = build_document(md, theme, params, spec, title);
    let mut dialog = rfd::AsyncFileDialog::new().add_filter("HTML", &["html", "htm"]);
    if !suggested.is_empty() {
        dialog = dialog.set_file_name(suggested);
    }
    let handle = dialog.save_file().await;
    let path = match handle {
        Some(h) => h.path().to_path_buf(),
        None => return Ok(None),
    };
    let write_path = path.clone();
    tauri::async_runtime::spawn_blocking(move || fs::write(&write_path, doc))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// 静默导出 PDF：弹出保存对话框选目标路径，随后用系统 WebView2 的 PrintToPdf 直接生成（无打印对话框）。
/// 必须是 async：PDF 生成要在主线程派发 `with_webview` 闭包，主线程不能被命令阻塞，否则死锁冻结。
#[tauri::command]
async fn export_pdf(app: tauri::AppHandle, md: String, theme: String, params: render::ThemeParams, spec: Option<render::ThemeSpec>, title: String, suggested: String) -> Result<Option<String>, String> {
    let doc = build_document(md, theme, params, spec, title);
    let mut dialog = rfd::AsyncFileDialog::new().add_filter("PDF", &["pdf"]);
    if !suggested.is_empty() {
        dialog = dialog.set_file_name(suggested);
    }
    let handle = dialog.save_file().await;
    let path = match handle {
        Some(h) => h.path().to_string_lossy().to_string(),
        None => return Ok(None),
    };
    #[cfg(windows)]
    {
        let app2 = app.clone();
        let doc2 = doc.clone();
        let path2 = path.clone();
        tauri::async_runtime::spawn_blocking(move || pdf::export_pdf(&app2, &doc2, &path2))
            .await
            .map_err(|e| e.to_string())??;
        Ok(Some(path))
    }
    #[cfg(not(windows))]
    {
        let _ = (app, doc);
        Err("PDF 导出目前仅支持 Windows".to_string())
    }
}

#[tauri::command]
fn pick_file() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown"])
        .pick_file()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn pick_image() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Image", &["png", "jpg", "jpeg", "gif", "webp", "bmp"])
        .pick_file()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Config {
    load_config(&app)
}

#[tauri::command]
fn save_prefs(app: tauri::AppHandle, prefs: Prefs) -> Result<(), String> {
    let mut c = load_config(&app);
    if let Some(l) = prefs.locale {
        c.locale = Some(l);
    }
    if let Some(t) = prefs.theme {
        c.theme = Some(t);
    }
    if let Some(e) = prefs.editor_theme {
        c.editor_theme = Some(e);
    }
    if let Some(f) = prefs.ui_font_family {
        c.ui_font_family = Some(f);
    }
    if let Some(s) = prefs.ui_font_size {
        c.ui_font_size = Some(s);
    }
    if let Some(d) = prefs.wx_dark {
        c.wx_dark = Some(d);
    }
    if let Some(p) = prefs.params {
        c.params = p;
    }
    if let Some(ct) = prefs.custom_themes {
        c.custom_themes = ct;
    }
    save_config(&app, &c)
}

/// 为一组工作区根重建目录监听；任何变化通过 `fs-changed` 事件通知前端刷新树。
#[tauri::command]
fn watch_workspaces(app: tauri::AppHandle, state: State<WatcherState>, self_writes: State<SelfWrites>, roots: Vec<String>) -> Result<(), String> {
    use notify::{RecursiveMode, Watcher};
    // 重建监听时顺手清理上次崩溃残留的原子写临时文件（超过 10 分钟才删，避免误删在写文件）。
    workspace::clean_stale_tmps(&roots);
    let emitter = app.clone();
    let writes = self_writes.0.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            let paths: Vec<String> = ev.paths.iter().map(|p| p.to_string_lossy().to_string()).collect();
            let m = writes.lock().unwrap();
            if all_self_written(&m, &paths) {
                return;
            }
            drop(m);
            let _ = emitter.emit("fs-changed", ());
        }
    })
    .map_err(|e| e.to_string())?;
    for r in &roots {
        let _ = watcher.watch(Path::new(r), RecursiveMode::Recursive);
    }
    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}

#[tauri::command]
fn add_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new().pick_folder();
    match folder {
        Some(p) => {
            let s = p.to_string_lossy().to_string();
            let mut c = load_config(&app);
            if !c.workspaces.contains(&s) {
                c.workspaces.push(s.clone());
                save_config(&app, &c)?;
            }
            Ok(Some(s))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn remove_workspace(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let mut c = load_config(&app);
    c.workspaces.retain(|w| w != &path);
    save_config(&app, &c)
}

/// 递归扫盘可能较慢（大工作区），离开主线程。
#[tauri::command(async)]
fn list_tree(roots: Vec<String>) -> Vec<Node> {
    roots
        .iter()
        .map(|r| {
            let p = std::path::Path::new(r);
            Node {
                name: p
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| r.clone()),
                path: r.clone(),
                is_dir: true,
                is_image: false,
                children: Some(workspace::scan(p)),
            }
        })
        .collect()
}

/// 内容级全文检索：遍历工作区所有 .md，大小写不敏感匹配，返回「文件+行号+片段」。
/// async + spawn_blocking：遍历读盘可能较慢，不能阻塞主线程。
#[tauri::command]
async fn search_content(roots: Vec<String>, query: String) -> Vec<workspace::SearchHit> {
    tauri::async_runtime::spawn_blocking(move || workspace::search_content(&roots, &query, 500))
        .await
        .unwrap_or_default()
}

/// 读本地图片为 data URL：纯离线，不走网络、不启用 asset 协议通配 scope。
#[tauri::command]
async fn read_image(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || workspace::read_image(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// 读文档：返回正文 + 探测出的编码 + 磁盘基线（mtime/len），供冲突检测与保真回写。
#[tauri::command(async)]
fn read_doc(path: String) -> Result<workspace::DocFile, String> {
    workspace::read_doc(&path)
}

/// 写前基线比对：与载入/上次保存时的基线不一致即说明文件被外部改过。
#[tauri::command(async)]
fn stat_doc(path: String) -> Result<workspace::DocStat, String> {
    workspace::stat(&path)
}

#[tauri::command(async)]
fn save_doc(path: String, content: String, encoding: workspace::Encoding, self_writes: State<SelfWrites>) -> Result<workspace::DocSaveResult, String> {
    mark_self_write(&self_writes, &[&path]);
    workspace::save_doc(&path, &content, encoding)
}

#[tauri::command(async)]
fn create_doc(path: String, self_writes: State<SelfWrites>) -> Result<(), String> {
    mark_self_write(&self_writes, &[&path]);
    workspace::create_doc(&path)
}

#[tauri::command(async)]
fn create_dir(path: String, self_writes: State<SelfWrites>) -> Result<(), String> {
    mark_self_write(&self_writes, &[&path]);
    workspace::create_dir(&path)
}

#[tauri::command(async)]
fn rename_path(old: String, new: String, self_writes: State<SelfWrites>) -> Result<(), String> {
    mark_self_write(&self_writes, &[&old, &new]);
    workspace::rename_path(&old, &new)
}

#[tauri::command(async)]
fn delete_path(path: String, self_writes: State<SelfWrites>) -> Result<(), String> {
    mark_self_write(&self_writes, &[&path]);
    workspace::delete_path(&path)
}

/// 在系统默认浏览器打开外部链接（预览区点击链接、「检查更新 → 打开下载页」）。
/// 只放行 http/https/mailto；用 `ShellExecuteW` 直接交给系统协议处理器，**不经 cmd/shell**，
/// 因此 URL 里的 `& ? = % #` 等字符既不会被解释成命令，也不需要字符集白名单。
/// `async` 属性：启动浏览器可能阻塞数百毫秒，不能占住主线程。
#[tauri::command(async)]
fn open_external(url: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use winapi::um::shellapi::ShellExecuteW;
        use winapi::um::winuser::SW_SHOWNORMAL;

        let trimmed = url.trim();
        let lower = trimmed.to_ascii_lowercase();
        let scheme_ok = lower.starts_with("https://")
            || lower.starts_with("http://")
            || lower.starts_with("mailto:");
        // 控制字符与裸引号一律拒绝：系统把 URL 拼进协议处理器的命令行，引号会破坏其 quoting。
        // 合法 URL 里两者都必须百分号编码，故不会误伤正常链接。
        if !scheme_ok || trimmed.chars().any(|c| c.is_ascii_control() || c == '"') {
            return Err("仅支持 http/https/mailto 链接".into());
        }
        let wide = |s: &str| -> Vec<u16> {
            std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
        };
        let op = wide("open");
        let target = wide(trimmed);
        let rc = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                op.as_ptr(),
                target.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        // 返回值 >32 表示成功；<=32 是错误码（如 31 = 无关联程序）。
        if (rc as isize) <= 32 {
            return Err(format!("打开链接失败（代码 {}）", rc as isize));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Err("当前平台不支持打开外部链接".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatcherState(Mutex::new(None)))
        .manage(SelfWrites(std::sync::Arc::new(Mutex::new(std::collections::HashMap::new()))))
        .invoke_handler(tauri::generate_handler![
            render_markdown,
            copy_html,
            list_themes,
            get_preset_spec,
            export_html,
            export_pdf,
            pick_file,
            pick_image,
            get_config,
            save_prefs,
            watch_workspaces,
            add_workspace,
            remove_workspace,
            list_tree,
            search_content,
            read_image,
            read_doc,
            stat_doc,
            save_doc,
            create_doc,
            create_dir,
            rename_path,
            delete_path,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::open_external;

    #[test]
    fn self_write_suppression_only_covers_own_recent_writes() {
        use super::{all_self_written, mark_self_write, SelfWrites};
        use std::collections::HashMap;
        use std::sync::{Arc, Mutex};
        let state = SelfWrites(Arc::new(Mutex::new(HashMap::new())));
        mark_self_write(&state, &["C:\\ws\\a.md"]);
        let m = state.0.lock().unwrap();
        // 自己的写 + 原子写临时文件 → 抑制
        assert!(all_self_written(&m, &["C:\\ws\\a.md".into()]));
        assert!(all_self_written(&m, &["C:\\ws\\a.md".into(), "C:\\ws\\.mwmd-tmp-a.md-123".into()]));
        // 混入外部路径 → 不抑制；空事件 → 不抑制（保守刷新）
        assert!(!all_self_written(&m, &["C:\\ws\\a.md".into(), "C:\\ws\\b.md".into()]));
        assert!(!all_self_written(&m, &[]));
    }

    #[test]
    fn self_write_suppression_normalizes_windows_paths() {
        use super::{all_self_written, mark_self_write, normalize_path, SelfWrites};
        use std::collections::HashMap;
        use std::sync::{Arc, Mutex};
        let state = SelfWrites(Arc::new(Mutex::new(HashMap::new())));
        // 写入侧是 JS 传来的 `\\?\` 长路径 + 正斜杠 + 混合大小写。
        mark_self_write(&state, &["\\\\?\\C:/WS/Note.MD"]);
        let m = state.0.lock().unwrap();
        // 事件侧是 notify 传来的普通盘符路径：规范化后必须命中。
        assert!(all_self_written(&m, &["c:\\ws\\note.md".into()]));
        assert_eq!(normalize_path("\\\\?\\C:/WS/Note.MD"), "c:\\ws\\note.md");
        assert_eq!(normalize_path("\\\\?\\UNC\\Server\\Share\\A.MD"), "\\\\server\\share\\a.md");
    }

    /// 只覆盖拒绝分支：合法 URL 会真的拉起系统浏览器，不能在测试里触发。
    #[test]
    fn open_external_rejects_non_web_schemes_and_control_chars() {
        for bad in [
            "javascript:alert(1)",
            "JaVaScRiPt:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///C:/Windows/win.ini",
            "vbscript:msgbox(1)",
            "//evil.example/a",
            "https://ok.example/\r\nX-Injected: 1",
            "https://ok.example/\" -- \"",
            "cmd.exe /c calc",
            "   ",
            "",
        ] {
            assert!(open_external(bad.to_string()).is_err(), "should reject: {bad:?}");
        }
    }
}
