use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone)]
pub struct Node {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// 图片文件：在文档树里与 .md 并列显示，点击走预览而非当作文档打开。
    #[serde(default)]
    pub is_image: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<Node>>,
}

/// 内容级全文检索的单条命中：文件 + 1-based 行号 + 该行片段。
#[derive(Serialize, Clone)]
pub struct SearchHit {
    pub name: String,
    pub path: String,
    pub line: usize,
    pub snippet: String,
}

fn is_md(p: &Path) -> bool {
    p.extension()
        .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

#[cfg(windows)]
fn is_hidden_path(p: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN: u32 = 0x2;
    const SYSTEM: u32 = 0x4;
    if p.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(false) {
        return true;
    }
    match p.metadata() {
        Ok(m) => {
            let a = m.file_attributes();
            (a & HIDDEN) != 0 || (a & SYSTEM) != 0
        }
        Err(_) => false,
    }
}

#[cfg(not(windows))]
fn is_hidden_path(p: &Path) -> bool {
    p.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(false)
}

/// 递归扫描目录，目录在前、文件在后，仅保留 .md/.markdown 文件。
pub fn scan(dir: &Path) -> Vec<Node> {
    let Ok(rd) = fs::read_dir(dir) else { return Vec::new() };
    let mut entries: Vec<_> = rd.filter_map(|e| e.ok()).collect();
    entries.sort_by(|a, b| {
        let ad = a.path().is_dir();
        let bd = b.path().is_dir();
        bd.cmp(&ad).then(a.file_name().cmp(&b.file_name()))
    });

    let mut nodes = Vec::new();
    for e in entries {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if is_hidden_path(&p) {
            continue;
        }
        if p.is_dir() {
            nodes.push(Node {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir: true,
                is_image: false,
                children: Some(scan(&p)),
            });
        } else if is_md(&p) || is_image(&p) {
            let image = is_image(&p);
            nodes.push(Node {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir: false,
                is_image: image,
                children: None,
            });
        }
    }
    nodes
}

/// 文档编码：读时探测、写时原样回写，保证 GBK 老文件不被转成 UTF-8 而乱码。
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Encoding {
    #[serde(rename = "utf8")]
    Utf8,
    #[serde(rename = "utf8-bom")]
    Utf8Bom,
    #[serde(rename = "gbk")]
    Gbk,
}

/// 原子写的临时文件前缀：以 . 开头故不进文档树；监听器据此抑制「自己写自己」触发的全树重扫。
pub const TMP_PREFIX: &str = ".mwmd-tmp-";

/// 从字节探测编码并解码为正文。
/// 原则：宁可明确报错，也不静默产出整篇乱码或悄悄插入 U+FFFD；只有在能确认
/// 「UTF-8 只是夹了个别坏字节」时才用带替换的解码保住整篇中文。
pub fn decode(bytes: &[u8]) -> Result<(String, Encoding), String> {
    // 1) UTF-8 BOM：严格解码正文，坏字节直接报错（不用 from_utf8_lossy 蒙混过关）。
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let s = std::str::from_utf8(&bytes[3..])
            .map_err(|e| format!("文件带 UTF-8 BOM，但正文不是合法 UTF-8：{}", e))?;
        return Ok((s.to_string(), Encoding::Utf8Bom));
    }
    // 2) UTF-16 BOM：明确拒绝。若误按 GBK 解，偶数/奇数字节会被拆成两串乱码。
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return Err("文件为 UTF-16LE 编码，MWMD 暂不支持，请先用记事本另存为 UTF-8".into());
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return Err("文件为 UTF-16BE 编码，MWMD 暂不支持，请先用记事本另存为 UTF-8".into());
    }
    // 3) 严格 UTF-8 成功：最常见的情形。
    if let Ok(s) = std::str::from_utf8(bytes) {
        return Ok((s.to_string(), Encoding::Utf8));
    }
    // 4) 严格 UTF-8 失败：数一下 encoding_rs 的替换字符有多少。
    //    个别坏字节（≤2 个，或占比 <0.1%）说明文件本质是 UTF-8，必须按 UTF-8 处理，
    //    否则整篇中文会被 GBK 拆成乱码；大面积替换才是真正的 Windows 旧 GBK 文件。
    let (lossy, _, _) = encoding_rs::UTF_8.decode(bytes);
    let replaced = lossy.chars().filter(|&c| c == '\u{FFFD}').count();
    let total = lossy.chars().count();
    // 关键：U+FFFD 若来自 GBK 汉字，通常成对出现且周围再无其它非 ASCII 字符
    // （GBK "中abc" → 2 个替换符 + 纯 ASCII）；而 UTF-8 夹坏字节的文件，周围必有
    // 合法的 UTF-8 中文。故除阈值外，还要求「替换符 ≤1」或「存在有效非 ASCII 字符」，
    // 否则判 GBK。另加「有效字符至少占一半」挡住极短纯 GBK 单字（total=2、2 替换符）。
    let has_valid_non_ascii = lossy.chars().any(|c| !c.is_ascii() && c != '\u{FFFD}');
    let few_bad = (replaced <= 2 || (total > 0 && replaced * 1000 < total))
        && total >= replaced.saturating_mul(2)
        && (replaced <= 1 || has_valid_non_ascii);
    if few_bad {
        return Ok((lossy.into_owned(), Encoding::Utf8));
    }
    let (cow, _, _) = encoding_rs::GBK.decode(bytes);
    Ok((cow.into_owned(), Encoding::Gbk))
}

/// 按探测出的编码生成落盘字节，并报告「实际写入的编码 / 是否发生过提升」。
/// GBK 分支的关键：encoding_rs 的默认 encode() 会把不可映射字符（典型如 emoji 😀）
/// 替换成字面数字字符引用 `&#…;` 写进字节流，经前端 escape_html 后变成 `&amp;#…;`，
/// 字符永久丢失。这里用 encode() 的第三个返回值 had_unmappable 判定：
/// 一旦不可映射就整篇提升为 UTF-8（绝不写 NCR）；可映射时才用纯 GBK 字节回写。
fn encode(content: &str, enc: Encoding) -> (Vec<u8>, Encoding, bool) {
    match enc {
        Encoding::Utf8 => (content.as_bytes().to_vec(), Encoding::Utf8, false),
        Encoding::Utf8Bom => {
            let mut v = vec![0xEF, 0xBB, 0xBF];
            v.extend_from_slice(content.as_bytes());
            (v, Encoding::Utf8Bom, false)
        }
        Encoding::Gbk => {
            let (cow, _, had_unmappable) = encoding_rs::GBK.encode(content);
            if had_unmappable {
                (content.as_bytes().to_vec(), Encoding::Utf8, true)
            } else {
                (cow.into_owned(), Encoding::Gbk, false)
            }
        }
    }
}

/// 磁盘基线：mtime 毫秒 + 字节数。写前比对它即可发现外部修改，无需整份哈希。
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct DocStat {
    pub mtime_ms: u64,
    pub len: u64,
}

pub fn stat(path: &str) -> Result<DocStat, String> {
    let m = fs::metadata(path).map_err(|e| e.to_string())?;
    let mtime_ms = m
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    Ok(DocStat { mtime_ms, len: m.len() })
}

/// 保存结果：把新基线与「实际写入的编码 / 是否提升为 UTF-8」一并回给前端。
/// stat 用 serde(flatten) 展开，JSON 与 DocStat 一样是平铺的 mtime_ms/len（契约不变）。
#[derive(Serialize, Clone, Copy, Debug)]
pub struct DocSaveResult {
    #[serde(flatten)]
    pub stat: DocStat,
    pub encoding: Encoding,
    pub promoted: bool,
}

#[derive(Serialize, Clone)]
pub struct DocFile {
    pub content: String,
    pub encoding: Encoding,
    #[serde(flatten)]
    pub stat: DocStat,
}

pub fn read_doc(path: &str) -> Result<DocFile, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let (content, encoding) = decode(&bytes)?;
    Ok(DocFile { content, encoding, stat: stat(path)? })
}

/// 递归收集目录下全部 .md/.markdown 文件（跳过隐藏项），用于内容级检索。
fn collect_md(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.filter_map(|e| e.ok()) {
        let p = e.path();
        if is_hidden_path(&p) {
            continue;
        }
        if p.is_dir() {
            collect_md(&p, out);
        } else if is_md(&p) {
            out.push(p);
        }
    }
}

/// 在多个工作区根下做内容级全文检索：大小写不敏感子串匹配，逐行返回命中。
/// `limit` 为总命中上限，避免大工作区返回海量结果；纯本地、不联网。
pub fn search_content(roots: &[String], query: &str, limit: usize) -> Vec<SearchHit> {
    let q = query.trim().to_lowercase();
    if q.is_empty() || limit == 0 {
        return Vec::new();
    }
    let mut files = Vec::new();
    for r in roots {
        collect_md(Path::new(r), &mut files);
    }
    files.sort();

    let mut hits = Vec::new();
    for f in files {
        let Ok(bytes) = fs::read(&f) else { continue };
        // 探测失败（如 UTF-16）直接跳过该文件，避免把乱码塞进搜索结果。
        let Ok((content, _)) = decode(&bytes) else { continue };
        let name = f.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let path = f.to_string_lossy().to_string();
        for (i, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&q) {
                let trimmed = line.trim();
                let snippet: String = trimmed.chars().take(160).collect();
                hits.push(SearchHit { name: name.clone(), path: path.clone(), line: i + 1, snippet });
                if hits.len() >= limit {
                    return hits;
                }
            }
        }
    }
    hits
}

/// 可预览的图片扩展名：与 `pick_image` 的过滤器一致，另加 svg。
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
/// 单图字节上限：超过则不读入，避免把大图整份 base64 灌进界面（base64 还要再膨胀 1/3）。
const IMAGE_MAX_BYTES: u64 = 16 * 1024 * 1024;

fn is_image(p: &Path) -> bool {
    p.extension()
        .map(|e| IMAGE_EXTS.iter().any(|x| e.eq_ignore_ascii_case(x)))
        .unwrap_or(false)
}

/// 把本地图片读成 data URL。仅放行图片扩展名并限制体积，其余一律拒绝。
pub fn read_image(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    if !is_image(p) {
        return Err("仅支持图片文件预览".into());
    }
    let meta = p.metadata().map_err(|_| "图片不存在".to_string())?;
    if !meta.is_file() {
        return Err("图片不存在".into());
    }
    if meta.len() > IMAGE_MAX_BYTES {
        return Err(format!("图片过大（{} MB）", meta.len() / 1024 / 1024));
    }
    let bytes = fs::read(p).map_err(|e| e.to_string())?;
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let mime = match ext.as_str() {
        "svg" => "image/svg+xml",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, B64.encode(bytes)))
}

/// 原子保存：同目录临时文件写满并 sync_all 落盘后再 rename 覆盖，
/// 中途崩溃/断电只会留下一个隐藏临时文件，目标文件要么是旧内容要么是新内容，不会半截。
/// （注：仅对文件做 sync_all，未对父目录做 fsync——标准库无跨平台目录 fsync API，
/// 极端断电下目录项本身可能未落盘，此处不夸大保证。）
/// 权限在 rename **成功后**才设到目标路径：若先设在临时文件上，覆盖只读文件会失败。
/// 返回新基线 + 实际写入编码 + 是否因不可映射字符提升为 UTF-8。
pub fn save_doc(path: &str, content: &str, enc: Encoding) -> Result<DocSaveResult, String> {
    let p = Path::new(path);
    let dir = p.parent().filter(|d| !d.as_os_str().is_empty()).ok_or("无效路径")?;
    let name = p.file_name().ok_or("无效路径")?.to_string_lossy();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let tmp = dir.join(format!("{}{}-{}", TMP_PREFIX, name, nanos));
    let (bytes, actual_enc, promoted) = encode(content, enc);
    {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(&bytes).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    // 先记下原文件权限（Windows 目录项实际只保留只读位，不保留完整 DACL）；
    // rename 成功后再设回去，避免保存一次就改掉权限，也不会因 tmp 只读而覆盖失败。
    let old_perms = fs::metadata(p).ok().map(|m| m.permissions());
    fs::rename(&tmp, p).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    if let Some(perms) = old_perms {
        let _ = fs::set_permissions(p, perms);
    }
    let s = stat(path)?;
    Ok(DocSaveResult { stat: s, encoding: actual_enc, promoted })
}

/// 清理工作区下原子写崩溃残留的临时文件（mtime 超过 10 分钟）。
/// 10 分钟阈值远大于一次保存耗时，避免误删正在写入的临时文件；递归子目录（文档可在任意层级）。
pub fn clean_stale_tmps(roots: &[String]) {
    const MAX_AGE_SECS: u64 = 10 * 60;
    fn sweep(dir: &Path) {
        let Ok(rd) = fs::read_dir(dir) else { return };
        for entry in rd.filter_map(|e| e.ok()) {
            let p = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                if !is_hidden_path(&p) {
                    sweep(&p);
                }
                continue;
            }
            if !ft.is_file() || !entry.file_name().to_string_lossy().starts_with(TMP_PREFIX) {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            let Ok(modified) = meta.modified() else { continue };
            if let Ok(age) = modified.elapsed() {
                if age.as_secs() > MAX_AGE_SECS {
                    let _ = fs::remove_file(&p);
                }
            }
        }
    }
    for root in roots {
        sweep(Path::new(root));
    }
}

pub fn create_doc(path: &str) -> Result<(), String> {
    if Path::new(path).exists() {
        return Err("文件已存在".into());
    }
    fs::write(path, "").map_err(|e| e.to_string())
}

pub fn create_dir(path: &str) -> Result<(), String> {
    if Path::new(path).exists() {
        return Err("目录已存在".into());
    }
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

pub fn rename_path(old: &str, new: &str) -> Result<(), String> {
    if Path::new(new).exists() {
        return Err("目标已存在".into());
    }
    fs::rename(old, new).map_err(|e| e.to_string())
}

/// 删除 = 移入回收站（可撤销），不做不可逆的 remove_dir_all。
/// Windows 走 SHFileOperationW + FOF_ALLOWUNDO；pFrom 必须双 null 结尾。
/// UI 已二次确认，故加 FOF_NOCONFIRMATION 不再弹系统对话框。
pub fn delete_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err("文件不存在".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use winapi::um::shellapi::{SHFileOperationW, SHFILEOPSTRUCTW, FO_DELETE};
        // FOF_ALLOWUNDO=0x40 FOF_NOCONFIRMATION=0x10 FOF_NOERRORUI=0x400 FOF_SILENT=0x4
        // FOF_WANTNUKEWARNING=0x4000：万一大文件装不进回收站，弹确认而不是静默永久删除。
        const FLAGS: u16 = 0x40 | 0x10 | 0x400 | 0x4 | 0x4000;
        // Shell API 不接受 \\?\ 扩展长度前缀，须剥掉（UNC 的 \\?\UNC\ → \\），否则移入回收站失败。
        let raw = p.to_string_lossy();
        let stripped = raw.strip_prefix("\\\\?\\UNC\\").map(|s| format!("\\\\{}", s))
            .or_else(|| raw.strip_prefix("\\\\?\\").map(|s| s.to_string()))
            .unwrap_or_else(|| raw.into_owned());
        let mut wide: Vec<u16> = Path::new(&stripped).as_os_str().encode_wide().collect();
        wide.push(0);
        wide.push(0);
        let mut op: SHFILEOPSTRUCTW = unsafe { std::mem::zeroed() };
        op.wFunc = FO_DELETE as u32;
        op.pFrom = wide.as_ptr();
        op.fFlags = FLAGS;
        let rc = unsafe { SHFileOperationW(&mut op) };
        if rc != 0 || op.fAnyOperationsAborted != 0 {
            return Err(format!("移入回收站失败（代码 {}）", rc));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        if p.is_dir() {
            fs::remove_dir_all(p).map_err(|e| e.to_string())
        } else {
            fs::remove_file(p).map_err(|e| e.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("mwmd-search-{}-{}", tag, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn search_matches_lines_case_insensitively_with_line_numbers() {
        let root = temp_root("basic");
        fs::write(root.join("a.md"), "Hello World\nsecond LINE\nno match here\nworld again").unwrap();
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("sub").join("b.md"), "nothing\nWorld peace").unwrap();
        fs::write(root.join("ignore.txt"), "World in txt").unwrap();

        let roots = vec![root.to_string_lossy().to_string()];
        let hits = search_content(&roots, "world", 500);

        // 仅 .md 命中；大小写不敏感；行号 1-based；跨子目录
        assert_eq!(hits.len(), 3);
        assert!(hits.iter().all(|h| h.path.ends_with(".md")));
        let a: Vec<_> = hits.iter().filter(|h| h.name == "a.md").collect();
        assert_eq!(a.len(), 2);
        assert_eq!(a[0].line, 1);
        assert_eq!(a[1].line, 4);
        let b = hits.iter().find(|h| h.name == "b.md").unwrap();
        assert_eq!(b.line, 2);
        assert_eq!(b.snippet, "World peace");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn search_empty_query_and_limit_are_respected() {
        let root = temp_root("edge");
        fs::write(root.join("a.md"), "x\nx\nx\nx\nx").unwrap();
        let roots = vec![root.to_string_lossy().to_string()];

        assert!(search_content(&roots, "   ", 500).is_empty());
        assert_eq!(search_content(&roots, "x", 2).len(), 2);

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn read_image_encodes_data_url_and_refuses_non_images() {
        let root = temp_root("readimg");
        let png = root.join("p.png");
        fs::write(&png, [0x89u8, b'P', b'N', b'G']).unwrap();

        let url = read_image(&png.to_string_lossy()).unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
        // 已知答案向量：89 50 4E 47 -> iVBORw==
        assert!(url.ends_with("iVBORw=="));

        // 非图片扩展名一律拒绝（此命令不能用来读任意文件）
        let txt = root.join("secret.txt");
        fs::write(&txt, "top secret").unwrap();
        assert!(read_image(&txt.to_string_lossy()).is_err());
        assert!(read_image(&root.join("gone.png").to_string_lossy()).is_err());
        assert!(read_image(&root.to_string_lossy()).is_err());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn scan_lists_images_inside_their_own_folders() {
        let root = temp_root("scan-imgs");
        fs::create_dir_all(root.join("assets")).unwrap();
        fs::write(root.join("a.md"), "x").unwrap();
        fs::write(root.join("notes.txt"), "x").unwrap();
        fs::write(root.join("assets").join("p.png"), "x").unwrap();
        fs::write(root.join("assets").join("q.jpg"), "x").unwrap();

        let top = scan(&root);
        // 目录在前、文件在后；.txt 仍不进树
        let shape: Vec<_> = top.iter().map(|n| (n.name.as_str(), n.is_dir, n.is_image)).collect();
        assert_eq!(shape, vec![("assets", true, false), ("a.md", false, false)]);

        // 图片在**它自己的文件夹节点下**，不是被抽到别处的平铺列表
        let kids = top[0].children.clone().unwrap();
        assert_eq!(kids.len(), 2);
        assert!(kids.iter().all(|n| !n.is_dir && n.is_image));
        assert_eq!(kids[0].name, "p.png");
        assert_eq!(kids[1].name, "q.jpg");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn encoding_roundtrip_utf8_bom_and_gbk() {
        let root = temp_root("enc");
        let s = |p: &Path| p.to_string_lossy().to_string();

        let utf8 = root.join("u.md");
        fs::write(&utf8, "中文abc").unwrap();
        let d = read_doc(&s(&utf8)).unwrap();
        assert_eq!(d.encoding, Encoding::Utf8);
        assert_eq!(d.content, "中文abc");

        let bom = root.join("b.md");
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("中文abc".as_bytes());
        fs::write(&bom, &bytes).unwrap();
        let d = read_doc(&s(&bom)).unwrap();
        assert_eq!(d.encoding, Encoding::Utf8Bom);
        assert_eq!(d.content, "中文abc", "BOM 不应进入正文");
        save_doc(&s(&bom), &d.content, d.encoding).unwrap();
        assert!(fs::read(&bom).unwrap().starts_with(&[0xEF, 0xBB, 0xBF]), "回写须保留 BOM");

        let gbk = root.join("g.md");
        let (cow, _, _) = encoding_rs::GBK.encode("中文abc");
        fs::write(&gbk, cow.into_owned()).unwrap();
        let d = read_doc(&s(&gbk)).unwrap();
        assert_eq!(d.encoding, Encoding::Gbk);
        assert_eq!(d.content, "中文abc");
        let st = save_doc(&s(&gbk), "中文abc改", d.encoding).unwrap();
        let raw = fs::read(&gbk).unwrap();
        assert!(std::str::from_utf8(&raw).is_err(), "GBK 文件不得被转成 UTF-8");
        let (back, enc) = decode(&raw).unwrap();
        assert_eq!(enc, Encoding::Gbk);
        assert_eq!(back, "中文abc改");
        assert_eq!(st.stat.len, raw.len() as u64);

        assert!(read_doc(&s(&root.join("gone.md"))).is_err());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn save_is_atomic_and_leaves_no_temp() {
        let root = temp_root("atomic");
        let f = root.join("a.md");
        fs::write(&f, "old").unwrap();
        let st = save_doc(&f.to_string_lossy(), "new", Encoding::Utf8).unwrap();
        assert_eq!(fs::read_to_string(&f).unwrap(), "new");
        assert_eq!(st.stat.len, 3);
        assert_eq!(stat(&f.to_string_lossy()).unwrap(), st.stat, "返回基线须与落盘一致");
        let leftovers: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with(TMP_PREFIX))
            .collect();
        assert!(leftovers.is_empty(), "原子写不得留下临时文件");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn gbk_save_promotes_unmappable_to_utf8_without_writing_ncr() {
        let root = temp_root("gbk-promo");
        let f = root.join("emoji.md");
        let path = f.to_string_lossy().to_string();
        // 先造一个真 GBK 文件并确认探测为 Gbk。
        let (gbk_bytes, _, _) = encoding_rs::GBK.encode("中文");
        fs::write(&f, gbk_bytes.into_owned()).unwrap();
        let d = read_doc(&path).unwrap();
        assert_eq!(d.encoding, Encoding::Gbk);

        // 写入含 emoji 的内容：GBK 无法表示 → 必须整篇提升为 UTF-8 落盘。
        let res = save_doc(&path, "中文😀abc", d.encoding).unwrap();
        assert_eq!(res.encoding, Encoding::Utf8, "提升后回报的编码须是 Utf8");
        assert!(res.promoted, "不可映射字符必须触发提升标记");

        let raw = fs::read(&f).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("&#"), "绝不允许把不可映射字符写成字面 NCR");
        let (back, enc) = decode(&raw).unwrap();
        assert_eq!(enc, Encoding::Utf8);
        assert_eq!(back, "中文😀abc", "内容必须逐字保真");

        // 普通纯中文 GBK 仍保持 Gbk、不提升。
        let res2 = save_doc(&path, "纯中文abc", Encoding::Gbk).unwrap();
        assert_eq!(res2.encoding, Encoding::Gbk);
        assert!(!res2.promoted, "可映射内容不应提升");
        let raw2 = fs::read(&f).unwrap();
        assert!(std::str::from_utf8(&raw2).is_err(), "GBK 文件不得被转成 UTF-8");
        let (back2, enc2) = decode(&raw2).unwrap();
        assert_eq!(enc2, Encoding::Gbk);
        assert_eq!(back2, "纯中文abc");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn decode_detects_bom_utf8_utf16_bad_bytes_and_gbk() {
        // ① 纯 UTF-8
        assert_eq!(decode("中文abc".as_bytes()).unwrap(), ("中文abc".to_string(), Encoding::Utf8));

        // ② 带 BOM 的 UTF-8
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice("中文abc".as_bytes());
        assert_eq!(decode(&bom).unwrap(), ("中文abc".to_string(), Encoding::Utf8Bom));

        // ③ UTF-8 中间塞 1 个非法字节：不得整篇按 GBK 解，中文必须仍正确。
        let mut bad = "中文abc测试".as_bytes().to_vec();
        bad.insert(6, 0xFF); // 插在 "中文" 之后的 ASCII 边界
        let (s, enc) = decode(&bad).unwrap();
        assert_eq!(enc, Encoding::Utf8, "个别坏字节不应误判为 GBK");
        assert!(s.contains("中文"), "整篇中文不得乱码");
        assert!(s.contains("abc"));
        assert!(s.contains("测试"));

        // ④ UTF-16 BOM 必须明确报错，绝不按 GBK 解出乱码。
        assert!(decode(&[0xFF, 0xFE, b'a', 0x00]).is_err());
        assert!(decode(&[0xFE, 0xFF, 0x00, b'a']).is_err());

        // ⑤ 真 GBK 文件仍能正确解码（含极短单字，不能被误判为 UTF-8 夹坏字节）。
        let (gbk, _, _) = encoding_rs::GBK.encode("中文abc");
        assert_eq!(decode(&gbk).unwrap(), ("中文abc".to_string(), Encoding::Gbk));
        let (one_gbk, _, _) = encoding_rs::GBK.encode("中");
        assert_eq!(decode(&one_gbk).unwrap(), ("中".to_string(), Encoding::Gbk));
        // QA 回归：GBK 单汉字 + ASCII（2 个替换符）不得被判成 UTF-8(lossy)，
        // 否则「中」变 U+FFFD，自动保存会把损坏永久写盘。
        let (gbk_mix, _, _) = encoding_rs::GBK.encode("中abc");
        assert_eq!(decode(&gbk_mix).unwrap(), ("中abc".to_string(), Encoding::Gbk));
        let long = "a".repeat(500) + "中" + &"a".repeat(500);
        let (gbk_long, _, _) = encoding_rs::GBK.encode(&long);
        assert_eq!(decode(&gbk_long).unwrap(), (long, Encoding::Gbk));

        // BOM 后正文非法也必须报错，不能静默插 U+FFFD。
        let mut bad_bom = vec![0xEF, 0xBB, 0xBF];
        bad_bom.extend_from_slice(&[0xFF, 0xFE]);
        assert!(decode(&bad_bom).is_err());
    }
}
