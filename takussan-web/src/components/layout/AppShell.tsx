'use client';

import { useState } from 'react';
import type { User } from '@/types/user';
import { AppTopbar } from './AppTopbar';
import { AppSidebar } from './AppSidebar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AgencyStandardWelcomeWizard } from '@/components/agency/AgencyStandardWelcomeWizard';
import { AgentWelcomeWizard } from '@/components/agent/AgentWelcomeWizard';
import { CustomerWelcomeWizard } from '@/components/customer/CustomerWelcomeWizard';
import { MinimalProfileTriggerProvider } from '@/components/customer/MinimalProfileTriggerProvider';
import { OwnerWelcomeWizard } from '@/components/owner/OwnerWelcomeWizard';
import { TenantWelcomeWizard } from '@/components/tenant/TenantWelcomeWizard';
import { isAgencyAdmin, isAgent, isCustomerOnly, isOwner } from '@/lib/roles';

interface AppShellProps {
  user: User;
  children: React.ReactNode;
  /**
   * TCK-267 — server-resolved flags consumed by the sidebar's
   * "Passer en pro" card. Computed in the dashboard layout so the
   * client tree doesn't have to fetch the agency on every navigation.
   */
  agencyIsStandard?: boolean;
  hasPendingUpgrade?: boolean;
}

export function AppShell({
  user,
  children,
  agencyIsStandard,
  hasPendingUpgrade,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // TCK-253 — Customer-only onboarding surfaces. Gated server-side via the
  // SSR-resolved roles so we never paint the welcome modale (or arm the
  // deferred profile sheet) for agents / owners / admins.
  // TCK-492 — `isCustomerOnly` : `customer` étant devenu le plancher,
  // `isCustomer` aurait armé la modale de bienvenue acheteur pour les agents,
  // bailleurs et administrateurs — c'est-à-dire exactement ce que le
  // commentaire ci-dessus dit vouloir éviter.
  const customerOnboardingActive = isCustomerOnly(user.roles);
  // TCK-257 — Owner welcome modale, mounted once on /app for users
  // with the `owner` role. Independent of the customer wizard (its
  // welcome key is distinct), so an owner who is also a customer sees
  // both modales (each gated by its own `welcome-seen` row).
  const ownerWelcomeActive = isOwner(user.roles);
  // TCK-259 — Agent welcome modale, mounted once on /app for users with
  // the `agent` role (or its senior / manager flavours, both surfaced
  // through the same `agent` spatie role from the invite acceptance).
  const agentWelcomeActive = isAgent(user.roles);
  // TCK-269 — Agency-admin welcome modale fired once after a successful
  // `individual → standard` upgrade. Strict `agency_admin` check excludes
  // super-admin impersonation. The hook itself only opens the modale when
  // `agency.metadata.welcome.standard_unlocked_at` is present, so admins
  // of always-standard agencies never see it.
  const agencyStandardWelcomeActive = isAgencyAdmin(user.roles);

  return (
    <MinimalProfileTriggerProvider roles={user.roles}>
      <div className="flex h-screen flex-col bg-background">
        <AppTopbar user={user} onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="hidden md:block md:h-full">
            <AppSidebar
              user={user}
              agencyIsStandard={agencyIsStandard}
              hasPendingUpgrade={hasPendingUpgrade}
            />
          </div>
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="p-0">
              <AppSidebar
              user={user}
              onNavigate={() => setSidebarOpen(false)}
              agencyIsStandard={agencyIsStandard}
              hasPendingUpgrade={hasPendingUpgrade}
            />
            </SheetContent>
          </Sheet>
          <main className="relative min-h-0 flex-1 overflow-y-auto bg-background">
            <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>
          </main>
        </div>
        {customerOnboardingActive ? <CustomerWelcomeWizard /> : null}
        {/* TCK-265 — per-lease welcome modale for tenants. Renders on top
            of (or after) the generic customer wizard since each modale
            uses its own welcome key. */}
        {customerOnboardingActive ? <TenantWelcomeWizard /> : null}
        {ownerWelcomeActive ? <OwnerWelcomeWizard /> : null}
        {agentWelcomeActive ? <AgentWelcomeWizard /> : null}
        {agencyStandardWelcomeActive ? <AgencyStandardWelcomeWizard /> : null}
      </div>
    </MinimalProfileTriggerProvider>
  );
}
