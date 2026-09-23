import { type ReactNode } from 'react';
import cdrrmdLogo from '../../assets/cdrrmd-logo.png';
import { d } from '../barangayDesign';

type ActiveView = 'monitoring' | 'flood-monitoring' | 'account';

type Props = {
  activeView: ActiveView;
  title: string;
  subtitle?: string;
  noMainScroll?: boolean;
  barangayName: string;
  onLogout: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
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

export default function BarangayShell({
  activeView,
  title,
  subtitle,
  noMainScroll,
  barangayName,
  onLogout,
  onOpenMonitoring,
  onOpenFloodMonitoring,
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
            <button onClick={onOpenMonitoring} className={itemClass(activeView === 'monitoring')}>
              Incident Monitoring
            </button>
            <button onClick={onOpenFloodMonitoring} className={itemClass(activeView === 'flood-monitoring')}>
              Flood Monitoring
            </button>
            <button onClick={onOpenAccount} className={itemClass(activeView === 'account')}>
              My Account
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
