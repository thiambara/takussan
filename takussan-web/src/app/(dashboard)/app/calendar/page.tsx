import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { CalendarPage, type CalendarAudience } from '@/components/calendar/CalendarPage';
import type { PersonaDeLAgenda } from '@/lib/agenda/agenda';
import { isAdmin, isAgencyAdmin, isAgent, isOwner } from '@/lib/roles';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.calendar');
  return { title: t('metaTitle') };
}

export default async function Page() {
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.
  // TCK-591 — `getMeAction` est mémoïsé par requête : le layout l'a déjà appelé.
  const { roles } = await getMeAction();
  const staff = isAgent(roles) || isAdmin(roles);
  const audience: CalendarAudience = staff ? 'staff' : isOwner(roles) ? 'landlord' : 'provider';
  const agent = isAgent(roles) && !isAdmin(roles);
  // TCK-2597 — l'en-tête, « Planifier une visite » et l'abonnement vivent dans l'agenda lui-même :
  // l'abonnement est une feuille ouverte depuis les filtres ou l'en-tête.
  const persona: PersonaDeLAgenda = staff ? (agent ? 'agent' : 'admin') : audience === 'landlord' ? 'bailleur' : 'prestataire';
  return (
    <CalendarPage
      audience={audience}
      defaultMine={agent}
      persona={persona}
      // TCK-591 (verif-591 N3, ADR-0034 §2) — le lien est celui du personnel d'une agence ; le
      // super-admin garde la console, l'API lui refuse le lien.
      abonnement={isAgent(roles) || isAgencyAdmin(roles)}
    />
  );
}
