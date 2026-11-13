'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ChiffreDuMois } from '@/lib/accueil/chiffres-du-mois';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import { ErreurDeBloc } from './EtatsDeBloc';

/**
 * TCK-2622 — « Ce mois » (maquette `app-accueil` a) : 2 à 4 chiffres, CHACUN un lien vers la liste
 * qu'il compte, avec ses unités (« Impayés · 33,7 M F · 16 échéances »). Au téléphone, une rangée
 * de puces qui défile ; au bureau, des tuiles à flèche en coin. Les chiffres viennent de
 * `chiffresDuMois` (pur).
 *
 * En échec de `/dashboard/me`, le bloc dit son erreur avec « Réessayer » (la page relit le serveur) :
 * le salut, la mise en service et les bandeaux restent.
 */

interface CeMoisProps {
  /** `null` : la lecture a échoué. */
  readonly chiffres: readonly ChiffreDuMois[] | null;
  /** « Voir le rapport du mois », s'il y en a un. */
  readonly rapport: string | null;
  /** Sans colonne de droite (aucun bloc du persona), les tuiles tiennent sur une ligne au large. */
  readonly pleineLargeur?: boolean;
}

type Texte = { readonly libelle: string; readonly puce: string; readonly valeur: string; readonly contexte: string | null };

function useTexteDuChiffre() {
  const t = useTranslations('accueil.ceMois');
  const f = useFormatteurs();
  return (c: ChiffreDuMois): Texte => {
    const valeur =
      c.valeur === null
        ? '—'
        : c.forme === 'montant'
          ? f.montantAbrege(c.valeur, 'XOF')
          : c.forme === 'pourcent'
            ? f.pourcentage(c.valeur / 100)
            : f.nombre(c.valeur);
    const x = c.contexte;
    const contexte = x
      ? t(`contextes.${x.cle}`, {
          n: x.n ?? 0,
          libres: x.libres ?? 0,
          montant: x.montant !== undefined ? f.montantAbrege(x.montant, 'XOF') : '',
          jour: x.jour ? f.jourMois(x.jour) : '',
        })
      : null;
    const cle = c.cle as CleConnue;
    return {
      libelle: c.libelle ?? t(`libelles.${cle}`),
      puce: c.libelle ?? t(`puces.${cle}`),
      valeur,
      contexte,
    };
  };
}

/** Les chiffres que ce composant sait libeller ; un KPI de l'agence porte son libellé saisi. */
type CleConnue = 'encaisse' | 'impayes' | 'occupation' | 'bauxActifs' | 'biens' | 'enRetard' | 'prochaineEcheance' | 'documentsRecents';

const LIEN = 'outline-none focus-visible:ring-3 focus-visible:ring-ring';

export function CeMois({ chiffres, rapport, pleineLargeur = false }: CeMoisProps) {
  const t = useTranslations('accueil.ceMois');
  const tBlocs = useTranslations('accueil.blocs');
  const router = useRouter();
  const texte = useTexteDuChiffre();

  if (chiffres !== null && chiffres.length === 0) return null;
  const textes = chiffres?.map((c) => ({ c, x: texte(c) })) ?? [];
  const erreur = chiffres === null ? <ErreurDeBloc quoi={tBlocs('quoi.ceMois')} onReessayer={() => router.refresh()} /> : null;

  return (
    <section data-slot="ce-mois" aria-labelledby="ce-mois-titre">
      {/* ─── Le téléphone : l'intertitre et ses puces ─── */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between gap-3 px-4">
          <h2 id="ce-mois-titre" className="text-ui font-semibold text-muted-foreground">
            {t('titre')}
          </h2>
          {rapport ? (
            <Link href={rapport} className={cn('inline-flex items-center gap-0.5 rounded text-ui font-medium text-primary', LIEN)}>
              {t('rapportCourt')}
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
        {erreur ? (
          <div className="mt-2 px-4">{erreur}</div>
        ) : (
          <ul className="mt-2 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {textes.map(({ c, x }) => (
              <li key={c.cle} className="flex-none">
                <Link
                  href={c.href}
                  data-chiffre={c.cle}
                  className={cn('inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm hover:bg-muted', LIEN)}
                >
                  <span className="font-semibold tabular-nums">{x.valeur}</span>
                  <span className="text-muted-foreground">{x.puce}</span>
                  {x.contexte && c.contexte?.cle === 'echeances' ? (
                    <span className={cn('tabular-nums', c.ton === 'danger' ? 'font-medium text-destructive' : 'text-muted-foreground')}>· {x.contexte}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── Le bureau : l'intertitre et ses tuiles ─── */}
      <div className="max-md:hidden">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-ui font-semibold text-muted-foreground">{t('titre')}</h2>
          {rapport ? (
            <Link href={rapport} className={cn('inline-flex items-center gap-0.5 rounded text-sm font-medium text-primary', LIEN)}>
              {t('rapport')}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
        {erreur ?? (
          <ul className={cn('grid grid-cols-2 gap-3', pleineLargeur && 'xl:grid-cols-4')}>
            {textes.map(({ c, x }) => (
              <li key={c.cle} className="min-w-0">
                <Link href={c.href} data-chiffre={c.cle} className={cn('block h-full rounded-xl border border-border bg-card p-4 hover:bg-muted', LIEN)}>
                  <span className="flex items-center gap-2 text-ui text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">{x.libelle}</span>
                    <ArrowUpRight className="size-3.5 flex-none" aria-hidden="true" />
                  </span>
                  <span className="mt-1 block font-display text-affiche-22 font-semibold tabular-nums tracking-titre">{x.valeur}</span>
                  {x.contexte ? (
                    <span className={cn('mt-0.5 block text-xs tabular-nums', c.ton === 'danger' ? 'font-medium text-destructive' : 'text-muted-foreground')}>{x.contexte}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
