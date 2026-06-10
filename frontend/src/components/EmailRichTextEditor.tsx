import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  Underline,
} from 'lucide-react';
import { plainTextToHtml } from '@/lib/emailHtml';
import styles from './EmailComposeModal.module.css';

const FONT_OPTIONS = [
  { label: 'Sans Serif', value: 'Segoe UI, Arial, sans-serif' },
  { label: 'Serif', value: 'Georgia, Times New Roman, serif' },
  { label: 'Monoespaciada', value: 'Consolas, Courier New, monospace' },
];

type EmailRichTextEditorProps = {
  id: string;
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
};

function normalizeEditorHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed === '<br>') return '';
  return html;
}

export default function EmailRichTextEditor({
  id,
  value,
  onChange,
  disabled = false,
}: EmailRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value);
  const lastExternalValue = useRef<string | null>(null);

  const syncFromEditor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = normalizeEditorHtml(el.innerHTML);
    lastExternalValue.current = html;
    onChange(html);
  }, [onChange]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || value === lastExternalValue.current) return;
    lastExternalValue.current = value;
    el.innerHTML = plainTextToHtml(value);
  }, [value]);

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const exec = (command: string, commandValue?: string) => {
    if (disabled) return;
    focusEditor();
    document.execCommand(command, false, commandValue);
    syncFromEditor();
  };

  const handleFontChange = (nextFont: string) => {
    setFontFamily(nextFont);
    exec('fontName', nextFont);
  };

  const handleInsertLink = () => {
    if (disabled) return;
    focusEditor();
    const url = window.prompt('URL del enlace:', 'https://');
    if (!url) return;
    exec('createLink', url.trim());
  };

  return (
    <div className={styles.editorWrap}>
      <div
        id={id}
        ref={editorRef}
        className={styles.editor}
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-labelledby="email-compose-title"
        suppressContentEditableWarning
        onInput={syncFromEditor}
        onBlur={syncFromEditor}
      />

      <div className={styles.formatBar}>
        <select
          className={styles.formatSelect}
          value={fontFamily}
          onChange={(event) => handleFontChange(event.target.value)}
          disabled={disabled}
          aria-label="Tipo de letra"
        >
          {FONT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <span className={styles.formatDivider} aria-hidden />

        <button
          type="button"
          className={styles.formatBtn}
          onClick={() => exec('bold')}
          disabled={disabled}
          title="Negrita"
          aria-label="Negrita"
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className={styles.formatBtn}
          onClick={() => exec('italic')}
          disabled={disabled}
          title="Cursiva"
          aria-label="Cursiva"
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          className={styles.formatBtn}
          onClick={() => exec('underline')}
          disabled={disabled}
          title="Subrayado"
          aria-label="Subrayado"
        >
          <Underline size={15} />
        </button>

        <span className={styles.formatDivider} aria-hidden />

        <button
          type="button"
          className={styles.formatBtn}
          onClick={() => exec('justifyLeft')}
          disabled={disabled}
          title="Alinear izquierda"
          aria-label="Alinear izquierda"
        >
          <AlignLeft size={15} />
        </button>
        <button
          type="button"
          className={styles.formatBtn}
          onClick={() => exec('justifyCenter')}
          disabled={disabled}
          title="Centrar"
          aria-label="Centrar"
        >
          <AlignCenter size={15} />
        </button>
        <button
          type="button"
          className={styles.formatBtn}
          onClick={() => exec('justifyRight')}
          disabled={disabled}
          title="Alinear derecha"
          aria-label="Alinear derecha"
        >
          <AlignRight size={15} />
        </button>

        <span className={styles.formatDivider} aria-hidden />

        <button
          type="button"
          className={styles.formatBtn}
          onClick={handleInsertLink}
          disabled={disabled}
          title="Insertar enlace"
          aria-label="Insertar enlace"
        >
          <Link2 size={15} />
        </button>
      </div>
    </div>
  );
}
