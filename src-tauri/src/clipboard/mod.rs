use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::ptr;

use winapi::shared::minwindef::UINT;
use winapi::um::winbase::{GlobalAlloc, GlobalLock, GlobalUnlock};
use winapi::um::winnt::HANDLE;
use winapi::um::winuser::{
    CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    CF_UNICODETEXT,
};

const GMEM_MOVEABLE: UINT = 0x0002;

fn to_wide_null(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

fn utf16le_null(s: &str) -> Vec<u8> {
    let mut b = Vec::new();
    for w in to_wide_null(s) {
        b.extend_from_slice(&w.to_le_bytes());
    }
    b
}

/// 按 Windows "HTML Format"(CF_HTML) 规范构造字节流。
fn build_cf_html(fragment: &str) -> Vec<u8> {
    let pre = "<html><body>\r\n<!--StartFragment-->";
    let post = "<!--EndFragment-->\r\n</body></html>";

    let header_len = "Version:0.9\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:0000000000\r\nEndFragment:0000000000\r\n".len();
    let start_html = header_len;
    let start_fragment = header_len + pre.len();
    let end_fragment = start_fragment + fragment.len();
    let end_html = end_fragment + post.len();

    let header = format!(
        "Version:0.9\r\nStartHTML:{:010}\r\nEndHTML:{:010}\r\nStartFragment:{:010}\r\nEndFragment:{:010}\r\n",
        start_html, end_html, start_fragment, end_fragment
    );

    let mut out = Vec::with_capacity(header.len() + pre.len() + fragment.len() + post.len() + 1);
    out.extend_from_slice(header.as_bytes());
    out.extend_from_slice(pre.as_bytes());
    out.extend_from_slice(fragment.as_bytes());
    out.extend_from_slice(post.as_bytes());
    out.push(0);
    out
}

unsafe fn set_format(format: UINT, bytes: &[u8]) -> bool {
    let h = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
    if h.is_null() {
        return false;
    }
    let p = GlobalLock(h);
    if p.is_null() {
        return false;
    }
    ptr::copy_nonoverlapping(bytes.as_ptr(), p as *mut u8, bytes.len());
    GlobalUnlock(h);
    !SetClipboardData(format, h as HANDLE).is_null()
}

/// 把内联样式 HTML 片段写入剪贴板（CF_HTML + CF_UNICODETEXT 兜底）。
pub fn copy_html(fragment: &str, plain: &str) -> Result<(), String> {
    let cf_html = build_cf_html(fragment);
    unsafe {
        // 剪贴板可能正被其它进程短暂占用，重试若干次再放弃（否则表现为“点了没反应”）。
        let mut opened = false;
        for _ in 0..15 {
            if OpenClipboard(ptr::null_mut()) != 0 {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        if !opened {
            return Err("OpenClipboard 失败".into());
        }
        EmptyClipboard();
        let html_fmt = RegisterClipboardFormatW(to_wide_null("HTML Format").as_ptr());
        if html_fmt == 0 {
            CloseClipboard();
            return Err("RegisterClipboardFormatW 失败".into());
        }
        let ok_html = set_format(html_fmt, &cf_html);
        let ok_text = set_format(CF_UNICODETEXT as UINT, &utf16le_null(plain));
        CloseClipboard();
        if ok_html && ok_text {
            Ok(())
        } else {
            Err("SetClipboardData 失败".into())
        }
    }
}
