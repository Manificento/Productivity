import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { MODULES, NAV_MODULES } from './modules';

/** Nav links point at the module root, without the '/*' suffix. */
function rootPath(path: string): string {
  return path.replace(/\/\*$/, '') || '/';
}

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <ul className="mx-auto flex max-w-2xl justify-around">
        {NAV_MODULES.map((m) => (
          <li key={m.id}>
            <NavLink
              to={rootPath(m.path)}
              end={rootPath(m.path) === '/'}
              className={({ isActive }) =>
                `flex min-w-14 flex-col items-center gap-0.5 px-2 py-2 text-[11px] ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'}`
              }
            >
              <span className="text-xl leading-none" aria-hidden>
                {m.icon}
              </span>
              {m.title}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function App() {
  return (
    <HashRouter>
      <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Link to="/settings" aria-label="Настройки" className="fixed right-3 top-3 z-10 p-2 text-xl">
          ⚙️
        </Link>
        <Routes>
          {MODULES.map((m) => (
            <Route key={m.id} path={m.path} element={<m.Page />} />
          ))}
        </Routes>
        <BottomNav />
      </div>
    </HashRouter>
  );
}
