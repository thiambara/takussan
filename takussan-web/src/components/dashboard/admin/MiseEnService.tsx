'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ChevronRight, Circle } from 'lucide-react';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { CheminAdmin } from '@/lib/access/pages-admin';

/**
 * TCK-589 — la carte « Mise en service » en tête du tableau de bord d'agence (`/app/overview/agency`
 * depuis TCK-647 ; ses libellés ont quitté `admin.pages.setupStatus` pour `dashboard.agencySetup`,
 * l'espace `admin` n'étant pas servi sous `/app`).
 *
 * Une ligne par étape que l'API déclare (`GET /api/agencies/{agency}/setup-status`) : cochée quand
 * elle est faite, sinon un lien DIRECT vers l'écran qui la fait. La carte disparaît quand tout est
 * fait, et ne rend rien sur un refus (un agent reçoit 403) ou une panne — elle accompagne, elle ne
 * bloque pas.
 *
 * ⚠ **Aucune étape n'est inventée ici** : la liste est celle de l'API. Une clé que ce fichier ne
 * sait pas libeller n'est pas affichée (pas de chemin de clé brut à l'écran), mais elle COMPTE dans
 * la progression — le total reste celui du serveur.
 */
export interface EtapeMiseEnService {
  readonly key: string;
  readonly done: boolean;
}

interface SetupStatusResponse {
  readonly data: { readonly complete: boolean; readonly steps: readonly EtapeMiseEnService[] };
}

/**
 * L'écran qui fait chaque étape. Les pages d'administration sont tenues à la table des pages
 * (`CheminAdmin`, TCK-649) : un chemin qu'elle ne déclare pas ne compile pas.
 */
const DESTINATIONS: Readonly<Record<string, CheminAdmin | '/app/properties/new' | '/app/profile'>> = {
  kyc_verified: '/app/agency/kyc',
  logo: '/app/agency',
  commission_rate: '/app/agency',
  payment_integration: '/app/agency/integrations',
  first_member: '/app/agency/team',
  first_published_property: '/app/properties/new',
  admin_two_factor: '/app/profile',
};

/** L'étape qui en conditionne d'autres, montrée la première (TCK-761). */
const ETAPE_EN_TETE = 'admin_two_factor';

interface MiseEnServiceProps {
  readonly agencyId: number | null;
}

export function MiseEnService({ agencyId }: MiseEnServiceProps) {
  const t = useTranslations('dashboard.agencySetup');
  const { data } = useApiQuery<SetupStatusResponse>(
    ['agencies', agencyId, 'setup-status'],
    `/api/agencies/${agencyId}/setup-status`,
    { enabled: agencyId !== null, retry: false },
  );

  if (!data || data.data.complete) return null;
  const etapes = data.data.steps;
  if (etapes.length === 0 || etapes.every((e) => e.done)) return null;

  const faites = etapes.filter((e) => e.done).length;
  // TCK-761 (P15.04) — la 2FA de l'admin passe en tête : elle conditionne trois autres étapes
  // (commission, intégration de paiement, premier membre), que l'API refuse sans elle
  // (`ProtectedActions::AGENCY_TWO_FACTOR`). Les autres gardent l'ordre de l'API
  // (`sort` est stable, et trie la copie que rend `filter`).
  const connues = etapes
    .filter((e) => e.key in DESTINATIONS)
    .sort((a, b) => Number(b.key === ETAPE_EN_TETE) - Number(a.key === ETAPE_EN_TETE));

  return (
    <section
      aria-labelledby="mise-en-service-titre"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
      data-testid="agency-setup-status"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="mise-en-service-titre" className="text-base font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          {t('progress', { done: faites, total: etapes.length })}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">{t('description')}</p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={etapes.length}
        aria-valuenow={faites}
        aria-label={t('progress', { done: faites, total: etapes.length })}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${Math.round((faites / etapes.length) * 100)}%` }}
        />
      </div>
      <ul className="mt-3 divide-y divide-border">
        {connues.map((etape) =>
          etape.done ? (
            <li key={etape.key} className="flex min-h-11 items-center gap-3 py-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              <span className="min-w-0 flex-1 line-through decoration-muted-foreground/40">
                {t(`steps.${etape.key}`)}
              </span>
              <span className="sr-only">{t('done')}</span>
            </li>
          ) : (
            <li key={etape.key}>
              <Link
                href={DESTINATIONS[etape.key]!}
                className="flex min-h-11 items-center gap-3 rounded-md py-2 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">{t(`steps.${etape.key}`)}</span>
                <span className="sr-only">{t('todo')}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
