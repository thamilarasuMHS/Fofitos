import type { ReactNode } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { MHSLogo } from '@/components/MHSLogo';
import { supabase } from '@/lib/supabase';
import type { AppRole } from '@/types/database';

/* ── Nav icons (inline SVG, 20×20 viewBox) ─────────────── */
function IconDashboard() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  );
}
function IconCategories() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M3 7a2 2 0 012-2h3l2 2h9a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
    </svg>
  );
}
function IconDatabase() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <ellipse cx="12" cy="6" rx="8" ry="3"/>
      <path d="M4 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6"/>
      <path d="M4 12v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6"/>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function IconUsers() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  );
}
function IconSignOut() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
    </svg>
  );
}

/* ── Nav icon map ─────────────────────────────────────── */
const navIcons: Record<string, ReactNode> = {
  '/dashboard':           <IconDashboard />,
  '/categories':          <IconCategories />,
  '/ingredient-database': <IconDatabase />,
  '/settings':            <IconSettings />,
  '/users':               <IconUsers />,
};

/* ── Nav item types ───────────────────────────────────── */
type NavChild = { to: string; label: string };
type NavItem  =
  | { kind?: 'link';  to: string; label: string }
  | { kind:  'group'; to: string; label: string; children: NavChild[] };

/* ── Role menu ────────────────────────────────────────── */
const menuByRole: Record<AppRole, NavItem[]> = {
  admin: [
    { to: '/dashboard',           label: 'Dashboard' },
    { to: '/categories',          label: 'Categories' },
    { to: '/ingredient-database', label: 'Ingredient Database' },
    {
      kind: 'group',
      to: '/settings',
      label: 'Settings',
      children: [
        { to: '/settings/parameters', label: 'Parameters' },
        { to: '/settings/components', label: 'Components' },
      ],
    },
    { to: '/users', label: 'User Management' },
  ],
  manager: [
    { to: '/dashboard',           label: 'Dashboard' },
    { to: '/categories',          label: 'Categories' },
    { to: '/ingredient-database', label: 'Ingredient Database' },
  ],
  dietician: [
    { to: '/dashboard',           label: 'Dashboard' },
    { to: '/categories',          label: 'Categories' },
    { to: '/ingredient-database', label: 'Ingredient Database' },
  ],
  chef: [
    { to: '/dashboard',  label: 'Dashboard' },
    { to: '/categories', label: 'Categories' },
  ],
};

/* ── Role badge colors ────────────────────────────────── */
const roleColors: Record<AppRole, string> = {
  admin:     'bg-violet-100 text-violet-700',
  manager:   'bg-blue-100 text-blue-700',
  dietician: 'bg-emerald-100 text-emerald-700',
  chef:      'bg-amber-100 text-amber-700',
};

interface LayoutProps { children?: ReactNode; }

export function Layout({ children }: LayoutProps) {
  const { profile } = useAuth();
  const location = useLocation();

  if (!profile) return null;

  const menu = menuByRole[profile.role];
  const initials = (profile.full_name ?? profile.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 shadow-sm h-screen">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <MHSLogo size={38} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight">My Health School</p>
              <p className="text-xs text-gray-400 leading-tight mt-0.5">Fofitos Nutrition</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {menu.map((item) => {
            /* ── Group item (e.g. Settings with sub-menu) ── */
            if (item.kind === 'group') {
              const isGroupActive = location.pathname.startsWith(item.to);
              return (
                <div key={item.to}>
                  {/* Parent header — not a link, acts as label */}
                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium select-none ${
                    isGroupActive ? 'text-violet-700' : 'text-gray-600'
                  }`}>
                    <span className={isGroupActive ? 'text-violet-600' : 'text-gray-400'}>
                      {navIcons[item.to]}
                    </span>
                    {item.label}
                    <svg
                      className={`ml-auto w-3.5 h-3.5 transition-transform ${isGroupActive ? 'rotate-180 text-violet-500' : 'text-gray-300'}`}
                      fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                  {/* Sub-items — always visible, indented */}
                  <div className="ml-4 pl-3 border-l border-gray-100 mt-0.5 space-y-0.5">
                    {item.children.map(({ to: childTo, label: childLabel }) => {
                      const isChildActive = location.pathname === childTo;
                      return (
                        <Link
                          key={childTo}
                          to={childTo}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            isChildActive
                              ? 'bg-violet-50 text-violet-700 shadow-sm'
                              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isChildActive ? 'bg-violet-500' : 'bg-gray-300'}`} />
                          {childLabel}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            /* ── Regular link item ── */
            const isActive =
              location.pathname === item.to ||
              (item.to !== '/dashboard' && location.pathname.startsWith(item.to + '/'));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-violet-50 text-violet-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className={isActive ? 'text-violet-600' : 'text-gray-400'}>
                  {navIcons[item.to]}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #c026d3)' }}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-800 truncate">
                {profile.full_name || profile.email}
              </p>
              <span className={`badge text-[10px] mt-0.5 ${roleColors[profile.role]}`}>
                {profile.role}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-700 transition-colors w-full"
          >
            <IconSignOut />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
}
