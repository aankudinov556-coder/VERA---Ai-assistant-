import DOMPurify from "dompurify";
import { marked } from "marked";
import { memo, useMemo } from "react";
import { openTarget } from "../scenarios/host";

marked.setOptions({ gfm: true, breaks: true });

/** Ответы модели с форматированием (списки, код, таблицы); HTML очищается от опасного. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false }) as string), [text]);
  return (
    <div
      className="md"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a?.href) return;
        e.preventDefault();
        openTarget(a.href).catch(() => {});
      }}
    />
  );
});
