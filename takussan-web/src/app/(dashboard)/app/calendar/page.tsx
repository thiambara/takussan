import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { CalendarPage, type CalendarAudience } from '@/components/calendar/CalendarPage';
import { CalendarSubscription } from '@/components/crm/CalendarSubscription';
import { isAdmin, isAgencyAdmin, isAgent, isOwner } from '@/lib/roles';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.calendar');
  return { title: t('metaTitle') };
}

export default async function Page() {
  const t = await getTranslations('dashboard.pages.calendar');
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.
  // TCK-591 — `getMeAction` est mémoïsé par requête : le layout l'a déjà appelé.
  const { roles } = await getMeAction();
  const staff = isAgent(roles) || isAdmin(roles);
  const audience: CalendarAudience = staff ? 'staff' : isOwner(roles) ? 'landlord' : 'provider';
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CalendarPage audience={audience} defaultMine={isAgent(roles) && !isAdmin(roles)} />
      {/* TCK-591 (verif-591 N3, ADR-0034 §2) — le lien est celui du personnel d'une agence ; le
          super-admin garde la console, l'API lui refuse le lien. */}
      {isAgent(roles) || isAgencyAdmin(roles) ? <CalendarSubscription /> : null}
    </div>
  );
}
