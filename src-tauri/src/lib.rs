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

#[tauri::command]
fn render_markdown(md: String, theme: String, params: render::ThemeParams, spec: Option<render::ThemeSpec>) -> String {
    render::render_markdown(&md, &resolve_theme(&theme, &spec, &params))
}

#[tauri::command]
async fn copy_html(md: String, theme: String, params: render::ThemeParams, spec: Option<render::ThemeSpec>) -> Result<(), String> {
    let html = render::render_markdown(&md, &resolve_theme(&theme, &spec, &params));
    let plain = "wxmd: 已复制微信富文本，请在公众号编辑器粘贴。".to_string();
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
fn watch_workspaces(app: tauri::AppHandle, state: State<WatcherState>, roots: Vec<String>) -> Result<(), String> {
    use notify::{RecursiveMode, Watcher};
    let emitter = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok() {
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

#[tauri::command]
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

#[tauri::command]
fn read_doc(path: String) -> Result<String, String> {
    workspace::read_doc(&path)
}

#[tauri::command]
fn save_doc(path: String, content: String) -> Result<(), String> {
    workspace::save_doc(&path, &content)
}

#[tauri::command]
fn create_doc(path: String) -> Result<(), String> {
    workspace::create_doc(&path)
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    workspace::create_dir(&path)
}

#[tauri::command]
fn rename_path(old: String, new: String) -> Result<(), String> {
    workspace::rename_path(&old, &new)
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    workspace::delete_path(&path)
}

/// 在系统默认浏览器打开外部链接（「检查更新 → 打开下载页」）。
/// 仅放行受限字符集的 https URL；字符集不含任何 cmd/shell 元字符（& | < > ^ % 空格 引号等），
/// 故经 `cmd /C start` 也杜绝注入。Windows 单平台。
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let safe = url.starts_with("https://")
            && url.chars().count() > "https://".chars().count()
            && url
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '/' | '.' | '-' | '_'));
        if !safe {
            return Err("仅允许受限字符集的 https 链接".into());
        }
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
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
            read_doc,
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
