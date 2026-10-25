import type { ReactNode } from 'react';

export function SidebarSectionLabel({ children }: { children: ReactNode }) {
  return <p className="portal-nav-section-label">{children}</p>;
}

export function SidebarCollapseButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="portal-sidebar-collapse"
      onClick={onToggle}
      aria-label={collapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
      title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={collapsed ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} />
      </svg>
      <span>{collapsed ? 'Expand' : 'Collapse'}</span>
    </button>
  );
}

export function LogoutIcon() {
  return (
    <svg className="portal-logout-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19H10" />
      <path d="M14 8l4 4-4 4M9 12h9" />
    </svg>
  );
}

export function PortalPageHeading({
  portalLabel,
  title,
  subtitle,
  actions,
}: {
  portalLabel: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="portal-page-heading">
      <div className="portal-page-heading-copy">
        <div className="portal-breadcrumb" aria-label="Breadcrumb">
          <span>CDRRMD</span>
          <span aria-hidden="true">/</span>
          <span>{portalLabel}</span>
        </div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="portal-page-heading-side">
          <div className="portal-page-actions">{actions}</div>
        </div>
      ) : null}
    </div>
  );
}
