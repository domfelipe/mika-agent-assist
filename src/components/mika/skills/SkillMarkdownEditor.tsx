"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown as markdownLang } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";

interface Props {
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
}

// Light theme — matches Mika design system
const mikaLight = EditorView.theme({
  "&": { backgroundColor: "var(--color-card)", color: "var(--color-foreground)" },
  ".cm-content": { caretColor: "var(--color-primary)" },
  ".cm-activeLine": { backgroundColor: "var(--color-muted)" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "oklch(0.70 0.19 47 / 0.25) !important" },
  ".cm-gutters": { backgroundColor: "var(--color-card)", borderRight: "1px solid var(--color-border)" },
});

export default function SkillMarkdownEditor({ value, onChange, readOnly = false }: Props) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const check = () => setIsDark(html.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const extensions = useMemo(
    () => [markdownLang(), EditorView.lineWrapping],
    [],
  );

  const handleChange = useCallback(
    (val: string) => onChange(val),
    [onChange],
  );

  return (
    <CodeMirror
      value={value}
      onChange={handleChange}
      extensions={extensions}
      theme={isDark ? oneDark : mikaLight}
      readOnly={readOnly}
      height="100%"
      minHeight="300px"
      maxHeight="80vh"
      className="text-sm"
    />
  );
}
