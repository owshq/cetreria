import SidebarToggle from './SidebarToggle';
import ui from '@/styles/shared.module.css';

type PageTitleProps = {
  children: React.ReactNode;
  className?: string;
};

export default function PageTitle({ children, className }: PageTitleProps) {
  return (
    <div className={ui.pageTitleRow}>
      <SidebarToggle />
      <h1 className={className ?? ui.pageTitle}>{children}</h1>
    </div>
  );
}
