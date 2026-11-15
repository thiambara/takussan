'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BadgeCheck, ChevronRight, ListChecks, ShieldCheck, Users, type LucideIcon } from 'lucide-react';

import { BlocDeLOffre } from '@/components/billing/BlocDeLOffre';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { QuotaDeLAgence } from '@/lib/queries/offre';
import type { AgencySubscription } from '@/types/super-admin';

/**
 * TCK-2671 — l'écran « Offre » d'une agence déjà professionnelle (maquette `app-identite-agence`,
 * écran 8 : `BlocDejaPro`, `BlocOffre`, `BlocAcquisPro`).
 *
 * Écarts de donnée, écrits : la date d'approbation n'est dite que si une demande approuvée existe
 * (une agence créée `standard` n'en a pas) ; « Co-administration » ne nomme personne — la maquette
 * cite deux administratrices, que cette page ne lit pas.
 */
interface OffreDeLAgenceProProps {
  /** `null` : aucun abonnement actif — la carte le dit, sans prix. `'illisible'` : la lecture a échoué. */
  readonly abonnement: AgencySubscription | null | 'illisible';
  readonly quota: QuotaDeLAgence | null;
  /** `reviewed_at` de la demande approuvée, s'il y en a une. */
  readonly approuveeLe: string | null;
}

export function OffreDeLAgencePro({ abonnement, quota, approuveeLe }: OffreDeLAgenceProProps) {
  const t = useTranslations('agency.upgrade.page');
  const tAbo = useTranslations('billing.subscription');
  const tOffre = useTranslations('billing.offre');
  const fmt = useFormatteurs();

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4">
        <BadgeCheck className="mt-0.5 size-5 flex-none text-success" strokeWidth={1.75} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-titre-court font-semibold tracking-titre">{t('already_standard.title')}</p>
          <p className="mt-1 text-sm text-pretty text-encre-douce">
            {t('already_standard.body')}
            {approuveeLe ? <> {t('already_standard.approuvee', { date: fmt.date(approuveeLe, { dateStyle: 'long' }) })}</> : null}
          </p>
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {abonnement === 'illisible' ? (
          <section role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-foreground">{tAbo('loadFailed')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{tOffre('rechargez')}</p>
          </section>
        ) : abonnement ? (
          <BlocDeLOffre abonnement={abonnement} quota={quota} lienFactures />
        ) : (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-corps font-semibold">{tAbo('none')}</h2>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">{tAbo('noneDescription')}</p>
          </section>
        )}
        <AcquisDuPassage agents={quota?.agents?.used ?? null} />
      </div>
    </div>
  );
}

function AcquisDuPassage({ agents }: { readonly agents: number | null }) {
  const t = useTranslations('agency.upgrade.page.acquis');
  const lignes: readonly (readonly [LucideIcon, string, string, string])[] = [
    [Users, t('equipe.titre'), agents === null ? t('equipe.detail') : t('equipe.detailCompte', { n: agents }), '/app/agency/team'],
    [ShieldCheck, t('coAdministration.titre'), t('coAdministration.detail'), '/app/agency/team'],
    [ListChecks, t('roles.titre'), t('roles.detail'), '/app/agency/roles'],
  ];
  return (
    <section aria-labelledby="acquis-du-passage-titre" className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 id="acquis-du-passage-titre" className="truncate text-corps font-semibold">
          {t('titre')}
        </h2>
      </div>
      <ul>
        {lignes.map(([Icone, titre, detail, href]) => (
          <li key={titre} className="border-b border-border/70 last:border-b-0">
            <Link
              href={href}
              className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            >
              <Icone className="size-icone flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-corps font-medium">{titre}</span>
                <span className="block text-ui text-muted-foreground">{detail}</span>
              </span>
              <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
