'use client';

import { useTranslations } from 'next-intl';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { debutDeLaMinute } from '@/components/visits/onglet-des-visites';
import type { Persona } from '@/lib/navigation/personas';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyVisit } from '@/types/visit';

/** `metrics.next_payment` de `GET /api/dashboard/me` pour la vue `tenant` (`TenantMeMetrics`). */
interface EcheanceDuLocataire {
  readonly amount: number;
  readonly currency: string | null;
  readonly due_date: string | null;
}

interface VisiteDuLocataire {
  readonly scheduled_at: string | null;
  readonly property: { readonly title: string } | null;
}

interface VueDuLocataire {
  readonly data: {
    readonly role: string;
    readonly metrics: {
      readonly next_payment?: EcheanceDuLocataire | null;
      readonly overdue_count?: number;
      readonly overdue_amount?: number;
      readonly visits_upcoming?: readonly VisiteDuLocataire[];
    };
  };
}

export interface Rappel {
  /** Le loyer dû (le prochain), quand il y en a un. */
  readonly loyer: { readonly montant: number; readonly devise: string | null; readonly echeance: string | null } | null;
  /** Les échéances passées et non soldées. */
  readonly retard: { readonly nombre: number; readonly montant: number } | null;
  /** La prochaine visite (confirmée pour le personnel, à venir pour le client). */
  readonly visite: { readonly date: string; readonly bien: string | null } | null;
}

const AUCUN: Rappel = { loyer: null, retard: null, visite: null };

/** Les personas qui lisent leur vue de locataire (`/api/dashboard/me`, rôle `tenant`). */
const LECTEURS_DE_LA_VUE_LOCATAIRE: ReadonlySet<Persona> = new Set(['locataire', 'client']);
/** Les personas qui ont des visites à mener (`/api/property-visits`, portée du personnel ou du bailleur). */
const MENEURS_DE_VISITES: ReadonlySet<Persona> = new Set(['agent', 'admin-agence', 'bailleur', 'hote']);

/**
 * TCK-2493 — ce qui attend le persona, pour la carte de rappel de l'accueil et le détail de la ligne
 * « Loyer » du menu « Mon espace » (TCK-2494). Deux lectures existantes, jamais un endpoint neuf :
 *
 * - locataire et client : la vue `tenant` de `/api/dashboard/me` — prochaine échéance (`next_payment`,
 *   la règle *Impayé* de `CollectedPayments::leaseOwed`), retard, visites à venir ;
 * - bailleur, agent, admin, hôte : la prochaine visite CONFIRMÉE de `/api/property-visits`, une ligne
 *   (`per_page=1`, `fields[…]` minimal) — les compteurs, eux, sont ceux du menu.
 *
 * `actif: false` : aucune lecture (l'accueil d'un anonyme, un menu fermé).
 */
export function useRappelDuPersona(persona: Persona | null, { actif = true }: { readonly actif?: boolean } = {}): Rappel {
  const lireLaVue = actif && persona !== null && LECTEURS_DE_LA_VUE_LOCATAIRE.has(persona);
  const lireLesVisites = actif && persona !== null && MENEURS_DE_VISITES.has(persona);
  const { data: vue } = useApiQuery<VueDuLocataire>(['navigation-publique', 'rappel', 'dashboard-me'], '/api/dashboard/me', {
    enabled: lireLaVue,
    staleTime: 60_000,
  });
  const { data: visites } = useApiQuery<PaginatedResponse<PropertyVisit>>(
    ['navigation-publique', 'rappel', 'prochaine-visite'],
    '/api/property-visits',
    {
      enabled: lireLesVisites,
      staleTime: 60_000,
      params: {
        fields: { property_visits: ['id', 'property_id', 'scheduled_at', 'status'], properties: ['id', 'title'] },
        filter: { status: 'confirmed', scheduled_at_min: debutDeLaMinute(new Date()) },
        include: ['property'],
        sort: ['scheduled_at'],
        page: 1,
        per_page: 1,
      },
    },
  );

  if (lireLaVue && vue?.data.role === 'tenant') {
    const m = vue.data.metrics;
    const prochaine = m.next_payment ?? null;
    const visite = m.visits_upcoming?.find((v) => v.scheduled_at) ?? null;
    return {
      loyer: prochaine ? { montant: prochaine.amount, devise: prochaine.currency, echeance: prochaine.due_date } : null,
      retard: (m.overdue_count ?? 0) > 0 ? { nombre: m.overdue_count ?? 0, montant: m.overdue_amount ?? 0 } : null,
      visite: visite?.scheduled_at ? { date: visite.scheduled_at, bien: visite.property?.title ?? null } : null,
    };
  }
  if (lireLesVisites) {
    const v = visites?.data[0];
    return { ...AUCUN, visite: v?.scheduled_at ? { date: v.scheduled_at, bien: v.property?.title ?? null } : null };
  }
  return AUCUN;
}

/**
 * Ce que la ligne « Loyer » de « Moi » et de « Mon espace » dit du dû (TCK-2494 AC2), dans l'ordre
 * de la carte de rappel : un retard avant l'échéance à venir — le montant en retard EST ce qui est dû.
 */
export function useDetailDuLoyer(rappel: Rappel): string | null {
  const t = useTranslations('navigationPublique.rappel.loyer');
  const f = useFormatteurs();
  if (rappel.retard) return t('retardLigne', { montant: f.montant(rappel.retard.montant) });
  if (rappel.loyer) {
    return t('detail', {
      montant: f.montant(rappel.loyer.montant, rappel.loyer.devise),
      date: f.date(rappel.loyer.echeance, { day: 'numeric', month: 'short' }),
    });
  }
  return null;
}
