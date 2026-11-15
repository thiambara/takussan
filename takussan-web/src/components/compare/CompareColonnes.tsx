'use client';

import React, { useId, useMemo, useState } from 'react';
import { Check, ExternalLink, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { buttonVariants } from '@/components/ui/button';
import { cn, formatPrice } from '@/lib/utils';
import { COMPARE_MAX_IDS } from '@/lib/compare';
import type { PropertyDetail } from '@/types/property';
import {
  buildCompareRows,
  cleDuLibelle,
  COMPARE_ROW_DEFS,
  SENS_DU_MEILLEUR,
  type CompareCell,
  type CompareRowDef,
  type LigneComparee,
} from '@/components/compare/compare-rows';
import { ESPACE_DU_CATALOGUE, libelleEquipement } from '@/lib/libelle-equipement';

/**
 * TCK-2509 — le comparateur en COLONNES ALIGNÉES, au téléphone comme au bureau.
 *
 * Il remplace le tableau de bureau (`CompareTable`) et les blocs du téléphone (`CompareCarousel`,
 * TCK-577), où chaque critère était un bloc de trois lignes répétant le nom tronqué de chaque bien
 * (audit UX 2026-11, § 6). Ici :
 *
 * - un EN-TÊTE COLLANT, une colonne par bien (photo, prix, titre court, « Retirer ») ; en bureau,
 *   la place libre est une colonne de plus, « Ajouter un bien » ;
 * - chaque critère est une LIGNE dont les valeurs s'alignent sous leur bien — au téléphone, le
 *   libellé au-dessus des valeurs ; au bureau, dans une colonne à gauche ;
 * - par défaut, SEULEMENT CE QUI DIFFÈRE, suivi de « Pareil pour les N : … » ; la bascule montre
 *   tout, les lignes identiques atténuées ;
 * - le MEILLEUR de chaque ligne marqué, seulement là où il a un sens (`SENS_DU_MEILLEUR`).
 *
 * Aucune colonne n'exige de largeur minimale (`minmax(0, 1fr)`) : quatre biens tiennent à 320 px
 * sans défilement de côté, les valeurs longues passent à la ligne.
 */

export type CompareColumn = {
  readonly id: number;
  readonly property: PropertyDetail;
};

export interface CompareColonnesProps {
  readonly columns: readonly CompareColumn[];
  readonly onRemove: (id: number) => void;
  /** « Partager » — rendu par la page, dans la barre d'outils (bureau) et le pied (téléphone). */
  readonly partage?: React.ReactNode;
  readonly className?: string;
}

/**
 * Ce qui colle au-dessus de l'en-tête, palier par palier. En bureau, la `Navbar` fixe — la hauteur de
 * sa cale (`NavbarSpacer`) hors pages de découverte. Au téléphone, le comparateur n'a pas la barre du
 * site (TCK-2568) : l'en-tête colle sous la rangée de retour de la page (`EnTeteDePage`, `h-14`).
 * `CompareColonnes.test.tsx` garde les deux égalités : sinon l'en-tête collant passerait sous la
 * barre, ou flotterait sous elle.
 */
const EN_TETE_COLLANT = 'sticky top-14 lg:top-[calc(var(--spacing)*6+53px)]';

/** Au-delà, la phrase « Pareil pour les N » se replie derrière « + N autres ». */
const PAREIL_VISIBLES = 4;

function texteDeCellule(def: CompareRowDef, value: CompareCell, tOui: string, tNon: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.length === 0 ? null : value.join(', ');
  if (typeof value === 'boolean') return value ? tOui : tNon;
  if (def.id === 'area' && typeof value === 'number') return `${value} m²`;
  return String(value);
}

function Cellule({
  def,
  value,
  meilleur,
  sensDuMeilleur,
  attenuee,
  tOui,
  tNon,
}: {
  readonly def: CompareRowDef;
  readonly value: CompareCell;
  readonly meilleur: boolean;
  readonly sensDuMeilleur: string | null;
  readonly attenuee: boolean;
  readonly tOui: string;
  readonly tNon: string;
}) {
  if (Array.isArray(value) && value.length > 0) {
    return (
      <ul className={cn('flex flex-wrap gap-1', attenuee && 'text-muted-foreground')}>
        {value.map((item) => (
          <li key={item} className="max-w-full break-words rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            {item}
          </li>
        ))}
      </ul>
    );
  }
  const brut = texteDeCellule(def, value, tOui, tNon);
  // Une colonne de 80 px (quatre biens à 360) ne tient pas « 450 000 F CFA » : l'espace insécable
  // entre le nombre et la devise devient sécable, pour couper là plutôt qu'au milieu du nombre
  // (« 45000 / 0 F CFA », relevé au navigateur). Les espaces des milliers restent insécables.
  const texte = brut === null ? null : brut.replace(/(\d)[\u00a0\u202f](?=\D)/g, '$1 ');
  if (texte === null) return <span className="text-muted-foreground">—</span>;
  if (meilleur) {
    return (
      // La coche est une pastille posée sur le COIN, hors du flux du texte : dans une colonne de
      // 80 px, une coche en ligne prenait 18 px au montant, qui se coupait au milieu (« 45000 /
      // 0 F CFA », relevé au navigateur à 390 px, quatre biens).
      <span
        data-meilleur="true"
        className="relative inline-block max-w-full rounded-md bg-success/10 py-0.5 pl-2.5 pr-1.5 font-semibold text-success"
      >
        <span
          aria-hidden="true"
          className="absolute -left-2 -top-2 grid size-4 place-items-center rounded-full bg-success text-success-foreground"
        >
          <Check className="size-2.5" strokeWidth={3.5} />
        </span>
        <span className="break-words hyphens-auto">{texte}</span>
        {sensDuMeilleur && <span className="sr-only">({sensDuMeilleur})</span>}
      </span>
    );
  }
  return <span className={cn('break-words hyphens-auto', attenuee && 'text-muted-foreground')}>{texte}</span>;
}

/**
 * La réserve que la PAGE pose sous son dernier élément (pied de page compris) quand elle monte
 * `CompareColonnes` : la hauteur de la barre « Partager » fixée du téléphone — filet 1 + 12 + bouton
 * 48 + au moins 16 = 77 px, plus la zone sûre. Au bureau, pas de barre, pas de réserve.
 */
export const RESERVE_BARRE_PARTAGER = 'pb-[calc(var(--spacing)*20+env(safe-area-inset-bottom))] md:pb-0';

export function CompareColonnes({ columns, onRemove, partage, className }: CompareColonnesProps) {
  const t = useTranslations('compare');
  const tRows = useTranslations('compare.rows');
  const tCatalogue = useTranslations(ESPACE_DU_CATALOGUE);
  const idBascule = useId();
  const [seulementCeQuiDiffere, setSeulementCeQuiDiffere] = useState(true);
  const [pareilDeplie, setPareilDeplie] = useState(false);

  const properties = useMemo(() => columns.map((col) => col.property), [columns]);
  const lignes = useMemo(
    () => buildCompareRows(properties, (tag) => libelleEquipement(tag, tCatalogue)),
    [properties, tCatalogue],
  );

  const n = columns.length;
  const placeLibre = n < COMPARE_MAX_IDS;
  const tOui = t('values.yes');
  const tNon = t('values.no');

  const definition = (ligne: LigneComparee) => COMPARE_ROW_DEFS.find((d) => d.id === ligne.id)!;
  const libelle = (ligne: LigneComparee) => tRows(cleDuLibelle(definition(ligne), properties));
  const sens = (ligne: LigneComparee) => {
    const s = SENS_DU_MEILLEUR[ligne.id];
    if (!s) return null;
    return s === 'max' ? t('best.largest') : t('best.cheapest');
  };

  const differentes = lignes.filter((l) => l.divergent);
  const pareilles = lignes.filter((l) => !l.divergent);
  const affichees = seulementCeQuiDiffere ? differentes : lignes;
  const marqueQuelquePart = affichees.some((l) => l.meilleurs.length > 0);

  const pareil = pareilles
    .map((ligne) => {
      const valeur = texteDeCellule(definition(ligne), ligne.values[0], tOui, tNon);
      return valeur === null ? null : `${libelle(ligne)} : ${valeur}`;
    })
    .filter((x): x is string => x !== null);
  const pareilVisible = pareilDeplie ? pareil : pareil.slice(0, PAREIL_VISIBLES);
  const pareilCache = pareil.length - pareilVisible.length;

  // Une colonne par bien au téléphone ; au bureau, une colonne de libellés à gauche, et la place
  // libre à droite. Les colonnes se partagent la largeur : aucune n'en exige.
  const style = {
    '--colonnes-mobile': `repeat(${Math.max(n, 1)}, minmax(0, 1fr))`,
    '--colonnes-bureau': `minmax(calc(var(--spacing) * 32), calc(var(--spacing) * 52)) repeat(${n + (placeLibre ? 1 : 0)}, minmax(0, 1fr))`,
  } as React.CSSProperties;
  const grille = 'grid grid-cols-(--colonnes-mobile) gap-x-2 md:grid-cols-(--colonnes-bureau) md:gap-x-6';

  return (
    <div className={className}>
      {/* Barre d'outils : la bascule ; au bureau, « Partager » à côté. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          role="switch"
          id={idBascule}
          aria-checked={seulementCeQuiDiffere}
          onClick={() => setSeulementCeQuiDiffere((v) => !v)}
          className="-ml-1 inline-flex min-h-11 items-center gap-2.5 rounded-lg px-1 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            aria-hidden="true"
            className={cn(
              'relative h-6 w-10 flex-none rounded-full transition-colors duration-150',
              seulementCeQuiDiffere ? 'bg-primary' : 'bg-muted-foreground/40',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-5 rounded-full bg-card shadow-sm transition-[left] duration-150',
                seulementCeQuiDiffere ? 'left-[18px]' : 'left-0.5',
              )}
            />
          </span>
          {t('onlyDifferences')}
        </button>
        {partage && <div className="hidden md:block">{partage}</div>}
      </div>

      <div role="table" aria-label={t('table.ariaLabel')} style={style}>
        {/* En-tête collant : les biens restent visibles pendant la lecture des critères. Le fond
            opaque pleine largeur (`-mx-4 px-4`, la gouttière de `main`) masque ce qui défile. */}
        <div role="rowgroup" className={cn(EN_TETE_COLLANT, 'z-10 -mx-4 bg-surface px-4 pt-2 md:-mx-8 md:px-8')}>
          <div role="row" className={cn(grille, 'border-b border-border pb-3')} data-testid="compare-en-tete">
            <div role="columnheader" className="hidden md:block" aria-label={t('table.header')} />
            {columns.map((col) => (
              <EnTeteDeBien key={col.id} column={col} onRemove={onRemove} />
            ))}
            {placeLibre && (
              <div role="columnheader" className="hidden md:block">
                <LienLocalise
                  href="/properties"
                  className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary lg:h-28"
                >
                  <Plus className="size-5" aria-hidden="true" />
                  {t('addProperty')}
                </LienLocalise>
              </div>
            )}
          </div>
        </div>

        <div role="rowgroup">
          {affichees.map((ligne) => {
            const def = definition(ligne);
            const attenuee = !seulementCeQuiDiffere && !ligne.divergent;
            return (
              <div
                key={ligne.id}
                role="row"
                data-ligne={ligne.id}
                data-divergent={ligne.divergent ? 'true' : 'false'}
                className={cn(grille, 'gap-y-1 border-b border-border py-3')}
              >
                <div
                  role="rowheader"
                  className={cn(
                    'col-span-full text-[0.8125rem] font-medium md:col-span-1 md:text-sm',
                    // Contraste AA : l'atténuation passe par la graisse, pas par l'alpha (3,58:1 à 80 %).
                    attenuee ? 'text-muted-foreground font-normal' : 'text-muted-foreground',
                  )}
                >
                  {libelle(ligne)}
                </div>
                {columns.map((col, i) => (
                  <div key={col.id} role="cell" className="min-w-0 text-sm tabular-nums text-foreground md:text-[0.9375rem]">
                    <Cellule
                      def={def}
                      value={ligne.values[i]}
                      meilleur={ligne.meilleurs.includes(i)}
                      sensDuMeilleur={sens(ligne)}
                      attenuee={attenuee}
                      tOui={tOui}
                      tNon={tNon}
                    />
                  </div>
                ))}
                {placeLibre && <div aria-hidden="true" className="hidden md:block" />}
              </div>
            );
          })}
        </div>
      </div>

      {seulementCeQuiDiffere && differentes.length === 0 && (
        <p className="py-4 text-sm text-muted-foreground">{t('noDifferences')}</p>
      )}

      {seulementCeQuiDiffere && pareil.length > 0 && (
        <div className="py-4" data-testid="compare-pareil">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">{t('sameForAll', { count: n })}</p>
          <p className="mt-1 text-pretty text-[0.9375rem] text-foreground">
            {pareilVisible.join(' · ')}
            {pareilCache > 0 || pareilDeplie ? ' ' : null}
            {(pareilCache > 0 || (pareilDeplie && pareil.length > PAREIL_VISIBLES)) && (
              <button
                type="button"
                aria-expanded={pareilDeplie}
                onClick={() => setPareilDeplie((v) => !v)}
                className="-my-2 inline-flex min-h-11 items-center px-1 font-medium text-primary underline underline-offset-4"
              >
                {pareilDeplie ? t('sameShowLess') : t('sameShowMore', { count: pareilCache })}
              </button>
            )}
          </p>
        </div>
      )}

      {marqueQuelquePart && (
        <p className="flex items-center gap-1.5 py-2 text-[0.8125rem] text-muted-foreground">
          <span className="inline-flex size-4 flex-none items-center justify-center rounded-full bg-success text-success-foreground" aria-hidden="true">
            <Check className="size-2.5" strokeWidth={3.5} />
          </span>
          {t('best.legend')}
        </p>
      )}

      {/* Pied — téléphone : la barre « Ajouter un bien · Partager » de la maquette, FIXÉE en bas.
          Elle remplace la barre d'onglets, absente de `/compare` (`PREMIERS_SEGMENTS_SANS_BARRE`) :
          une seule couche d'action en bas (ADR-0091 §4). Deux colonnes égales (`auto-cols-fr` : le
          remplissage du lien ne déséquilibre pas les deux gestes) ; sans place libre, « Partager »
          prend toute la largeur. La page qui la monte réserve sa hauteur sous le pied de page
          (`RESERVE_BARRE_PARTAGER`) : rien, pas même le bas du pied de page, ne passe dessous. */}
      <div
        data-barre-partager=""
        className="fixed inset-x-0 bottom-0 z-40 grid auto-cols-fr grid-flow-col gap-2 border-t border-border bg-card px-4 pb-[max(var(--spacing)*4,env(safe-area-inset-bottom))] pt-3 md:hidden"
      >
        {placeLibre && (
          <LienLocalise
            href="/properties"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-12 min-w-0 gap-2')}
          >
            <Plus className="size-5" aria-hidden="true" />
            {t('addProperty')}
          </LienLocalise>
        )}
        {partage && <div className="flex min-w-0 [&>*]:w-full">{partage}</div>}
      </div>
    </div>
  );
}

function EnTeteDeBien({ column, onRemove }: { readonly column: CompareColumn; readonly onRemove: (id: number) => void }) {
  const t = useTranslations('compare');
  const tPeriodes = useTranslations('property.rentPeriodsShort');
  const { property } = column;
  const lien = `/properties/${property.slug}`;
  const retirer = `${t('actions.remove')} ${property.title}`;
  const nomCourt = property.location?.quarter || property.location?.city || property.title;
  const reperes = [
    typeof property.bedrooms === 'number' ? t('header.bedrooms', { count: property.bedrooms }) : null,
    typeof property.area === 'number' && property.area > 0 ? t('header.area', { area: property.area }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div role="columnheader" className="min-w-0 text-left font-normal">
      <div className="relative">
        <LienLocalise
          href={lien}
          tabIndex={-1}
          aria-hidden="true"
          className="relative block h-14 overflow-hidden rounded-lg bg-muted md:h-24 lg:h-28"
        >
          <PropertyPhoto src={property.main_photo_url} alt="" compact sizes="(max-width: 768px) 25vw, 300px" />
        </LienLocalise>
        {/* 28 px dessinés, 44 px d'appui : le pseudo-élément déborde de 8 px de chaque côté. Posé
            HORS du cadre `overflow-hidden` de la photo, qui rognerait aussi la zone d'appui. */}
        <button
          type="button"
          onClick={() => onRemove(property.id)}
          aria-label={retirer}
          title={retirer}
          className={cn(
            'absolute right-1 top-1 grid size-7 place-items-center rounded-full',
            'bg-card text-foreground shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_28%,transparent)]',
            "after:absolute after:-inset-2 after:content-['']",
            'hover:bg-destructive hover:text-primary-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'transition-[background-color,color,scale] duration-150 active:scale-[0.96]',
          )}
        >
          <X className="size-3.5 stroke-[2.5]" aria-hidden="true" />
        </button>
      </div>
      {/* Au téléphone (maquette A) : un NOM COURT — le quartier, sinon la ville — et « 3 ch. ·
          140 m² ». À quatre colonnes de 80 px, le prix et le titre n'y tenaient que tronqués
          (« 2 240 000 F… », « Villa avec jard… ») ; le prix se lit en entier dans la ligne Prix.
          Au bureau, le prix et le titre. Le lien porte le titre entier comme nom accessible. */}
      <p className="mt-1.5 hidden truncate text-base font-semibold tabular-nums text-foreground md:block">
        {formatPrice(property.price, property.currency || 'XOF')}
        {property.contract_type === 'rent' && property.rent_period && (
          <span className="font-normal text-muted-foreground">/{tPeriodes(property.rent_period)}</span>
        )}
      </p>
      <LienLocalise
        href={lien}
        title={property.title}
        aria-label={property.title}
        data-nom-court=""
        className="mt-1.5 block truncate text-[0.8125rem] font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:mt-0 md:text-sm md:font-normal md:text-muted-foreground"
      >
        <span className="md:hidden">{nomCourt}</span>
        <span className="hidden md:inline">{property.title}</span>
      </LienLocalise>
      <p data-reperes="" className="truncate text-xs text-muted-foreground tabular-nums md:hidden">
        {reperes || '\u00a0'}
      </p>
      <LienLocalise
        href={lien}
        className="-ml-2 hidden min-h-10 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary underline-offset-4 hover:underline md:inline-flex"
      >
        <ExternalLink className="size-3.5" aria-hidden="true" />
        {t('actions.view')}
      </LienLocalise>
    </div>
  );
}
