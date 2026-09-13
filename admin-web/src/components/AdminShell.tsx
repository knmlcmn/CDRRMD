import { useEffect, useState, type ReactNode } from 'react';
import cdrrmdLogo from '../assets/cdrrmd-logo.png';
import { d } from '../adminDesign';

type ActiveView = 'dashboard' | 'admin' | 'users' | 'barangay' | 'monitoring' | 'flood-monitoring' | 'evacuation' | 'post-updates';

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
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenPostUpdates: () => void;
  actions?: ReactNode;
  children: ReactNode;
};

type NavItem = {
  key: ActiveView;
  label: string;
  icon: NavIconName;
  onClick: () => void;
};

type NavIconName = 'dashboard' | 'accounts' | 'incidents' | 'flood' | 'updates' | 'evacuation';

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
  onOpenMonitoring,
  onOpenFloodMonitoring,
  onOpenEvacuationAreas,
  onOpenPostUpdates,
  actions,
  children,
}: Props) {
  const [isAccountsExpanded, setIsAccountsExpanded] = useState(activeView === 'admin' || activeView === 'users' || activeView === 'barangay');

  useEffect(() => {
    if (activeView === 'admin' || activeView === 'users' || activeView === 'barangay') {
      setIsAccountsExpanded(true);
      return;
    }
    setIsAccountsExpanded(false);
  }, [activeView]);

  function onAccountsClick() {
    if (activeView !== 'admin' && activeView !== 'users' && activeView !== 'barangay') {
      onOpenAdmin();
      setIsAccountsExpanded(true);
      return;
    }
    setIsAccountsExpanded((prev) => !prev);
  }

  // Single source of truth for desktop and mobile navigation labels/actions.
  const navItems: NavItem[] = [
    { key: 'monitoring', label: 'Incident Monitoring', icon: 'incidents', onClick: onOpenMonitoring },
    { key: 'flood-monitoring', label: 'Flood Monitoring', icon: 'flood', onClick: onOpenFloodMonitoring },
    { key: 'post-updates', label: 'Post Updates', icon: 'updates', onClick: onOpenPostUpdates },
    { key: 'evacuation', label: 'Evacuation Areas', icon: 'evacuation', onClick: onOpenEvacuationAreas },
  ];

  return (
    <div className={d.shell.root}>
      <div className={d.shell.layout}>
        {/* Mobile top bar */}
        <div className={d.shell.mobileTop}>
          <div className={d.shell.mobileTopInner}>
            <div className={d.shell.mobileLogoWrap}>
              <img src={cdrrmdLogo} alt="CDRRMD logo" className={d.shell.mobileLogo} />
              <p className={d.shell.mobileBrand}>CDRRMD</p>
            </div>
            <button onClick={onLogout} className={d.shell.mobileLogout}>Logout</button>
          </div>
        </div>

        <aside className={d.shell.aside}>
          <div className={d.shell.logoWrap}>
            <img src={cdrrmdLogo} alt="CDRRMD logo" className={d.shell.logo} />
            <div>
              <p className={d.shell.brand}>CDRRMD</p>
            </div>
          </div>

          <nav className={d.shell.nav}>
            <button onClick={onOpenDashboard} className={itemClass(activeView === 'dashboard')}>
              <NavLabel icon="dashboard" label="Dashboard" />
            </button>

            <div>
              <button onClick={onAccountsClick} className={itemClass(activeView === 'admin' || activeView === 'users' || activeView === 'barangay')}>
                <NavLabel icon="accounts" label="Accounts" />
              </button>
              {isAccountsExpanded ? (
                <div className={d.shell.accountsDropdownWrap}>
                  <button
                    onClick={onOpenAdmin}
                    className={[d.shell.accountsDropdownItem, activeView === 'admin' ? d.shell.accountsDropdownItemActive : d.shell.accountsDropdownItemIdle].join(' ')}
                  >
                    Admin
                  </button>
                  <button
                    onClick={onOpenUsers}
                    className={[d.shell.accountsDropdownItem, activeView === 'users' ? d.shell.accountsDropdownItemActive : d.shell.accountsDropdownItemIdle].join(' ')}
                  >
                    Users
                  </button>
                  <button
                    onClick={onOpenBarangay}
                    className={[d.shell.accountsDropdownItem, activeView === 'barangay' ? d.shell.accountsDropdownItemActive : d.shell.accountsDropdownItemIdle].join(' ')}
                  >
                    Barangay
                  </button>
                </div>
              ) : null}
            </div>

            {navItems.map((item) => (
              <button key={item.key} onClick={item.onClick} className={itemClass(activeView === item.key)}>
                <NavLabel icon={item.icon} label={item.label} />
              </button>
            ))}
          </nav>

          <button
            onClick={onLogout}
            className={d.shell.logout}
          >
            Logout
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
            <NavIcon name="dashboard" />
            <span className="sr-only">Dashboard</span>
          </button>
          <button
            onClick={onOpenAdmin}
            aria-label="Accounts"
            title="Accounts"
            className={[
              d.shell.mobileNavItem,
              activeView === 'admin' || activeView === 'users' || activeView === 'barangay' ? d.shell.mobileNavActive : d.shell.mobileNavIdle,
            ].join(' ')}
          >
            <NavIcon name="accounts" />
            <span className="sr-only">Accounts</span>
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
              <NavIcon name={item.icon} />
              <span className="sr-only">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
