'use client';

import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { dateDuMois, derniersMois, moisPrecedent } from '@/lib/finances/mois';
import { cn } from '@/lib/utils';

import { estAnnee } from './adresse';

/** Le mois d'après : `2026-12` → `2027-01`. */
function moisSuivant(mois: string): string {
  const [a, m] = mois.split('-').map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * TCK-2651 — le sélecteur du relevé du bailleur : un mois (`?period=YYYY-MM`) ou « Toute l'année »
 * (`?period=YYYY`, l'attestation annuelle de `OwnerStatementPanel`, gardée). Un composant de
 * l'application, jamais `<input type="month">` (P2 de l'audit) : le mois se nomme par
 * `useFormatteurs()` (« novembre 2026 » en `fr`, « November 2026 » en `en`), quelle que soit la
 * langue du navigateur.
 *
 * - `telephone` : la pastille de l'en-tête de la coque, « nov. 2026 ▾ » (maquette `MobileBailleur`) ;
 * - `bureau` : « ‹ Novembre 2026 ▾ › » (maquette `SelecteurMoisBureau`), un pas en arrière ou en avant ;
 *   jamais au-delà du mois (ou de l'année) en cours. Le « ‹ » est un mois précédent, pas un retour : ce
 *   fichier figure à la liste fermée de `fleche-de-retour-unique.tck-2617.test.ts` (TCK-2617).
 *
 * Choisir garde l'onglet et efface la page : le relevé se relit sur la période choisie.
 */
export function SelecteurDuReleve({
  periode,
  courant,
  variante,
}: {
  readonly periode: string;
  /** Le mois en cours (`YYYY-MM`, Dakar). */
  readonly courant: string;
  readonly variante: 'telephone' | 'bureau';
}) {
  const t = useTranslations('payments.bailleur.selecteur');
  const f = useFormatteurs();
  const router = useRouter();
  const chemin = usePathname();
  const recherche = useSearchParams();

  const annuel = estAnnee(periode);
  const anneeCourante = courant.slice(0, 4);
  const majuscule = (texte: string) => texte.charAt(0).toLocaleUpperCase(f.locale) + texte.slice(1);
  const nomDuMois = (m: string, court = false) =>
    f.date(dateDuMois(m), { month: court ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' });
  const libelle = annuel
    ? t('annee', { annee: periode })
    : variante === 'telephone'
      ? nomDuMois(periode, true)
      : majuscule(nomDuMois(periode));

  const choisir = (cible: string) => {
    const params = new URLSearchParams(recherche?.toString() ?? '');
    if (cible === courant) params.delete('period');
    else params.set('period', cible);
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${chemin}?${qs}` : (chemin ?? '?'), { scroll: false });
  };

  const precedent = annuel ? String(Number(periode) - 1) : moisPrecedent(periode);
  const suivant = annuel ? String(Number(periode) + 1) : moisSuivant(periode);
  const suivantPossible = annuel ? periode < anneeCourante : periode < courant;
  const annees = [anneeCourante, String(Number(anneeCourante) - 1)];

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('choisir', { periode: libelle })}
        data-slot="selecteur-du-releve"
        className={cn(
          'inline-flex flex-none items-center gap-1.5 whitespace-nowrap text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring',
          variante === 'telephone' ? 'mr-1 h-10 gap-1 rounded-full border border-border bg-card pr-2.5 pl-3.5' : 'h-9 px-3',
        )}
      >
        {libelle}
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {derniersMois(courant).map((m) => (
          <DropdownMenuItem key={m} onClick={() => choisir(m)}>
            <Check className={cn('size-4 flex-none', m === periode ? 'text-foreground' : 'invisible')} aria-hidden="true" />
            {majuscule(nomDuMois(m))}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {annees.map((a) => (
          <DropdownMenuItem key={a} onClick={() => choisir(a)}>
            <Check className={cn('size-4 flex-none', a === periode ? 'text-foreground' : 'invisible')} aria-hidden="true" />
            {t('annee', { annee: a })}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (variante === 'telephone') return menu;

  return (
    <span className="inline-flex h-9 flex-none items-center overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => choisir(precedent)}
        aria-label={annuel ? t('anneePrecedente') : t('moisPrecedent')}
        className="inline-flex size-9 items-center justify-center border-r border-border text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      {menu}
      <button
        type="button"
        onClick={() => choisir(suivant)}
        disabled={!suivantPossible}
        aria-label={annuel ? t('anneeSuivante') : t('moisSuivant')}
        className="inline-flex size-9 items-center justify-center border-l border-border text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </span>
  );
}
