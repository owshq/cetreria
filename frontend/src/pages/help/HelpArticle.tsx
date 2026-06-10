import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import type { HelpBlock, HelpStep, HelpTopic } from './helpTopics';
import { visibleHelpBlocks } from './helpTopics';
import styles from '../Help.module.css';

function StepList({ steps, ordered = false }: { steps: HelpStep[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={cx(styles.stepList, ordered && styles.stepListOrdered)}>
      {steps.map((step, index) => (
        <li key={index} className={styles.stepItem}>
          {step.title ? <span className={styles.stepItemStrong}>{step.title}</span> : null}
          {step.text}
          {step.detail ? <span className={styles.stepItemDetail}>{step.detail}</span> : null}
        </li>
      ))}
    </Tag>
  );
}

function HelpBlockView({ block }: { block: HelpBlock }) {
  if (block.type === 'text') {
    return (
      <section className={styles.articleBlock}>
        <h2 className={styles.articleBlockTitle}>{block.title}</h2>
        <p className={styles.articleParagraph}>{block.body}</p>
      </section>
    );
  }

  if (block.type === 'list') {
    return (
      <section className={styles.articleBlock}>
        <h2 className={styles.articleBlockTitle}>{block.title}</h2>
        <StepList steps={block.items} ordered={block.ordered} />
      </section>
    );
  }

  return (
    <aside className={cx(styles.callout, block.variant === 'tip' && styles.calloutTip)}>
      <p className={styles.calloutBody}>{block.body}</p>
    </aside>
  );
}

type HelpArticleProps = {
  topic: HelpTopic;
  onNavigate?: (path: string) => void;
  footer?: ReactNode;
};

export default function HelpArticle({ topic, onNavigate, footer }: HelpArticleProps) {
  const blocks = visibleHelpBlocks(topic.blocks);

  return (
    <article className={styles.article}>
      <header className={styles.articleHeader}>
        <h1 className={styles.articleTitle}>{topic.title}</h1>
        <p className={styles.articleSummary}>{topic.summary}</p>
      </header>

      <div className={styles.articleBody}>
        {blocks.map((block, index) => (
          <HelpBlockView key={`${topic.id}-${index}`} block={block} />
        ))}
        {footer}
      </div>

      {topic.appRoute && onNavigate ? (
        <footer className={styles.articleFooter}>
          <button type="button" className={ui.btnPrimary} onClick={() => onNavigate(topic.appRoute!)}>
            {topic.appRouteLabel ?? 'Abrir en la aplicacion'}
          </button>
        </footer>
      ) : null}
    </article>
  );
}
