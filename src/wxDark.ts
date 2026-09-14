// 微信深色模式预览·进阶版：对预览 HTML 的内联颜色做 mp-darkmode 风格映射。
// 仅用于屏幕预览——复制/导出走 Rust 从 md 重新渲染，绝不经过这里，故输出 HTML 不受影响。

type RGBA = [number, number, number, number];

function parseRgb(c: string): RGBA | null {
  const s = c.trim();
  let m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if (p.length >= 3) return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b, a];
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const conv = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(conv(h + 1 / 3) * 255),
    Math.round(conv(h) * 255),
    Math.round(conv(h - 1 / 3) * 255),
  ];
}

// 前景色（文字/边框）：目标是「在深色画布上始终可读」。
// 深色文字（浅底上的正文）→ 翻亮；本就浅色的文字（强调色块上的白字）→ 保持浅，
// 避免纯反相把白字变黑、与压暗后的色块底失去对比。
function mapForeground(c: string): string {
  const rgba = parseRgb(c);
  if (!rgba) return c;
  const [r, g, b, a] = rgba;
  const [h, s, l] = rgbToHsl(r, g, b);
  const nl = l > 0.5 ? Math.min(0.92, l) : Math.max(0.6, 1 - l);
  const [nr, ng, nb] = hslToRgb(h, s * 0.9, nl);
  return a < 1 ? `rgba(${nr}, ${ng}, ${nb}, ${a})` : `rgb(${nr}, ${ng}, ${nb})`;
}

// 背景色：浅底→统一压暗（保留微弱色相差异），已是深色/强调色的底→进一步压暗但不翻亮，
// 避免「深色代码块被反相成亮块」这类失真。
function mapBackground(c: string): string {
  const rgba = parseRgb(c);
  if (!rgba) return c;
  const [r, g, b, a] = rgba;
  const [h, s, l] = rgbToHsl(r, g, b);
  const nl = l > 0.5 ? 0.12 + (1 - l) * 0.16 : l * 0.55 + 0.05;
  const [nr, ng, nb] = hslToRgb(h, s * 0.8, nl);
  return a < 1 ? `rgba(${nr}, ${ng}, ${nb}, ${a})` : `rgb(${nr}, ${ng}, ${nb})`;
}

const FG_PROPS = [
  "color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
];
const BG_PROPS = ["background-color"];

// 遍历片段内每个元素的内联颜色属性并重映射；结构、图片、非颜色样式保持不变。
export function toWxDark(fragmentHtml: string): string {
  if (!fragmentHtml) return fragmentHtml;
  const doc = new DOMParser().parseFromString(`<div id="__wxd">${fragmentHtml}</div>`, "text/html");
  const root = doc.getElementById("__wxd");
  if (!root) return fragmentHtml;
  root.querySelectorAll("*").forEach((el) => {
    const he = el as HTMLElement;
    for (const prop of FG_PROPS) {
      const v = he.style.getPropertyValue(prop);
      if (v) he.style.setProperty(prop, mapForeground(v));
    }
    for (const prop of BG_PROPS) {
      const v = he.style.getPropertyValue(prop);
      if (v) he.style.setProperty(prop, mapBackground(v));
    }
  });
  return root.innerHTML;
}
