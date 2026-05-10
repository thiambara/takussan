'use client';

import { useState } from 'react';
import type { User } from '@/types/user';
import { AppTopbar } from './AppTopbar';
import { AppSidebar } from './AppSidebar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { CustomerWelcomeWizard } from '@/components/customer/CustomerWelcomeWizard';
import { MinimalProfileTriggerProvider } from '@/components/customer/MinimalProfileTriggerProvider';
import { TenantWelcomeWizard } from '@/components/tenant/TenantWelcomeWizard';
import { isCustomer } from '@/lib/roles';

interface AppShellProps {
  user: User;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // TCK-253 — Customer-only onboarding surfaces. Gated server-side via the
  // SSR-resolved roles so we never paint the welcome modale (or arm the
  // deferred profile sheet) for agents / owners / admins.
  const customerOnboardingActive = isCustomer(user.roles);

  return (
    <MinimalProfileTriggerProvider roles={user.roles}>
      <div className="flex h-screen flex-col bg-app-bg">
        <AppTopbar user={user} onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="hidden md:block md:h-full">
            <AppSidebar user={user} />
          </div>
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="p-0">
              <AppSidebar user={user} onNavigate={() => setSidebarOpen(false)} />
            </SheetContent>
          </Sheet>
          <main className="relative min-h-0 flex-1 overflow-y-auto bg-app-bg">
            <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>
          </main>
        </div>
        {customerOnboardingActive ? <CustomerWelcomeWizard /> : null}
        {/* TCK-265 — per-lease welcome modale for tenants. Renders on top
            of (or after) the generic customer wizard since each modale
            uses its own welcome key. */}
        {customerOnboardingActive ? <TenantWelcomeWizard /> : null}
      </div>
    </MinimalProfileTriggerProvider>
  );
}
