// 自替换式更新（MVP 阶段）：检查 GitHub Releases 的最新版本、比对版本号、引导用户到下载页。
// 纯前端 fetch（WebView2 运行时联网），不新增任何 Rust 依赖；完整的下载+校验+自替换留待 Release 硬化阶段（SPEC §7）。
// 走 GitHub REST API（api.github.com，CORS 友好 ACAO:*）而非 release 资产直链——后者会 302 跳到 CDN，
// 浏览器 fetch 常因缺 CORS 头失败。CI 仍额外发布 latest.json，供后续 Rust 端自替换更新器（无 CORS 限制）读取。
export const REPO = "sandinsnow/MWMD";
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface LatestInfo {
  version: string;
  url?: string;
  notes?: string;
}

// 逐段数值比较：a>b → 1，a<b → -1，相等 → 0。非数字段按 0 处理，长度不齐补 0。
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export async function fetchLatest(): Promise<LatestInfo> {
  // Accept: application/json 属 CORS 安全头，不触发预检 → 简单 GET。
  const res = await fetch(API_LATEST, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const tag = String(j?.tag_name ?? "");
  const assets: { name?: string; browser_download_url?: string }[] = Array.isArray(j?.assets) ? j.assets : [];
  const exe = assets.find((a) => a?.name === "MWMD.exe");
  return { version: tag.replace(/^v/, ""), url: exe?.browser_download_url, notes: j?.body ?? undefined };
}

