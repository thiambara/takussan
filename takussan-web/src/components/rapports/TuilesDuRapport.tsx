'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { ChiffreDuRapport } from '@/lib/rapports/chiffres';
import { pourcentMesure, pourcentSaisi } from '@/lib/rapports/pourcentages';
import { cn } from '@/lib/utils';

interface TuilesDuRapportProps {
  readonly chiffres: readonly ChiffreDuRapport[];
  /** Colonnes au bureau : 4 (agent), 5 (bailleur) ou 6 (admin). Toujours 2 au téléphone. */
  readonly colonnes?: 4 | 5 | 6;
  /**
   * Au téléphone, les N premiers seulement, puis « Les 6 chiffres » qui déplie le reste (maquette de
   * l'admin : quatre tuiles et le lien). Sans valeur, tous.
   */
  readonly visiblesAuTelephone?: number;
  readonly className?: string;
}

/** Le libellé et le contexte d'un chiffre, dans la langue et les unités de la page. */
export function useTexteDuChiffreDuRapport() {
  const t = useTranslations('rapports.chiffres');
  const f = useFormatteurs();
  const valeur = (c: ChiffreDuRapport): string =>
    c.valeur === null
      ? '—'
      : c.forme === 'montant'
        ? f.montantAbrege(c.valeur, 'XOF')
        : c.forme === 'pourcent'
          ? pourcentMesure(f, c.valeur)
          : c.forme === 'biens'
            ? t('valeurs.biens', { n: c.valeur })
            : f.nombre(c.valeur);
  const contexte = (c: ChiffreDuRapport): string | null => {
    const x = c.contexte;
    if (!x) return null;
    switch (x.cle) {
      case 'variation':
        return t('contextes.variation', {
          signe: x.pourcent > 0 ? '+' : x.pourcent < 0 ? '−' : '',
          pourcent: f.nombre(Math.abs(x.pourcent)),
          mois: f.date(`${x.mois}-15T12:00:00Z`, { month: 'long' }),
        });
      case 'surAttendus':
      case 'cetteAnnee':
        return t(`contextes.${x.cle}`, {
          montant: f.montantAbrege(x.montant, 'XOF'),
        });
      case 'echeances':
      case 'bauxCetteAnnee':
        return t(`contextes.${x.cle}`, { n: x.n });
      case 'loues':
        return t('contextes.loues', {
          occupes: x.occupes,
          eligibles: x.eligibles,
        });
      case 'publies':
        return t('contextes.publies', { total: x.total });
      case 'portefeuille':
        return t('contextes.portefeuille', {
          loues: x.loues,
          libres: x.libres,
          autres: x.autres,
        });
      case 'septJours':
        return t('contextes.septJours');
      case 'seuil':
        return t('contextes.seuil', { seuil: pourcentSaisi(f, x.valeur) });
    }
  };
  return {
    libelle: (c: ChiffreDuRapport) => c.libelle ?? t(`libelles.${c.cle}`),
    valeur,
    contexte,
  };
}

/**
 * TCK-2628 — les chiffres de la vue d'ensemble : CHACUN un lien vers la liste qu'il compte (maquette
 * `TuileLien`) quand la persona l'ouvre, deux colonnes au téléphone, quatre ou six au bureau. Le ton (danger, succès) ne colore
 * que le contexte, qui le dit en mots.
 */
export function TuilesDuRapport({ chiffres, colonnes = 4, visiblesAuTelephone, className }: TuilesDuRapportProps) {
  const texte = useTexteDuChiffreDuRapport();
  const t = useTranslations('rapports.chiffres');
  const [deplie, setDeplie] = useState(false);
  const replie = visiblesAuTelephone !== undefined && chiffres.length > visiblesAuTelephone;
  return (
    <>
      <ul
        data-slot="tuiles-du-rapport"
        className={cn('grid grid-cols-2 gap-3', colonnes === 4 ? 'xl:grid-cols-4' : colonnes === 5 ? 'lg:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-3 xl:grid-cols-6', className)}
      >
        {chiffres.map((c, i) => {
          const cache = replie && !deplie && i >= (visiblesAuTelephone ?? 0);
          const contexte = texte.contexte(c);
          // TCK-2801 — le portefeuille du bailleur : au téléphone, une carte pleine largeur avec sa jauge empilée
          // et sa légende (maquette `BarrePortefeuille`) ; au bureau, une tuile au texte (maquette du bureau).
          const portefeuille = c.contexte?.cle === 'portefeuille' ? c.contexte : null;
          const corps = (
            <>
              <span className="flex items-center text-ui text-muted-foreground">
                <span className="min-w-0 truncate">{texte.libelle(c)}</span>
                {c.href ? <ArrowUpRight className="ml-auto size-3.5 flex-none" aria-hidden="true" /> : null}
              </span>
              <span className="mt-1 block font-display text-affiche-22 font-semibold tracking-titre tabular-nums">{texte.valeur(c)}</span>
              {portefeuille ? <JaugeDuPortefeuille {...portefeuille} /> : null}
              {contexte ? (
                <span
                  className={cn(
                    'mt-0.5 block text-xs',
                    portefeuille && 'max-md:hidden',
                    c.ton === 'danger' ? 'font-medium text-destructive' : c.ton === 'succes' ? 'font-medium text-success' : 'text-muted-foreground',
                  )}
                >
                  {contexte}
                </span>
              ) : null}
            </>
          );
          return (
            <li key={c.cle} className={cn('min-w-0', cache && 'max-md:hidden', portefeuille && 'max-md:col-span-2')}>
              {c.href ? (
                <Link
                  href={c.href}
                  data-chiffre={c.cle}
                  className="block h-full rounded-xl border border-border bg-card p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring"
                >
                  {corps}
                </Link>
              ) : (
                // Une liste que cette persona n'ouvre pas : le chiffre se lit, sans lien qui la renverrait.
                <div data-chiffre={c.cle} className="h-full rounded-xl border border-border bg-card p-4">
                  {corps}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {replie ? (
        <button
          type="button"
          aria-expanded={deplie}
          onClick={() => setDeplie((d) => !d)}
          className="mt-1 inline-flex h-11 items-center gap-0.5 rounded-sm text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring md:hidden"
        >
          {deplie ? t('moins') : t('tous', { n: chiffres.length })}
          <ChevronRight className={cn('size-3.5 transition-transform', deplie && '-rotate-90')} aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}

/**
 * TCK-2801 (fiche TCK-2628, O5) — la jauge du portefeuille au téléphone : loués en plein, libres et autres en
 * retrait, chacun proportionnel au total, puis la légende avec les comptes. Décorative pour la jauge (la légende
 * dit les mêmes nombres en mots) ; masquée dès `md`, où la tuile dit le texte de la maquette du bureau.
 */
function JaugeDuPortefeuille({ loues, libres, autres }: { readonly loues: number; readonly libres: number; readonly autres: number }) {
  const t = useTranslations('rapports.chiffres.legende');
  const total = loues + libres + autres;
  const segments = [
    { cle: 'loues', n: loues, fond: 'bg-chart-1' },
    { cle: 'libres', n: libres, fond: 'bg-foreground/15' },
    { cle: 'autres', n: autres, fond: 'bg-foreground/40' },
  ] as const;
  const gras = (morceaux: ReactNode) => <b className="font-semibold">{morceaux}</b>;
  return (
    <span className="mt-3 block md:hidden" data-slot="jauge-du-portefeuille">
      {total > 0 ? (
        <span className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {segments
            .filter((s) => s.n > 0)
            .map((s) => (
              <span key={s.cle} data-segment={s.cle} className={s.fond} style={{ width: `${(s.n / total) * 100}%` }} />
            ))}
        </span>
      ) : null}
      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-ui tabular-nums">
        {segments.map((s) => (
          <span key={s.cle} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2 rounded-sm', s.fond)} aria-hidden="true" />
            <span>{t.rich(s.cle, { n: s.n, b: gras })}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
