import type { ReactNode } from 'react';
import cdrrmdLogo from '../assets/cdrrmd-logo.png';
import { d } from '../adminDesign';

export type RescuerView = 'incidents' | 'flood-monitoring' | 'account';

type Props = {
  activeView: RescuerView;
  title: string;
  subtitle: string;
  onOpenIncidents: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenAccount: () => void;
  onLogout: () => void;
  children: ReactNode;
};

const navigation = [
  { key: 'incidents' as const, label: 'Incident Reports' },
  { key: 'flood-monitoring' as const, label: 'Flood Monitoring' },
  { key: 'account' as const, label: 'Account' },
];

function NavIcon({ name }: { name: RescuerView }) {
  const props = { className: d.shell.navIcon, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'incidents') return <svg {...props}><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5" /><path d="M12 17.5h.01" /></svg>;
  if (name === 'flood-monitoring') return <svg {...props}><path d="M12 3s-5 5.5-5 10a5 5 0 0 0 10 0c0-4.5-5-10-5-10Z" /><path d="M3 20c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0" /></svg>;
  return <svg {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
}

export default function RescuerShell({
  activeView,
  title,
  subtitle,
  onOpenIncidents,
  onOpenFloodMonitoring,
  onOpenAccount,
  onLogout,
  children,
}: Props) {
  const actions: Record<RescuerView, () => void> = {
    incidents: onOpenIncidents,
    'flood-monitoring': onOpenFloodMonitoring,
    account: onOpenAccount,
  };

  return (
    <div className={d.shell.root}>
      <div className={d.shell.layout}>
        <div className={d.shell.mobileTop}>
          <div className={d.shell.mobileTopInner}>
            <div className={d.shell.mobileLogoWrap}><img src={cdrrmdLogo} alt="CDRRMD logo" className={d.shell.mobileLogo} /><p className={d.shell.mobileBrand}>CDRRMD Rescuer</p></div>
            <button type="button" onClick={onLogout} className={d.shell.mobileLogout}>Logout</button>
          </div>
        </div>

        <aside className={d.shell.aside}>
          <div className={d.shell.logoWrap}>
            <img src={cdrrmdLogo} alt="CDRRMD logo" className={d.shell.logo} />
            <p className="text-lg font-extrabold leading-tight text-white">CDRRMD<br /><span className="text-sm text-slate-300">Rescuer</span></p>
          </div>
          <nav className={d.shell.nav}>
            {navigation.map((item) => (
              <button key={item.key} type="button" onClick={actions[item.key]} className={[d.shell.navItem, activeView === item.key ? d.shell.navItemActive : d.shell.navItemIdle].join(' ')}>
                <NavIcon name={item.key} /><span>{item.label}</span>
              </button>
            ))}
          </nav>
          <button type="button" onClick={onLogout} className={d.shell.logout}>Logout</button>
        </aside>

        <main className={[d.shell.mainBase, d.shell.mainScroll].join(' ')}>
          <header className={d.shell.header}><div className={d.shell.headerInner}><div><h1 className={d.shell.h1}>{title}</h1><p className={d.shell.subtitle}>{subtitle}</p></div></div></header>
          {children}
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-3 gap-1 border-t border-slate-300 bg-white/95 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur min-[820px]:hidden">
          {navigation.map((item) => (
            <button key={item.key} type="button" onClick={actions[item.key]} aria-label={item.label} title={item.label} className={[d.shell.mobileNavItem, activeView === item.key ? d.shell.mobileNavActive : d.shell.mobileNavIdle].join(' ')}>
              <NavIcon name={item.key} /><span className="sr-only">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
