'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MODES_DE_LISTE,
  ONGLETS_ANNONCES,
  PASTILLES_ANNONCES,
  PASTILLES_GESTION,
  ecrireModeDeListe,
  pastilleAnnoncesActive,
  pastilleGestionActive,
  pastilleGestionProposee,
  requeteDeLaPastille,
  requeteDeLaPastilleAnnonces,
  requeteDesSuivants,
  requeteDuMode,
  suivantsProposes,
  type ModeDeListe,
  type PastilleAnnonces,
  type PastilleGestion,
} from '@/lib/biens/mode-de-liste';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PaginationMeta } from '@/types/api';
import type { ResumeDuPortefeuille } from '@/types/property';

/**
 * TCK-2638 — le sélecteur « Gestion · Annonces » et les filtres comptés du mode Gestion : les
 * pastilles du téléphone et les quatre tuiles du bureau. Tous écrivent l'URL (un lien garde la vue)
 * et lisent les comptes de `portfolio-summary`, reçus de la page en un seul appel (AC3).
 */

/** Le contrôle segmenté : pleine largeur au téléphone, calé sur son contenu dès `lg`. */
export function SelecteurDeMode({ mode, className }: { readonly mode: ModeDeListe; readonly className?: string }) {
  const t = useTranslations('propertyDashboard.gestion.modes');
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
  const t = useTranslations('propertyDashboard.gestion.pastilles');
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
  const t = useTranslations('propertyDashboard.gestion.tuiles');
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

const COMPTE_ANNONCES: Record<PastilleAnnonces, keyof ResumeDuPortefeuille> = Object.fromEntries(
  ONGLETS_ANNONCES.map((o) => [o.cle, o.compte]),
) as Record<PastilleAnnonces, keyof ResumeDuPortefeuille>;

/**
 * TCK-2638 (lot B) — les pastilles défilantes du mode Annonces, sous `lg` : « Toutes » (décision 1 a),
 * « En ligne », « À valider », « Brouillons », « Hors ligne », comptées par `portfolio-summary`.
 */
export function PastillesAnnonces({ resume, className }: { readonly resume: ResumeDuPortefeuille; readonly className?: string }) {
  const t = useTranslations('propertyDashboard.annonces.pastilles');
  const fmt = useFormatteurs();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const active = pastilleAnnoncesActive(params);
  return (
    <RangeeDePuces aria-label={t('aria')} className={className}>
      {PASTILLES_ANNONCES.map((p) => (
        <PuceDeFiltre
          key={p.cle}
          active={p.cle === active}
          compte={fmt.nombre(resume[COMPTE_ANNONCES[p.cle]])}
          onClick={() => router.replace(`?${requeteDeLaPastilleAnnonces(params, p.cle)}`)}
        >
          {t(p.cle)}
        </PuceDeFiltre>
      ))}
    </RangeeDePuces>
  );
}

/**
 * Les onglets soulignés du bureau (dès `lg`, maquette a-1) : les pastilles, puis « Vendus, loués » et
 * « Archivés » — les deux tuiles d'avant, gardées. Chacun est le lien de son filtre ; l'actif ramène à
 * « Toutes ». La rangée défile dans son cadre si elle manque de place, jamais la page.
 */
export function OngletsAnnonces({ resume, className }: { readonly resume: ResumeDuPortefeuille; readonly className?: string }) {
  const t = useTranslations('propertyDashboard.annonces.pastilles');
  const fmt = useFormatteurs();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const active = pastilleAnnoncesActive(params);
  return (
    <nav aria-label={t('aria')} className={cn('min-w-0 overflow-x-auto [scrollbar-width:none]', className)}>
      <ul className="flex gap-6 border-b border-border">
        {ONGLETS_ANNONCES.map((o) => {
          const actif = o.cle === active;
          return (
            <li key={o.cle} className="flex-none">
              <Link
                href={`?${requeteDeLaPastilleAnnonces(params, actif && o.cle !== 'toutes' ? 'toutes' : o.cle)}`}
                replace
                aria-current={actif ? 'true' : undefined}
                className={cn(
                  'relative flex items-center gap-1.5 whitespace-nowrap pb-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring',
                  actif
                    ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(o.cle)}
                <span className="text-xs tabular-nums text-muted-foreground">{fmt.nombre(resume[COMPTE_ANNONCES[o.cle]])}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * La jauge du quota d'annonces (`GET /api/me/quota`) : discrète en bas de liste au téléphone, fine à
 * côté des onglets au bureau. Elle dit ce qu'elle compte — les annonces ACTIVES (ADR-0097 § 6 : le
 * quota ne regarde pas la visibilité), pas les annonces en ligne que montre la maquette.
 */
export function JaugeDuQuota({
  used,
  limit,
  presentation,
  className,
}: {
  readonly used: number;
  readonly limit: number;
  readonly presentation: 'telephone' | 'bureau';
  readonly className?: string;
}) {
  const t = useTranslations('propertyDashboard.annonces.quota');
  const texte = t('texte', { used, limit });
  const definition = t('definition');
  const jauge = (
    <Progress
      aria-label={t('aria')}
      value={Math.min(used, limit)}
      max={Math.max(limit, 1)}
      ton={used >= limit ? 'warning' : 'primary'}
      className={presentation === 'telephone' ? 'mt-2.5' : 'mt-1.5'}
    />
  );
  if (presentation === 'telephone') {
    return (
      <section aria-label={t('aria')} data-testid="jauge-du-quota" className={cn('rounded-xl bg-muted/60 p-4', className)}>
        <p className="text-sm tabular-nums">{texte}</p>
        <p className="text-ui text-muted-foreground">{definition}</p>
        {jauge}
      </section>
    );
  }
  return (
    <section aria-label={t('aria')} data-testid="jauge-du-quota" title={definition} className={cn('w-60 flex-none pb-3', className)}>
      <p className="text-ui tabular-nums">{texte}</p>
      {jauge}
    </section>
  );
}

/**
 * TCK-2638 — au téléphone (sous `lg`), « Afficher les 20 suivants » : la liste s'allonge (`voir`), la
 * page reste la première. Au-delà de 100 biens montrés (la borne de l'API), la pagination reprend.
 */
export function AfficherLesSuivants({ meta, className }: { readonly meta: PaginationMeta; readonly className?: string }) {
  const t = useTranslations('propertyDashboard.pagination');
  const fmt = useFormatteurs();
  const searchParams = useSearchParams();
  if (!suivantsProposes(meta)) return null;
  const affiches = meta.per_page;
  return (
    <div className={cn('text-center', className)}>
      <p className="text-ui tabular-nums text-muted-foreground">
        {t('affiches', { shown: fmt.nombre(affiches), total: fmt.nombre(meta.total) })}
      </p>
      <Link
        href={`?${requeteDesSuivants(new URLSearchParams(searchParams.toString()), meta.per_page)}`}
        replace
        scroll={false}
        className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-3 h-12 w-full')}
      >
        {t('suivants', { count: Math.min(20, meta.total - affiches) })}
      </Link>
    </div>
  );
}
