import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { User } from '@shared/types';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import SidebarToggle from '@/components/SidebarToggle';
import UserAvatar from '@/components/UserAvatar';
import styles from './DetailPageHeader.module.css';

export type DetailPageHeaderSecondaryNav = {
  expanded: boolean;
  onToggle: () => void;
  controlsId: string;
  toggleClassName?: string;
};

export type DetailPageHeaderProps = {
  title: ReactNode;
  onBack: () => void;
  metaLabel?: string;
  metaRelative?: string | null;
  metaAuthor?: Pick<User, 'name' | 'avatarUrl'> | null;
  subtitle?: string;
  status?: ReactNode;
  actions?: ReactNode;
  secondaryNav?: DetailPageHeaderSecondaryNav;
  className?: string;
};

function formatMetaRelative(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function DetailPageHeader({
  title,
  onBack,
  metaLabel,
  metaRelative,
  metaAuthor,
  subtitle,
  status,
  actions,
  secondaryNav,
  className,
}: DetailPageHeaderProps) {
  return (
    <div className={cx(styles.pageHeaderRow, className)}>
      <div className={ui.pageTitleRow}>
        <SidebarToggle />
        <div>
          <div className={ui.pageTitleRow}>
            <button type="button" onClick={onBack} className={ui.pageBackBtn} aria-label="Volver">
              <ArrowLeft size={20} />
            </button>
            {secondaryNav && !secondaryNav.expanded ? (
              <SecondaryNavToggle
                expanded={false}
                onToggle={secondaryNav.onToggle}
                controlsId={secondaryNav.controlsId}
                className={cx(styles.headerSecondaryNavToggle, secondaryNav.toggleClassName)}
              />
            ) : null}
            <div className={styles.headerTitleGroup}>
              {typeof title === 'string' ? <h1 className={ui.pageTitle}>{title}</h1> : title}
              {(metaAuthor || (metaRelative && !metaLabel)) && (
                <span className={styles.headerTitleMeta}>
                  {metaAuthor && (
                    <span className={styles.headerAuthor}>
                      <UserAvatar
                        user={metaAuthor}
                        size="sm"
                        className={styles.headerAuthorAvatar}
                      />
                      <span className={styles.headerAuthorName}>{metaAuthor.name}</span>
                    </span>
                  )}
                  {metaAuthor && metaRelative && !metaLabel && (
                    <span className={styles.headerMetaSep} aria-hidden>
                      ·
                    </span>
                  )}
                  {metaRelative && !metaLabel && (
                    <span className={styles.headerTitleRelative}>
                      {formatMetaRelative(metaRelative)}
                    </span>
                  )}
                </span>
              )}
              {status}
            </div>
          </div>
          {metaLabel && (
            <p className={cx(ui.pageSubtitle, styles.headerMeta)}>
              <span className={styles.headerTitleRelative}>{metaLabel}</span>
              {metaRelative && (
                <>
                  <span className={styles.headerMetaSep} aria-hidden>
                    ·
                  </span>
                  <span className={styles.headerTitleRelative}>
                    {formatMetaRelative(metaRelative)}
                  </span>
                </>
              )}
            </p>
          )}
          {subtitle && <p className={ui.pageSubtitle}>{subtitle}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}
