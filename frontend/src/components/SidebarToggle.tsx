import { useSidebar } from '@/context/SidebarContext';
import styles from './SidebarToggle.module.css';

type SidebarToggleProps = {
  hidden?: boolean;
};

export default function SidebarToggle({ hidden = false }: SidebarToggleProps) {
  const { toggle } = useSidebar();

  if (hidden) {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label="Abrir menú"
    >
      ☰
    </button>
  );
}
