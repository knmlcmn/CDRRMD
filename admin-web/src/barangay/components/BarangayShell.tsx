import { type ReactNode, useState } from 'react';
import cdrrmdLogo from '../../assets/cdrrmd-logo.png';
import { LogoutIcon, PortalPageHeading, SidebarCollapseButton, SidebarSectionLabel } from '../../components/PortalShellElements';
import { d } from '../barangayDesign';

type ActiveView = 'dashboard' | 'monitoring' | 'flood-monitoring' | 'evacuation-center' | 'account' | 'history';
type NavIconName = 'dashboard' | 'incidents' | 'flood' | 'evacuation' | 'account' | 'history';

type Props = {
  activeView: ActiveView;
  title: string;
  subtitle?: string;
  noMainScroll?: boolean;
  barangayName: string;
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationCenter: () => void;
  onOpenAccount: () => void;
  onOpenHistory: () => void;
  actions?: ReactNode;
  children: ReactNode;
};

function itemClass(isActive: boolean) {
  return [
    d.shell.navItem,
    isActive ? d.shell.navItemActive : d.shell.navItemIdle,
  ].join(' ');
}

function NavIcon({ name }: { name: NavIconName }) {
  const commonProps = {
    className: d.shell.navIcon,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'dashboard') {
    return (
      <svg {...commonProps}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }

  if (name === 'incidents') {
    return (
      <svg {...commonProps}>
        <path d="M10.3 3.6 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  if (name === 'flood') {
    return (
      <svg {...commonProps}>
        <path d="M12 2.5S6 9 6 14a6 6 0 0 0 12 0c0-5-6-11.5-6-11.5Z" />
        <path d="M8.5 15.5c1.1.8 2.3 1.2 3.5 1.2s2.4-.4 3.5-1.2" />
      </svg>
    );
  }

  if (name === 'account') {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    );
  }

  if (name === 'history') {
    return <svg {...commonProps}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg>;
  }

  return (
    <svg {...commonProps}>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11h14V9" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function NavLabel({ icon, label }: { icon: NavIconName; label: string }) {
  return (
    <>
      <NavIcon name={icon} />
      <span>{label}</span>
    </>
  );
}

export default function BarangayShell({
  activeView,
  title,
  subtitle,
  noMainScroll,
  barangayName,
  onLogout,
  onOpenDashboard,
  onOpenMonitoring,
  onOpenFloodMonitoring,
  onOpenEvacuationCenter,
  onOpenAccount,
  onOpenHistory,
  actions,
  children,
}: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('cdrrmd_barangay_sidebar') === 'collapsed');

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem('cdrrmd_barangay_sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  }

  return (
    <div className={d.shell.root}>
      <div className={`${d.shell.layout} ${sidebarCollapsed ? 'portal-shell-collapsed' : ''}`}>
        {/* Mobile top bar */}
        <div className={d.shell.mobileTop}>
          <div className={d.shell.mobileTopInner}>
            <div className={d.shell.mobileLogoWrap}>
              <img src={cdrrmdLogo} alt="CDRRMD logo" className={d.shell.mobileLogo} />
              <div className={d.shell.mobileLogoText}>
                <p className={d.shell.mobileBrand}>CDRRMD</p>
                <p className={d.shell.mobileJurisdiction}>
                  Brgy. {barangayName}
                </p>
              </div>
            </div>
            <button onClick={onLogout} className={d.shell.mobileLogout}>Logout</button>
          </div>
        </div>

        {/* Desktop sidebar */}
        <aside className={`${d.shell.aside} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
          <div className={d.shell.logoWrap}>
            <img src={cdrrmdLogo} alt="CDRRMD logo" className={d.shell.logo} />
            <div className="portal-brand-copy">
              <p className={d.shell.brand}>CDRRMD</p>
              <p className={d.shell.city}>Barangay Portal</p>
            </div>
          </div>

          {/* Barangay badge */}
          <div className="portal-jurisdiction">
            <p className="portal-jurisdiction-copy portal-jurisdiction-label">
              Jurisdiction
            </p>
            <p className="portal-jurisdiction-copy portal-jurisdiction-name">
              Brgy. {barangayName}
            </p>
          </div>

          <nav className={d.shell.nav}>
            <SidebarSectionLabel>Overview</SidebarSectionLabel>
            <button onClick={onOpenDashboard} className={itemClass(activeView === 'dashboard')} aria-current={activeView === 'dashboard' ? 'page' : undefined} title="Dashboard">
              <NavLabel icon="dashboard" label="Dashboard" />
            </button>
            <SidebarSectionLabel>Response Operations</SidebarSectionLabel>
            <button onClick={onOpenMonitoring} className={itemClass(activeView === 'monitoring')} aria-current={activeView === 'monitoring' ? 'page' : undefined} title="Incident Monitoring">
              <NavLabel icon="incidents" label="Incident Monitoring" />
            </button>
            <button onClick={onOpenFloodMonitoring} className={itemClass(activeView === 'flood-monitoring')} aria-current={activeView === 'flood-monitoring' ? 'page' : undefined} title="Flood Monitoring">
              <NavLabel icon="flood" label="Flood Monitoring" />
            </button>
            <button onClick={onOpenEvacuationCenter} className={itemClass(activeView === 'evacuation-center')} aria-current={activeView === 'evacuation-center' ? 'page' : undefined} title="Evacuation Center">
              <NavLabel icon="evacuation" label="Evacuation Center" />
            </button>
            <SidebarSectionLabel>Records & Personnel</SidebarSectionLabel>
            <button onClick={onOpenAccount} className={itemClass(activeView === 'account')} aria-current={activeView === 'account' ? 'page' : undefined} title="Account">
              <NavLabel icon="account" label="Account" />
            </button>
            <button onClick={onOpenHistory} className={itemClass(activeView === 'history')} aria-current={activeView === 'history' ? 'page' : undefined} title="History">
              <NavLabel icon="history" label="History" />
            </button>
          </nav>

          <SidebarCollapseButton collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          <button onClick={onLogout} className={d.shell.logout} aria-label="Log out" title="Log out">
            <LogoutIcon />
            <span className="portal-logout-label">Logout</span>
          </button>
        </aside>

        {/* Main */}
        <main
          className={[
            d.shell.mainBase,
            noMainScroll ? d.shell.mainNoScroll : d.shell.mainScroll,
          ].join(' ')}
        >
          <header className={d.shell.header}>
            <PortalPageHeading
              portalLabel={`Barangay ${barangayName}`}
              title={title}
              subtitle={subtitle}
              actions={actions ? <div className={d.shell.actions}>{actions}</div> : undefined}
            />
          </header>

          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className={d.shell.mobileNav}>
          <button
            onClick={onOpenDashboard}
            aria-label="Dashboard"
            title="Dashboard"
            className={[
              d.shell.mobileNavItem,
              activeView === 'dashboard' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            <span className={[d.shell.mobileNavIcon, activeView === 'dashboard' ? d.shell.mobileNavIconActive : ''].join(' ')}><NavIcon name="dashboard" /></span>
            <span className={d.shell.mobileNavLabel}>Dashboard</span>
          </button>
          <button
            onClick={onOpenMonitoring}
            aria-label="Incident Monitoring"
            title="Incident Monitoring"
            className={[
              d.shell.mobileNavItem,
              activeView === 'monitoring' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            <span className={[d.shell.mobileNavIcon, activeView === 'monitoring' ? d.shell.mobileNavIconActive : ''].join(' ')}><NavIcon name="incidents" /></span>
            <span className={d.shell.mobileNavLabel}>Incidents</span>
          </button>
          <button
            onClick={onOpenFloodMonitoring}
            aria-label="Flood Monitoring"
            title="Flood Monitoring"
            className={[
              d.shell.mobileNavItem,
              activeView === 'flood-monitoring' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            <span className={[d.shell.mobileNavIcon, activeView === 'flood-monitoring' ? d.shell.mobileNavIconActive : ''].join(' ')}><NavIcon name="flood" /></span>
            <span className={d.shell.mobileNavLabel}>Flood</span>
          </button>
          <button
            onClick={onOpenEvacuationCenter}
            aria-label="Evacuation Center"
            title="Evacuation Center"
            className={[
              d.shell.mobileNavItem,
              activeView === 'evacuation-center' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            <span className={[d.shell.mobileNavIcon, activeView === 'evacuation-center' ? d.shell.mobileNavIconActive : ''].join(' ')}><NavIcon name="evacuation" /></span>
            <span className={d.shell.mobileNavLabel}>Evacuation</span>
          </button>
          <button
            onClick={onOpenAccount}
            aria-label="Account"
            title="Account"
            className={[
              d.shell.mobileNavItem,
              activeView === 'account' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            <span className={[d.shell.mobileNavIcon, activeView === 'account' ? d.shell.mobileNavIconActive : ''].join(' ')}><NavIcon name="account" /></span>
            <span className={d.shell.mobileNavLabel}>Account</span>
          </button>
          <button
            onClick={onOpenHistory}
            aria-label="History"
            title="History"
            className={[
              d.shell.mobileNavItem,
              activeView === 'history' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            <span className={[d.shell.mobileNavIcon, activeView === 'history' ? d.shell.mobileNavIconActive : ''].join(' ')}><NavIcon name="history" /></span>
            <span className={d.shell.mobileNavLabel}>History</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
