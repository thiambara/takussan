'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MODES_DE_LISTE,
  PASTILLES_GESTION,
  ecrireModeDeListe,
  pastilleGestionActive,
  pastilleGestionProposee,
  requeteDeLaPastille,
  requeteDuMode,
  type ModeDeListe,
  type PastilleGestion,
} from '@/lib/biens/mode-de-liste';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { ResumeDuPortefeuille } from '@/types/property';

/**
 * TCK-2638 — le sélecteur « Gestion · Annonces » et les filtres comptés du mode Gestion : les
 * pastilles du téléphone et les quatre tuiles du bureau. Tous écrivent l'URL (un lien garde la vue)
 * et lisent les comptes de `portfolio-summary`, reçus de la page en un seul appel (AC3).
 */

/** Le contrôle segmenté : pleine largeur au téléphone, calé sur son contenu dès `lg`. */
export function SelecteurDeMode({ mode, className }: { readonly mode: ModeDeListe; readonly className?: string }) {
  const t = useTranslations('property.dashboard.gestion.modes');
  const router = useRouter();
  const searchParams = useSearchParams();
  const choisir = (valeur: unknown) => {
    const suivant = MODES_DE_LISTE.find((m) => m === valeur);
    if (!suivant || suivant === mode) return;
    // La mémoire de l'appareil d'abord : la page serveur la relit si l'URL perd le mode.
    ecrireModeDeListe(suivant);
    router.replace(`?${requeteDuMode(new URLSearchParams(searchParams.toString()), suivant)}`);
  };
  return (
    <Tabs value={mode} onValueChange={choisir} className={cn('lg:items-start', className)}>
      <TabsList aria-label={t('aria')} className="w-full lg:w-auto">
        {MODES_DE_LISTE.map((m) => (
          <TabsTrigger key={m} value={m}>
            {t(m)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

const COMPTE_DE: Record<PastilleGestion, keyof ResumeDuPortefeuille> = Object.fromEntries(
  PASTILLES_GESTION.map((p) => [p.cle, p.compte]),
) as Record<PastilleGestion, keyof ResumeDuPortefeuille>;

/**
 * Les pastilles défilantes du téléphone (sous `lg`) : Tous, Occupés, Vacants, Loyer en retard, Préavis,
 * et « À vendre » quand le portefeuille en compte (TCK-2638).
 */
export function PastillesGestion({ resume, className }: { readonly resume: ResumeDuPortefeuille; readonly className?: string }) {
  const t = useTranslations('property.dashboard.gestion.pastilles');
  const fmt = useFormatteurs();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const active = pastilleGestionActive(params);
  return (
    <RangeeDePuces aria-label={t('aria')} className={className}>
      {PASTILLES_GESTION.filter((p) => pastilleGestionProposee(p.cle, resume.for_sale, active)).map((p) => (
        <PuceDeFiltre
          key={p.cle}
          active={p.cle === active}
          compte={fmt.nombre(resume[COMPTE_DE[p.cle]])}
          onClick={() => router.replace(`?${requeteDeLaPastille(params, p.cle)}`)}
        >
          {t(p.cle)}
        </PuceDeFiltre>
      ))}
    </RangeeDePuces>
  );
}

/**
 * Les quatre tuiles du bureau (dès `lg`) : chacune est le lien de son filtre ; la tuile active
 * ramène à « Tous ». Le compte de chaque tuile est celui de la liste qu'elle ouvre (TCK-2637, AC3).
 * TCK-2638 — une cinquième, « À vendre », quand le portefeuille a des biens hors location : ils ne
 * sont ni occupés ni vacants, et sa liste est `filter[occupancy]=not_rental`.
 */
export function TuilesGestion({ resume, className }: { readonly resume: ResumeDuPortefeuille; readonly className?: string }) {
  const t = useTranslations('property.dashboard.gestion.tuiles');
  const fmt = useFormatteurs();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const active = pastilleGestionActive(params);
  const lien = (cle: PastilleGestion) => `?${requeteDeLaPastille(params, active === cle ? 'tous' : cle)}`;
  // TCK-2638 — le taux d'occupation se lit sur les biens À LOUER (occupés + vacants) : une vente n'est ni
  // occupée ni vacante, et la compter au dénominateur ferait baisser le taux sans qu'aucun bien se vide.
  const aLouer = resume.occupied + resume.vacant;
  const tuiles: readonly {
    readonly cle: PastilleGestion;
    readonly libelle: string;
    readonly valeur: ReactNode;
    readonly contexte: string;
    readonly alerte: boolean;
  }[] = [
    {
      cle: 'occupes',
      libelle: t('occupes'),
      valeur: (
        <>
          {fmt.nombre(resume.occupied)}{' '}
          <span className="text-base font-normal text-muted-foreground">{t('surTotal', { total: fmt.nombre(aLouer) })}</span>
        </>
      ),
      contexte: t('partALouer', { part: fmt.pourcentage(aLouer > 0 ? resume.occupied / aLouer : 0) }),
      alerte: false,
    },
    {
      cle: 'vacants',
      libelle: t('vacants'),
      valeur: fmt.nombre(resume.vacant),
      contexte: t('vacantsLongs', { count: resume.vacant_over_60_days }),
      alerte: resume.vacant_over_60_days > 0,
    },
    {
      cle: 'retard',
      libelle: t('retard'),
      valeur: fmt.nombre(resume.rent_late),
      contexte:
        resume.rent_late > 0 ? t('aEncaisser', { montant: fmt.montantCourt(resume.rent_late_amount, 'XOF') }) : t('aJour'),
      alerte: resume.rent_late > 0,
    },
    {
      cle: 'preavis',
      libelle: t('preavis'),
      valeur: fmt.nombre(resume.notice),
      contexte: t('sorties', { count: resume.notice }),
      alerte: false,
    },
    ...(pastilleGestionProposee('aVendre', resume.for_sale, active)
      ? [
          {
            cle: 'aVendre' as const,
            libelle: t('aVendre'),
            valeur: fmt.nombre(resume.for_sale),
            contexte: t('horsLocation'),
            alerte: false,
          },
        ]
      : []),
  ];
  return (
    <nav aria-label={t('aria')} className={cn('grid gap-4', tuiles.length > 4 ? 'grid-cols-5' : 'grid-cols-4', className)}>
      {tuiles.map((tuile) => {
        const actif = tuile.cle === active;
        return (
          <Link
            key={tuile.cle}
            href={lien(tuile.cle)}
            replace
            aria-current={actif ? 'true' : undefined}
            className={cn(
              'rounded-xl border bg-card p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring',
              actif ? 'border-foreground' : 'border-border',
            )}
          >
            <span className="block text-ui text-muted-foreground">{tuile.libelle}</span>
            <span className="mt-1 block font-display text-2xl font-semibold tabular-nums tracking-tight">{tuile.valeur}</span>
            <span className={cn('mt-1 block text-xs', tuile.alerte ? 'text-destructive' : 'text-muted-foreground')}>
              {tuile.contexte}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
