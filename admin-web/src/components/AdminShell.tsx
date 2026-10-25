import { type ReactNode, useState } from 'react';
import cdrrmdLogo from '../assets/cdrrmd-logo.png';
import { d } from '../adminDesign';
import { LogoutIcon, PortalPageHeading, SidebarCollapseButton, SidebarSectionLabel } from './PortalShellElements';

type ActiveView = 'dashboard' | 'admin' | 'users' | 'barangay' | 'rescuers' | 'monitoring' | 'flood-monitoring' | 'evacuation' | 'post-updates' | 'history';

type Props = {
  activeView: ActiveView;
  title: string;
  subtitle?: string;
  noMainScroll?: boolean;
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onOpenUsers: () => void;
  onOpenBarangay: () => void;
  onOpenRescuers: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenPostUpdates: () => void;
  onOpenHistory: () => void;
  actions?: ReactNode;
  children: ReactNode;
};

type NavItem = {
  key: ActiveView;
  label: string;
  icon: NavIconName;
  onClick: () => void;
};

type NavIconName = 'dashboard' | 'accounts' | 'incidents' | 'flood' | 'updates' | 'evacuation' | 'history';

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
    return <svg {...commonProps}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
  }
  if (name === 'accounts') {
    return <svg {...commonProps}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
  }
  if (name === 'incidents') {
    return <svg {...commonProps}><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5" /><path d="M12 17.5h.01" /></svg>;
  }
  if (name === 'flood') {
    return <svg {...commonProps}><path d="M12 3s-5 5.5-5 10a5 5 0 0 0 10 0c0-4.5-5-10-5-10Z" /><path d="M3 20c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0" /></svg>;
  }
  if (name === 'updates') {
    return <svg {...commonProps}><path d="m3 11 14-5v12L3 13v-2Z" /><path d="M8 15v5H5l-1-7" /><path d="M20 9v6" /></svg>;
  }
  if (name === 'history') {
    return <svg {...commonProps}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg>;
  }
  return <svg {...commonProps}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /><path d="M12 7v3" /></svg>;
}

function NavLabel({ icon, label }: { icon: NavIconName; label: string }) {
  return <><NavIcon name={icon} /><span>{label}</span></>;
}

function itemClass(isActive: boolean) {
  return [
    d.shell.navItem,
    isActive ? d.shell.navItemActive : d.shell.navItemIdle,
  ].join(' ');
}

export default function AdminShell({
  activeView,
  title,
  subtitle,
  noMainScroll,
  onLogout,
  onOpenDashboard,
  onOpenAdmin,
  onOpenUsers,
  onOpenBarangay,
  onOpenRescuers,
  onOpenMonitoring,
  onOpenFloodMonitoring,
  onOpenEvacuationAreas,
  onOpenPostUpdates,
  onOpenHistory,
  actions,
  children,
}: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('cdrrmd_admin_sidebar') === 'collapsed');
  const isAccountsView = activeView === 'admin' || activeView === 'users' || activeView === 'barangay' || activeView === 'rescuers';

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem('cdrrmd_admin_sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  }

  function openAccounts() {
    if (!isAccountsView) {
      onOpenAdmin();
    }
  }

  // Single source of truth for desktop and mobile navigation labels/actions.
  const navItems: NavItem[] = [
    { key: 'monitoring', label: 'Incident Monitoring', icon: 'incidents', onClick: onOpenMonitoring },
    { key: 'flood-monitoring', label: 'Flood Monitoring', icon: 'flood', onClick: onOpenFloodMonitoring },
    { key: 'post-updates', label: 'Post Updates', icon: 'updates', onClick: onOpenPostUpdates },
    { key: 'history', label: 'History', icon: 'history', onClick: onOpenHistory },
    { key: 'evacuation', label: 'Evacuation Areas', icon: 'evacuation', onClick: onOpenEvacuationAreas },
  ];

  return (
    <div className={`${d.shell.root} admin-font-manrope`}>
      <div className={`${d.shell.layout} ${sidebarCollapsed ? 'portal-shell-collapsed' : ''}`}>
        {/* Mobile top bar */}
        <div className={d.shell.mobileTop}>
          <div className={d.shell.mobileTopInner}>
            <div className={d.shell.mobileLogoWrap}>
              <img src={cdrrmdLogo} alt="CDRRMD logo" className={d.shell.mobileLogo} />
              <div>
                <p className={d.shell.mobileBrand}>CDRRMD</p>
                <p className={d.shell.mobilePortalLabel}>Admin Portal</p>
              </div>
            </div>
            <button onClick={onLogout} className={d.shell.mobileLogout}>Logout</button>
          </div>
        </div>

        <aside className={`${d.shell.aside} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
          <div className={d.shell.logoWrap}>
            <img src={cdrrmdLogo} alt="CDRRMD logo" className={d.shell.logo} />
            <div className="portal-brand-copy">
              <p className={d.shell.brand}>CDRRMD</p>
              <p className={d.shell.city}>Admin Portal</p>
            </div>
          </div>

          <nav className={d.shell.nav}>
            <SidebarSectionLabel>Overview</SidebarSectionLabel>
            <button onClick={onOpenDashboard} className={itemClass(activeView === 'dashboard')} aria-current={activeView === 'dashboard' ? 'page' : undefined} title="Dashboard">
              <NavLabel icon="dashboard" label="Dashboard" />
            </button>

            <SidebarSectionLabel>Operations</SidebarSectionLabel>
            {navItems.slice(0, 3).map((item) => (
              <button key={item.key} onClick={item.onClick} className={itemClass(activeView === item.key)} aria-current={activeView === item.key ? 'page' : undefined} title={item.label}>
                <NavLabel icon={item.icon} label={item.label} />
              </button>
            ))}

            <SidebarSectionLabel>Records & Resources</SidebarSectionLabel>
            {navItems.slice(3).map((item) => (
              <button key={item.key} onClick={item.onClick} className={itemClass(activeView === item.key)} aria-current={activeView === item.key ? 'page' : undefined} title={item.label}>
                <NavLabel icon={item.icon} label={item.label} />
              </button>
            ))}

            <SidebarSectionLabel>Administration</SidebarSectionLabel>
            <button onClick={openAccounts} className={itemClass(isAccountsView)} aria-current={isAccountsView ? 'page' : undefined} title="Accounts">
              <NavLabel icon="accounts" label="Accounts" />
            </button>
          </nav>

          <SidebarCollapseButton collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
          <button
            onClick={onLogout}
            className={d.shell.logout}
            aria-label="Log out"
            title="Log out"
          >
            <LogoutIcon />
            <span className="portal-logout-label">Logout</span>
          </button>
        </aside>

        <main
          className={[
            d.shell.mainBase,
            noMainScroll ? d.shell.mainNoScroll : d.shell.mainScroll,
          ].join(' ')}
        >
          {/* Shared page header for all admin views */}
          <header className={d.shell.header}>
            <PortalPageHeading
              portalLabel="Admin Portal"
              title={title}
              subtitle={subtitle}
              actions={(isAccountsView || actions) ? <>
                {isAccountsView ? (
                <nav className="portal-account-tabs" role="tablist" aria-label="Account roles">
                  {[
                    ['admin', 'Admin', onOpenAdmin],
                    ['users', 'User', onOpenUsers],
                    ['barangay', 'Barangay', onOpenBarangay],
                    ['rescuers', 'Rescuers', onOpenRescuers],
                  ].map(([key, label, onClick]) => (
                    <button
                      key={String(key)}
                      type="button"
                      role="tab"
                      aria-selected={activeView === key}
                      onClick={onClick as () => void}
                      className="portal-account-tab"
                    >
                      {String(label)}
                    </button>
                  ))}
                </nav>
                ) : null}
                {actions ? <div className={d.shell.actions}>{actions}</div> : null}
              </> : undefined}
            />
          </header>

          {children}
        </main>

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
            onClick={onOpenAdmin}
            aria-label="Accounts"
            title="Accounts"
            className={[
              d.shell.mobileNavItem,
              activeView === 'admin' || activeView === 'users' || activeView === 'barangay' || activeView === 'rescuers' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            <span className={[d.shell.mobileNavIcon, isAccountsView ? d.shell.mobileNavIconActive : ''].join(' ')}><NavIcon name="accounts" /></span>
            <span className={d.shell.mobileNavLabel}>Accounts</span>
          </button>
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={item.onClick}
              aria-label={item.label}
              title={item.label}
              className={[
                d.shell.mobileNavItem,
                activeView === item.key ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
              ].join(' ')}
            >
              <span className={[d.shell.mobileNavIcon, activeView === item.key ? d.shell.mobileNavIconActive : ''].join(' ')}><NavIcon name={item.icon} /></span>
              <span className={d.shell.mobileNavLabel}>{item.key === 'monitoring' ? 'Incidents' : item.key === 'flood-monitoring' ? 'Flood' : item.key === 'post-updates' ? 'Updates' : item.key === 'evacuation' ? 'Evacuation' : item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
