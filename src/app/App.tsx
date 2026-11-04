import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { BlocksPage, rootPath } from './BlocksPage';
import { HOME_MODULE, MODULES, PINNED_MODULES } from './modules';
import type { AppModule } from './moduleTypes';

/** The module whose route is open: today owns only `/` and `/today/…` (its route is the catch-all `/*`). */
function activeModule(pathname: string): AppModule | undefined {
  const under = (root: string) => pathname === root || pathname.startsWith(`${root}/`);
  if (pathname === '/' || under('/today')) return HOME_MODULE;
  return MODULES.find((m) => m !== HOME_MODULE && under(rootPath(m.path)));
}

function NavItem({ to, icon, label, active }: { to: string; icon: string; label: string; active: boolean }) {
  return (
    <li className="flex-1">
      <Link
        to={to}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'}`}
      >
        <span className="text-xl leading-none" aria-hidden>
          {icon}
        </span>
        {label}
      </Link>
    </li>
  );
}

/** «Сегодня», up to three pinned blocks and «Блоки» (highlighted for any other block). */
function BottomNav() {
  const { pathname } = useLocation();
  const active = activeModule(pathname);
  const onBlocks =
    pathname.startsWith('/blocks') ||
    (active !== undefined && active !== HOME_MODULE && !PINNED_MODULES.includes(active));
  return (
    <nav
      aria-label="Модули"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
    >
      <ul className="mx-auto flex max-w-2xl">
        {[HOME_MODULE, ...PINNED_MODULES].map((m) => (
          <NavItem key={m.id} to={rootPath(m.path)} icon={m.icon} label={m.title} active={!onBlocks && active === m} />
        ))}
        <NavItem to="/blocks" icon="🧩" label="Блоки" active={onBlocks} />
      </ul>
    </nav>
  );
}

export function App() {
  return (
    <HashRouter>
      <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Routes>
          <Route path="/blocks" element={<BlocksPage />} />
          {MODULES.map((m) => (
            <Route key={m.id} path={m.path} element={<m.Page />} />
          ))}
        </Routes>
        {MODULES.map((m) => m.Background && <m.Background key={m.id} />)}
        <BottomNav />
      </div>
    </HashRouter>
  );
}
