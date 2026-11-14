'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';

import { bornesDuMois, largeursDeLaBarre, type LoyersDuMois as Loyers } from '@/lib/accueil/loyers-du-mois';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

/**
 * TCK-2624 (lot 2, AC4 ; maquette `app-accueil` a, « Loyers de novembre ») — « 8 reçus sur 14 », la
 * barre des reçus, et « Reçus 11,4 M F ». « Voir les loyers » ouvre l'historique des paiements sur le
 * mois.
 *
 * « En retard » et « À venir » sont servis pour le mois par l'API depuis TCK-2774 ; ils ne se rendent
 * que servis et cohérents (`lireLoyersDuMois`), aucun chiffre n'est déduit ici (décision 2, validée le
 * 2026-11-13).
 *
 * TCK-2820 — « 1 reçu puis remboursé » : un loyer échu rendu au locataire n'est ni en retard ni à
 * relancer. Il se dit sous les segments, en encre neutre, sans part de la barre ni couleur d'alerte.
 */
export function LoyersDuMois({ loyers, jour, className }: { readonly loyers: Loyers; readonly jour: string; readonly className?: string }) {
  const t = useTranslations('accueil.bailleur.loyersDuMois');
  const f = useFormatteurs();
  const { du, au, mois } = bornesDuMois(jour);
  const nomDuMois = f.date(`${du}T12:00:00Z`, { month: 'long' });
  const largeurs = largeursDeLaBarre(loyers);
  const segments = loyers.enRetard && loyers.aVenir ? { enRetard: loyers.enRetard, aVenir: loyers.aVenir } : null;

  return (
    <section data-slot="loyers-du-mois" aria-labelledby="loyers-du-mois-titre" className={cn('rounded-2xl border border-border bg-card p-4 md:p-5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="loyers-du-mois-titre" className="text-ui font-medium text-muted-foreground">
          {t('titre', { mois: nomDuMois, elision: /^[aeiouyhâéèêîïôû]/i.test(nomDuMois) ? 'oui' : 'non', n: mois })}
        </h2>
        <Link
          href={`/app/payments?tab=history&date_from=${du}&date_to=${au}`}
          className="inline-flex flex-none items-center gap-0.5 rounded text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('voir')}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-1 font-display text-2xl font-semibold tracking-titre tabular-nums">
        {t.rich('recusSur', {
          recus: loyers.recus,
          attendus: loyers.attendus,
          sur: (morceau) => <span className="font-sans text-base font-normal text-muted-foreground">{morceau}</span>,
        })}
      </p>
      <div
        className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={t('barre', { recus: loyers.recus, attendus: loyers.attendus })}
      >
        <span className="bg-success" style={{ width: `${largeurs.recus}%` }} />
        {segments ? <span className="bg-destructive" style={{ width: `${largeurs.enRetard}%` }} /> : null}
      </div>
      <div className={cn('mt-3 grid gap-2 text-ui', segments ? 'grid-cols-3' : 'grid-cols-1')}>
        <p>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full bg-success" aria-hidden="true" />
            {t('recus')}
          </span>
          <span className="font-semibold tabular-nums">{f.montantAbrege(loyers.montantRecu, 'XOF')}</span>
        </p>
        {segments ? (
          <>
            <p>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
                {t('enRetard', { n: segments.enRetard.n })}
              </span>
              {segments.enRetard.montant !== null ? (
                <span className="font-semibold tabular-nums text-destructive">{f.montantAbrege(segments.enRetard.montant, 'XOF')}</span>
              ) : null}
            </p>
            <p>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full bg-border" aria-hidden="true" />
                {t('aVenir', { n: segments.aVenir.n })}
              </span>
              {segments.aVenir.montant !== null ? <span className="font-semibold tabular-nums">{f.montantAbrege(segments.aVenir.montant, 'XOF')}</span> : null}
            </p>
          </>
        ) : null}
      </div>
      {loyers.rembourses ? (
        <p data-slot="loyers-rembourses" className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-ui text-muted-foreground">
          <span>{t('rembourses', { n: loyers.rembourses.n })}</span>
          {loyers.rembourses.montant !== null ? (
            <span className="font-semibold tabular-nums text-foreground">{f.montantAbrege(loyers.rembourses.montant, 'XOF')}</span>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
