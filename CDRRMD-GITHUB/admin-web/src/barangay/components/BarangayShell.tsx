import { type ReactNode } from 'react';
import cdrrmdLogo from '../../assets/cdrrmd-logo.png';
import { d } from '../barangayDesign';

type ActiveView = 'dashboard' | 'monitoring' | 'flood-monitoring' | 'evacuation-center' | 'account';
type NavIconName = 'dashboard' | 'incidents' | 'flood' | 'evacuation' | 'account';

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
  actions,
  children,
}: Props) {
  return (
    <div className={d.shell.root}>
      <div className={d.shell.layout}>
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
        <aside className={d.shell.aside}>
          <div className={d.shell.logoWrap}>
            <img src={cdrrmdLogo} alt="CDRRMD logo" className={d.shell.logo} />
            <div>
              <p className={d.shell.brand}>CDRRMD</p>
              <p className={d.shell.city}>Barangay Portal</p>
            </div>
          </div>

          {/* Barangay badge */}
          <div style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 12,
            padding: '10px 12px',
          }}>
            <p style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Jurisdiction
            </p>
            <p style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', marginTop: 2 }}>
              Brgy. {barangayName}
            </p>
          </div>

          <nav className={d.shell.nav}>
            <button onClick={onOpenDashboard} className={itemClass(activeView === 'dashboard')}>
              <NavLabel icon="dashboard" label="Dashboard" />
            </button>
            <button onClick={onOpenMonitoring} className={itemClass(activeView === 'monitoring')}>
              <NavLabel icon="incidents" label="Incident Monitoring" />
            </button>
            <button onClick={onOpenFloodMonitoring} className={itemClass(activeView === 'flood-monitoring')}>
              <NavLabel icon="flood" label="Flood Monitoring" />
            </button>
            <button onClick={onOpenEvacuationCenter} className={itemClass(activeView === 'evacuation-center')}>
              <NavLabel icon="evacuation" label="Evacuation Center" />
            </button>
            <button onClick={onOpenAccount} className={itemClass(activeView === 'account')}>
              <NavLabel icon="account" label="My Account" />
            </button>
          </nav>

          <button onClick={onLogout} className={d.shell.logout}>
            Logout
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
            <div className={d.shell.headerInner}>
              <div>
                <h1 className={d.shell.h1}>{title}</h1>
                {subtitle ? <p className={d.shell.subtitle}>{subtitle}</p> : null}
              </div>
              {actions ? <div className={d.shell.actions}>{actions}</div> : null}
            </div>
          </header>

          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className={d.shell.mobileNav}>
          <button
            onClick={onOpenDashboard}
            className={[
              d.shell.mobileNavItem,
              activeView === 'dashboard' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            Dashboard
          </button>
          <button
            onClick={onOpenMonitoring}
            className={[
              d.shell.mobileNavItem,
              activeView === 'monitoring' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            Monitoring
          </button>
          <button
            onClick={onOpenFloodMonitoring}
            className={[
              d.shell.mobileNavItem,
              activeView === 'flood-monitoring' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            Flood
          </button>
          <button
            onClick={onOpenEvacuationCenter}
            className={[
              d.shell.mobileNavItem,
              activeView === 'evacuation-center' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            Evacuation
          </button>
          <button
            onClick={onOpenAccount}
            className={[
              d.shell.mobileNavItem,
              activeView === 'account' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            My Account
          </button>
        </nav>
      </div>
    </div>
  );
}
