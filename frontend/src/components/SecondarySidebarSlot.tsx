import SecondarySidebarResizeHandle from '@/components/SecondarySidebarResizeHandle';
import { useSecondarySidebarLayout } from '@/context/SecondarySidebarLayoutContext';
import styles from './Layout.module.css';

export default function SecondarySidebarSlot() {
  const layout = useSecondarySidebarLayout();

  if (!layout?.active) {
    return null;
  }

  return (
    <div
      ref={layout.assignSlotRef}
      className={styles.secondarySidebarSlot}
      data-secondary-sidebar-slot
    >
      <SecondarySidebarResizeHandle />
    </div>
  );
}
