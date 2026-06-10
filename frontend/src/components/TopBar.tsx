import { useState } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cx } from '@/lib/cx';
import { useTopBarVisibility } from '@/context/TopBarVisibilityContext';
import BrandLogo from '@/components/BrandLogo';
import SidebarToggle from '@/components/SidebarToggle';
import GlobalSearch from '@/components/GlobalSearch';
import TopBarTrailingActions from '@/components/TopBarTrailingActions';
import { authService } from '@/api';
import styles from './TopBar.module.css';

type TopBarProps = {
  hasSidebar?: boolean;
};

export default function TopBar({ hasSidebar = true }: TopBarProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { isHidden: isTopBarHidden } = useTopBarVisibility();
  const showTrailingInTopBar = isMobile || !isTopBarHidden;

  if (!authService.getCurrentUser()) {
    return (
      <header
        className={styles.topBar}
        data-has-sidebar={hasSidebar ? '' : undefined}
      >
        <div className={isMobile ? styles.mobileStart : styles.leading}>
          {isMobile && <BrandLogo size="sm" className={styles.mobileLogo} />}
          <SidebarToggle hidden={isMobile} />
        </div>
      </header>
    );
  }

  return (
    <header
      className={styles.topBar}
      data-has-sidebar={hasSidebar ? '' : undefined}
    >
      {isMobile ? (
        <div
          className={cx(
            styles.mobileStart,
            mobileSearchOpen && styles.mobileStartExpanded,
          )}
        >
          <div
            className={cx(
              styles.searchSlot,
              mobileSearchOpen && styles.searchSlotExpanded,
            )}
          >
            <GlobalSearch
              compact
              iconTrigger
              expanded={mobileSearchOpen}
              onExpandedChange={setMobileSearchOpen}
            />
          </div>
          {!mobileSearchOpen && (
            <BrandLogo size="sm" className={styles.mobileLogo} />
          )}
        </div>
      ) : (
        <div className={styles.leading}>
          <SidebarToggle />
        </div>
      )}

      {showTrailingInTopBar && (
        <TopBarTrailingActions placement="topbar" hideNotifications={isMobile} />
      )}
    </header>
  );
}
