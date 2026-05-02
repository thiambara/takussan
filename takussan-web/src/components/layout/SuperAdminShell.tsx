'use client';

import { useState } from 'react';
import type { User } from '@/types/user';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ImpersonationBanner } from '@/components/admin/super/ImpersonationBanner';
import { SuperAdminTopbar } from './SuperAdminTopbar';
import { SuperAdminSidebar } from './SuperAdminSidebar';

interface SuperAdminShellProps {
  user: User;
  children: React.ReactNode;
}

/**
 * Layout shell for the super-admin area (TCK-145). Mounts a global
 * `ImpersonationBanner` so any active impersonation session is signalled
 * regardless of the page being viewed. No agency components are imported
 * here — the cross-tenant context must be visually unambiguous.
 */
export function SuperAdminShell({ user, children }: SuperAdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-stone-100">
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
        <main className="relative min-h-0 flex-1 overflow-y-auto bg-stone-100">
          <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
