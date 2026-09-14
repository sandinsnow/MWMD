import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  bold: (
    <>
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </>
  ),
  italic: (
    <>
      <line x1="18" y1="5" x2="10" y2="5" />
      <line x1="14" y1="19" x2="6" y2="19" />
      <line x1="14.5" y1="5" x2="9.5" y2="19" />
    </>
  ),
  strike: (
    <>
      <path d="M7 7c0-1.6 2.2-2.6 5-2.6s5 1 5 2.6c0 .9-.5 1.6-1.4 2.1" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <path d="M7.5 16.5C8 18 10 19 12.5 19s4.8-1 4.8-2.6c0-.9-.5-1.6-1.4-2.1" />
    </>
  ),
  code: (
    <>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </>
  ),
  codeblock: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <polyline points="10 10 8 12 10 14" />
      <polyline points="14 10 16 12 14 14" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>
  ),
  quote: (
    <>
      <path d="M6 4v16" />
      <path d="M10 7h9" />
      <path d="M10 12h9" />
      <path d="M10 17h6" />
    </>
  ),
  ul: (
    <>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.8" cy="6" r="1.2" />
      <circle cx="4.8" cy="12" r="1.2" />
      <circle cx="4.8" cy="18" r="1.2" />
    </>
  ),
  ol: (
    <>
      <line x1="10" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="18" x2="20" y2="18" />
      <path d="M4 5h1.2v3.2M4 8.2h2.4" />
      <path d="M4 11h2.2v1.6L4.2 14h2.2" />
      <path d="M4 16.6h2.2V18H4.6v1.2h1.8v1.2H4" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 9.5h18M3 15h18M9.5 9.5V20M15 9.5V20" />
    </>
  ),
  hr: (
    <>
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="7" x2="20" y2="7" opacity="0.35" />
      <line x1="4" y1="17" x2="20" y2="17" opacity="0.35" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <polyline points="21 16 16 11 6 20" />
    </>
  ),
  font: (
    <>
      <polyline points="4 7 4 5 20 5 20 7" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="9" y1="19" x2="15" y2="19" />
    </>
  ),
  alignLeft: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="11" x2="15" y2="11" />
      <line x1="4" y1="16" x2="18" y2="16" />
    </>
  ),
  alignCenter: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="7" y1="11" x2="17" y2="11" />
      <line x1="5" y1="16" x2="19" y2="16" />
    </>
  ),
  alignRight: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="9" y1="11" x2="20" y2="11" />
      <line x1="6" y1="16" x2="20" y2="16" />
    </>
  ),
  heading: (
    <>
      <path d="M6 5v14M18 5v14M6 12h12" />
    </>
  ),
  file: (
    <>
      <path d="M14 3v5h5" />
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    </>
  ),
  filePlus: (
    <>
      <path d="M14 3v5h5" />
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <line x1="12" y1="12" x2="12" y2="18" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  folderPlus: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <polyline points="7 10 12 15 17 10" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  printer: (
    <>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </>
  ),
  palette: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="9.5" r="1.2" />
      <circle cx="14.5" cy="9" r="1.2" />
      <circle cx="9.5" cy="14.5" r="1.2" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <line x1="8" y1="20.5" x2="16" y2="20.5" />
      <line x1="12" y1="16.5" x2="12" y2="20.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2.5" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="21.5" />
      <line x1="2.5" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="21.5" y2="12" />
      <line x1="5.2" y1="5.2" x2="7" y2="7" />
      <line x1="17" y1="17" x2="18.8" y2="18.8" />
      <line x1="5.2" y1="18.8" x2="7" y2="17" />
      <line x1="17" y1="7" x2="18.8" y2="5.2" />
    </>
  ),
  moon: <path d="M20.5 12.8A8.5 8.5 0 1 1 11.2 3.5a6.6 6.6 0 0 0 9.3 9.3z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <line x1="12" y1="7.8" x2="12.01" y2="7.8" />
    </>
  ),
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 4 19.5l1-3.5z" />
    </>
  ),
  trash: (
    <>
      <polyline points="3.5 6 5.5 6 20.5 6" />
      <path d="M18.5 6l-1 14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2l-1-14" />
      <path d="M9.5 6V4.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V6" />
      <line x1="10.5" y1="10.5" x2="10.5" y2="16.5" />
      <line x1="13.5" y1="10.5" x2="13.5" y2="16.5" />
    </>
  ),
  minusCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  chevronDown: <polyline points="6 9.5 12 15.5 18 9.5" />,
  chevronRight: <polyline points="9.5 6 15.5 12 9.5 18" />,
  chevronLeft: <polyline points="14.5 6 8.5 12 14.5 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </>
  ),
  check: <polyline points="20 6.5 9 17.5 4 12.5" />,
  winMin: <line x1="5" y1="12" x2="19" y2="12" />,
  winMax: <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />,
  winClose: (
    <>
      <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
      <line x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
    </>
  ),
};

export type IconName = keyof typeof P;

interface Props {
  name: IconName;
  size?: number;
  filled?: boolean;
}

export default function Icon({ name, size = 16, filled = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}
