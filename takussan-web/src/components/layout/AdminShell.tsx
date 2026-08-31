'use client';

import { useState } from 'react';
import type { User } from '@/types/user';
import { AppTopbar } from './AppTopbar';
import { AdminSidebar } from './AdminSidebar';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface AdminShellProps {
  user: User;
  children: React.ReactNode;
  /** `true` once the active agency is on `kind=standard`. Drives the sidebar
   *  padlock for Standard-only items when the agency is still `individual`. */
  agencyIsStandard?: boolean;
}

export function AdminShell({ user, children, agencyIsStandard }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /**
   * TCK-503 — `h-dvh`, jamais `h-screen`. Relevé au navigateur le 2026-08-31, à 390 px : le
   * document de `/admin/*` ne défile NULLE PART (`scrollHeight - clientHeight === 0`), parce que
   * cette boîte fait exactement la hauteur du viewport et que c'est le `<main>` qui absorbe le
   * débord. Or sur un téléphone, la barre d'adresse ne se rétracte QUE sur un défilement du
   * DOCUMENT : elle reste donc déployée pour toute la vie de la page, pendant que `100vh`
   * continue de valoir la hauteur SANS elle. La bande du bas — exactement la hauteur de la
   * barre — est hors de portée, et l'`overflow-y-auto` du `<main>` ne l'absorbe pas : arrivé au
   * bout de son défilement, le dernier pixel de contenu est à `100vh`, donc sous le pli.
   *
   * `dvh` suit le viewport réellement visible. Même correction que TCK-501 un cran plus bas ;
   * `md:h-full` sur la barre latérale continue de résoudre, `h-dvh` restant une hauteur DÉFINIE.
   */
  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppTopbar user={user} onMenuToggle={() => setSidebarOpen((v) => !v)} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden md:block md:h-full">
          <AdminSidebar user={user} agencyIsStandard={agencyIsStandard} />
        </div>
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="bg-foreground p-0">
            <AdminSidebar
              user={user}
              agencyIsStandard={agencyIsStandard}
              onNavigate={() => setSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <main className="relative min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
