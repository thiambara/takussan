'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ChevronRight, Circle } from 'lucide-react';

import { useApiQuery } from '@/hooks/useApiQuery';
import { cheminMiseEnService, cleMiseEnService, type SetupStatusResponse } from '@/lib/queries/mise-en-service';
import type { AgencyKind } from '@/types/agency';
import { DESTINATIONS_DE_MISE_EN_SERVICE as DESTINATIONS, etatDeMiseEnService } from './etapes-de-mise-en-service';

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

interface MiseEnServiceProps {
  readonly agencyId: number | null;
  /**
   * Le `kind` de l'agence, qui filtre les étapes. `standard` par défaut : c'est la seule agence
   * que sert `/app/overview/agency`.
   */
  readonly kind?: AgencyKind | null;
}

export function MiseEnService({ agencyId, kind = 'standard' }: MiseEnServiceProps) {
  const t = useTranslations('dashboard.agencySetup');
  const { data } = useApiQuery<SetupStatusResponse>(
    cleMiseEnService(agencyId),
    // TCK-1830 — désactivée sans agence : le chemin n'est construit que pour un identifiant.
    agencyId !== null ? cheminMiseEnService(agencyId) : '',
    { enabled: agencyId !== null, retry: false },
  );

  // TCK-2622 — la règle des étapes (applicables, 2FA en tête, total du serveur) est partagée avec le
  // bandeau d'une ligne de l'accueil : `etapes-de-mise-en-service.ts`.
  const etat = etatDeMiseEnService(data, kind);
  if (!etat) return null;
  const { faites, connues, total } = etat;

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
          {t('progress', { done: faites, total })}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">{t('description')}</p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={faites}
        aria-label={t('progress', { done: faites, total })}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${Math.round((faites / total) * 100)}%` }}
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
