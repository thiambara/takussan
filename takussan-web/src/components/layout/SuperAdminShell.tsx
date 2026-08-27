'use client';

import { useState } from 'react';
import type { User } from '@/types/user';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ImpersonationBanner } from '@/components/admin/super/ImpersonationBanner';
import { SuperAdminTopbar } from './SuperAdminTopbar';
import { SuperAdminSidebar } from './SuperAdminSidebar';

interface SuperAdminShellProps {
  user: User;
  children: React.ReactNode;
}

/**
 * Cible du lien d'évitement (TCK-359). Exporté parce que le test le vérifie et parce qu'un
 * `id` recopié à deux endroits est un `id` qui divergera : le lien et le `<main>` le lisent ici.
 */
export const SUPER_ADMIN_MAIN_ID = 'super-admin-main';

/**
 * Layout shell for the super-admin area (TCK-145). Mounts a global
 * `ImpersonationBanner` so any active impersonation session is signalled
 * regardless of the page being viewed. No agency components are imported
 * here — the cross-tenant context must be visually unambiguous.
 */
export function SuperAdminShell({ user, children }: SuperAdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useTranslations('nav.superAdmin');

  return (
    <div className="relative flex h-screen flex-col bg-stone-100">
      {/*
        TCK-359 — PREMIER élément focalisable du document : la tabulation depuis le haut de la
        page tombe ici, pas sur la 1re des 24 entrées de la sidebar.

        ⚠ Le `onClick` n'est PAS une redondance du `href`. La navigation par fragment ne déplace
        le focus que sur une cible focalisable — d'où le `tabIndex={-1}` sur `<main>` — et Safari
        ne le déplace pas du tout. Le handler rend le comportement identique partout, et c'est
        aussi lui qui rend l'AC3 exécutable sous jsdom, qui n'implémente aucune navigation par
        fragment.
      */}
      <a
        href={`#${SUPER_ADMIN_MAIN_ID}`}
        onClick={() => {
          document.getElementById(SUPER_ADMIN_MAIN_ID)?.focus();
        }}
        className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t('skipToContent')}
      </a>
      <ImpersonationBanner />
      <SuperAdminTopbar user={user} onMenuToggle={() => setSidebarOpen((v) => !v)} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden md:block md:h-full">
          <SuperAdminSidebar />
        </div>
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="bg-stone-900 p-0">
            <SuperAdminSidebar onNavigate={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        <main
          id={SUPER_ADMIN_MAIN_ID}
          // `-1` : hors du parcours de tabulation, mais focalisable par programme — sans lui, le
          // lien d'évitement déplacerait le défilement sans déplacer le focus, et la tabulation
          // suivante repartirait du haut du document.
          tabIndex={-1}
          className="relative min-h-0 flex-1 overflow-y-auto bg-stone-100 focus:outline-none"
        >
          <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
