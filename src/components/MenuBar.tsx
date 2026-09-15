import { useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";
import { tr, type Lang } from "../i18n";

export interface ThemeMeta {
  id: string;
  name_zh: string;
  name_en: string;
  category: string;
}

interface Props {
  lang: Lang;
  themes: ThemeMeta[];
  theme: string;
  editorTheme: "light" | "dark" | "system";
  uiFont: string;
  uiSize: number;
  onNewFile: () => void;
  onNewFolder: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onCopy: () => void;
  onExportHtml: () => void;
  onExportPdf: () => void;
  onTheme: (id: string) => void;
  onThemeEditor: () => void;
  customThemes: { id: string; name_zh: string; name_en: string }[];
  onEditorTheme: (v: "light" | "dark" | "system") => void;
  onUiFont: (v: string) => void;
  onUiSize: (v: number) => void;
  onLang: (l: Lang) => void;
  onHelp: () => void;
  onCheckUpdate: () => void;
  onAbout: () => void;
}

const UI_FONTS: { value: string; key: string }[] = [
  { value: "sans", key: "fontSans" },
  { value: "serif", key: "fontSerif" },
  { value: "mono", key: "fontMono" },
];
const UI_SIZES = [12, 13, 14, 15, 16];

type MenuKey = "file" | "view" | "help" | null;

export default function MenuBar(p: Props) {
  const [open, setOpen] = useState<MenuKey>(null);
  const root = useRef<HTMLDivElement>(null);
  const t = (k: string) => tr(p.lang, k);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (k: Exclude<MenuKey, null>) => setOpen((o) => (o === k ? null : k));
  const act = (fn: () => void) => () => {
    setOpen(null);
    fn();
  };

  const Item = ({ icon, label, onClick }: { icon?: IconName; label: string; onClick: () => void }) => (
    <button className="menu-item" onClick={onClick}>
      <span className="menu-ico">{icon ? <Icon name={icon} size={15} /> : null}</span>
      <span className="menu-label">{label}</span>
    </button>
  );

  const Radio = ({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) => (
    <button className={"menu-item radio" + (checked ? " checked" : "")} onClick={onClick}>
      <span className="menu-ico">{checked ? <Icon name="check" size={14} /> : null}</span>
      <span className="menu-label">{label}</span>
    </button>
  );

  const GroupTitle = ({ label }: { label: string }) => <div className="menu-group-title">{label}</div>;
  const Sep = () => <div className="menu-sep" />;

  const themeItem = (th: ThemeMeta) => (
    <Radio
      key={th.id}
      label={p.lang === "zh" ? th.name_zh : th.name_en}
      checked={p.theme === th.id}
      onClick={() => p.onTheme(th.id)}
    />
  );
  const colorThemes = p.themes.filter((th) => th.category !== "publish");
  const publishThemes = p.themes.filter((th) => th.category === "publish");

  return (
    <div className="menus" ref={root}>
      <div className="menu">
        <button className={"menu-top" + (open === "file" ? " open" : "")} onClick={() => toggle("file")}>
          {t("menuFile")}
        </button>
        {open === "file" && (
          <div className="menu-drop">
            <Item icon="filePlus" label={t("miNewFile")} onClick={act(p.onNewFile)} />
            <Item icon="folderPlus" label={t("miNewFolder")} onClick={act(p.onNewFolder)} />
            <Sep />
            <Item icon="file" label={t("miOpenFile")} onClick={act(p.onOpenFile)} />
            <Item icon="folder" label={t("miOpenFolder")} onClick={act(p.onOpenFolder)} />
            <Sep />
            <Item icon="save" label={t("miSave")} onClick={act(p.onSave)} />
            <Item icon="copy" label={t("miCopy")} onClick={act(p.onCopy)} />
            <Sep />
            <Item icon="download" label={t("miExportHtml")} onClick={act(p.onExportHtml)} />
            <Item icon="printer" label={t("miExportPdf")} onClick={act(p.onExportPdf)} />
          </div>
        )}
      </div>

      <div className="menu">
        <button className={"menu-top" + (open === "view" ? " open" : "")} onClick={() => toggle("view")}>
          {t("menuView")}
        </button>
        {open === "view" && (
          <div className="menu-drop wide">
            <GroupTitle label={t("grpThemeColor")} />
            {colorThemes.map(themeItem)}
            <Sep />
            <GroupTitle label={t("grpThemePublish")} />
            {publishThemes.map(themeItem)}
            {p.customThemes.length > 0 && (
              <>
                <Sep />
                <GroupTitle label={t("grpThemeCustom")} />
                {p.customThemes.map((ct) =>
                  themeItem({ id: "custom:" + ct.id, name_zh: ct.name_zh, name_en: ct.name_en, category: "custom" })
                )}
              </>
            )}
            <Sep />
            <Item icon="palette" label={t("miThemeEditor")} onClick={act(p.onThemeEditor)} />
            <Sep />
            <GroupTitle label={t("grpUiFont")} />
            {UI_FONTS.map((f) => (
              <Radio
                key={f.value}
                label={t(f.key)}
                checked={p.uiFont === f.value}
                onClick={() => p.onUiFont(f.value)}
              />
            ))}
            <Sep />
            <GroupTitle label={t("grpUiSize")} />
            {UI_SIZES.map((s) => (
              <Radio
                key={s}
                label={`${s}px`}
                checked={p.uiSize === s}
                onClick={() => p.onUiSize(s)}
              />
            ))}
            <Sep />
            <GroupTitle label={t("grpEditorTheme")} />
            <Radio label={t("editorLight")} checked={p.editorTheme === "light"} onClick={() => p.onEditorTheme("light")} />
            <Radio label={t("editorDark")} checked={p.editorTheme === "dark"} onClick={() => p.onEditorTheme("dark")} />
            <Radio label={t("editorSystem")} checked={p.editorTheme === "system"} onClick={() => p.onEditorTheme("system")} />
            <Sep />
            <GroupTitle label={t("grpLanguage")} />
            <Radio label="中文" checked={p.lang === "zh"} onClick={() => p.onLang("zh")} />
            <Radio label="English" checked={p.lang === "en"} onClick={() => p.onLang("en")} />
          </div>
        )}
      </div>

      <div className="menu">
        <button className={"menu-top" + (open === "help" ? " open" : "")} onClick={() => toggle("help")}>
          {t("menuHelp")}
        </button>
        {open === "help" && (
          <div className="menu-drop">
            <Item icon="info" label={t("miMarkdownSyntax")} onClick={act(p.onHelp)} />
            <Sep />
            <Item icon="download" label={t("miCheckUpdate")} onClick={act(p.onCheckUpdate)} />
          </div>
        )}
      </div>

      <div className="menu">
        <button className="menu-top" onClick={p.onAbout}>
          {t("menuAbout")}
        </button>
      </div>
    </div>
  );
}
