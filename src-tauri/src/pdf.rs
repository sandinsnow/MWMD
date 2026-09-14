//! 静默导出 PDF：复用系统已自带的 WebView2 运行时，用 `ICoreWebView2_7::PrintToPdf`
//! 直接把渲染好的文章 HTML 打印成 PDF 文件——无系统打印对话框、不内置浏览器内核、纯离线。
//!
//! 思路：建一个隐藏的离屏窗口 → `NavigateToString` 载入文章 → `NavigationCompleted` 回调里
//! 发起 `PrintToPdf`（保留背景色、无页眉脚、纵向、18mm 边距）→ 完成回调通过 channel 回传结果
//! → 销毁隐藏窗口。
//!
//! 关键：**全程不在主线程跑嵌套消息泵**。所有 WebView2 异步回调都交给 tao 事件循环自然派发，
//! 命令线程（`spawn_blocking`）只在 channel 上带超时等待——因此即使出错也不会冻结界面。
//! 与预览/复制共用同一份内联样式渲染结果，保证「所见即所得」。

use std::sync::{mpsc, Arc, Mutex};
use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};
use webview2_com::{
    Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2Environment, ICoreWebView2Environment6, ICoreWebView2_7,
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    },
    NavigationCompletedEventHandler, PrintToPdfCompletedHandler,
};
use windows::core::{Interface, PCWSTR};

const LABEL: &str = "mwmd-pdf-print";
// 18mm ≈ 0.71in，与 standalone_document 的 @page 边距保持一致。
const MARGIN_IN: f64 = 0.71;
// 兜底超时：避免任何意外下命令线程无限等待（主线程始终不受影响）。
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

type Done = Arc<Mutex<Option<mpsc::Sender<Result<(), String>>>>>;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// 把最终结果回传给等待中的命令线程（只发送一次）。
fn finish(done: &Done, res: Result<(), String>) {
    if let Some(tx) = done.lock().unwrap().take() {
        let _ = tx.send(res);
    }
}

/// 在 `NavigationCompleted` 回调中发起静默打印；结果经 `PrintToPdf` 完成回调回传。
unsafe fn start_print(webview: &ICoreWebView2, env: &ICoreWebView2Environment, output: &str, done: &Done) {
    let e = |err: windows::core::Error| err.to_string();

    let env6 = match env.cast::<ICoreWebView2Environment6>() {
        Ok(v) => v,
        Err(err) => return finish(done, Err(e(err))),
    };
    let settings = match env6.CreatePrintSettings() {
        Ok(s) => s,
        Err(err) => return finish(done, Err(e(err))),
    };
    // 保留主题背景色、去掉页眉页脚（URL/日期）、纵向、统一边距。
    let _ = settings.SetShouldPrintBackgrounds(true);
    let _ = settings.SetShouldPrintHeaderAndFooter(false);
    let _ = settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT);
    let _ = settings.SetMarginTop(MARGIN_IN);
    let _ = settings.SetMarginBottom(MARGIN_IN);
    let _ = settings.SetMarginLeft(MARGIN_IN);
    let _ = settings.SetMarginRight(MARGIN_IN);

    let webview7 = match webview.cast::<ICoreWebView2_7>() {
        Ok(v) => v,
        Err(err) => return finish(done, Err(e(err))),
    };

    let out_wide = wide(output);
    let out_ptr = PCWSTR(out_wide.as_ptr());
    let done_print = done.clone();
    let handler = PrintToPdfCompletedHandler::create(Box::new(
        move |hr: windows::core::Result<()>, ok: bool| {
            let res = hr
                .map_err(|err| err.to_string())
                .and_then(|_| if ok { Ok(()) } else { Err("PrintToPdf 未成功".to_string()) });
            finish(&done_print, res);
            Ok(())
        },
    ));
    if let Err(err) = webview7.PrintToPdf(out_ptr, &settings, &handler) {
        finish(done, Err(e(err)));
    }
}

/// 静默把 `html` 打印为 `output` 指向的 PDF。阻塞直到完成或超时（在命令的 `spawn_blocking` 线程调用，不占主线程）。
pub fn export_pdf(app: &tauri::AppHandle, html: &str, output: &str) -> Result<(), String> {
    // 清理可能残留的同名窗口。
    if let Some(stale) = app.get_webview_window(LABEL) {
        let _ = stale.destroy();
    }

    let url = Url::parse("about:blank").map_err(|e| e.to_string())?;
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url))
        .title("PDF")
        .inner_size(900.0, 1200.0)
        .visible(false)
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())?;

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let done: Done = Arc::new(Mutex::new(Some(tx)));

    let html = html.to_string();
    let output = output.to_string();
    let done_cb = done.clone();

    win.with_webview(move |pw| {
        unsafe {
            let controller = pw.controller();
            let webview = match controller.CoreWebView2() {
                Ok(w) => w,
                Err(err) => return finish(&done_cb, Err(err.to_string())),
            };
            let env = pw.environment();

            // 在 NavigateToString 之前注册导航完成回调，确保捕获到本次加载。
            let webview_cb = webview.clone();
            let env_cb = env.clone();
            let done_nav = done_cb.clone();
            let nav_handler = NavigationCompletedEventHandler::create(Box::new(move |_sender, _args| {
                start_print(&webview_cb, &env_cb, &output, &done_nav);
                Ok(())
            }));
            let mut token = 0i64;
            if let Err(err) = webview.add_NavigationCompleted(&nav_handler, &mut token) {
                return finish(&done_cb, Err(err.to_string()));
            }

            let html_wide = wide(&html);
            if let Err(err) = webview.NavigateToString(PCWSTR(html_wide.as_ptr())) {
                finish(&done_cb, Err(err.to_string()));
            }
        }
    })
    .map_err(|e| e.to_string())?;

    let result = rx
        .recv_timeout(TIMEOUT)
        .map_err(|_| "导出 PDF 超时".to_string())?;
    let _ = win.destroy();
    result
}
