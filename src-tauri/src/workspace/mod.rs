use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone)]
pub struct Node {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
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
                children: Some(scan(&p)),
            });
        } else if is_md(&p) {
            nodes.push(Node {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
            });
        }
    }
    nodes
}

pub fn read_doc(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
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
        let Ok(content) = fs::read_to_string(&f) else { continue };
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

pub fn save_doc(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
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

pub fn delete_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
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
}
