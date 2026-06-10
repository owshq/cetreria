import { useState } from 'react';
import { resolveConceptEmoji } from '@shared/types';
import EmojiPicker from '@/components/EmojiPicker';
import { useInvoiceConceptSettings } from '@/context/InvoiceConceptSettingsContext';
import { cx } from '@/lib/cx';
import styles from './ConceptEmojiEditor.module.css';

type ConceptEmojiEditorProps = {
  normalizedKey: string;
  description: string;
  editable: boolean;
};

export default function ConceptEmojiEditor({
  normalizedKey,
  description,
  editable,
}: ConceptEmojiEditorProps) {
  const { settings, upsertEmoji } = useInvoiceConceptSettings();
  const [saving, setSaving] = useState(false);
  const emoji = resolveConceptEmoji(normalizedKey, settings);

  const handleChange = async (nextEmoji: string) => {
    if (!editable || nextEmoji === emoji) return;
    setSaving(true);
    try {
      await upsertEmoji(normalizedKey, nextEmoji);
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return (
      <span className={styles.emojiStatic} aria-hidden>
        {emoji}
      </span>
    );
  }

  return (
    <div className={cx(styles.emojiEditor, saving && styles.emojiEditorSaving)}>
      <EmojiPicker
        value={emoji}
        onChange={handleChange}
        ariaLabel={`Emoji del concepto ${description}`}
        placement="top"
        variant="compact"
      />
    </div>
  );
}
