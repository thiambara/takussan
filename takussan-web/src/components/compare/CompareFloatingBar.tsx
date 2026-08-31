'use client';

import React from 'react';
import Image from 'next/image';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { ArrowRight, Plus, Scale, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCompare } from '@/context/CompareContext';
import { useFloatingDockSlot } from '@/components/floating-dock';
import { COMPARE_MAX_IDS, idsToCsv, type ComparePreview } from '@/lib/compare';
import { cn } from '@/lib/utils';

/**
 * Logical height of the pill (px). Used by the FloatingDock to compute the
 * vertical offset of the slots that stack above us.
 *
 * ⚠ **Le dock ne mesure AUCUN DOM** (cf. `FloatingDockSlotConfig.height`, décision de
 * TCK-275) : ce nombre est ce qu'il croira, et rien ne le confronte au rendu. Il valait
 * 64 quand la barre était une seule rangée ; elle en a trois depuis — en-tête, vignettes,
 * appel à l'action — et un dock qui croit 64 fait passer le bouton de discussion DERRIÈRE
 * elle.
 *
 * **176 est un relevé, pas une estimation.** Mesuré au navigateur le 2026-08-30,
 * `getBoundingClientRect().height` sur `aside[aria-label]` : **170 px**, identique à 1, 2
 * et 4 biens sélectionnés (la rangée compte toujours quatre emplacements) et identique en
 * 312 px comme en pleine largeur de téléphone. Les 6 px de marge couvrent une police
 * système plus haute que celle de la machine de mesure — pas une incertitude sur la forme.
 */
const COMPARE_PILL_HEIGHT_PX = 176;

/** Côté d'une vignette, en px — sert au `sizes` de `next/image` autant qu'à la classe. */
const VIGNETTE_PX = 56;

/**
 * TCK-082 — sticky bottom-right panel showing the current comparator selection.
 * Hidden when empty or not hydrated (no SSR flash).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE BARRE MONTRE, ET POURQUOI CE N'EST PLUS `#183`
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle listait les identifiants de base des biens sélectionnés. Un identifiant de base ne
 * dit rien à personne : deux villas de Ngor y sont « #183 » et « #207 », et l'utilisateur
 * ne peut ni reconnaître ce qu'il a mis dedans, ni retirer le bon. Elle montre désormais la
 * PHOTO et le TITRE, gardés au moment du clic (cf. `lib/compare.ts`) — donc sans requête,
 * sans état de chargement, et sans clignotement au changement de page.
 *
 * Les emplacements LIBRES sont dessinés eux aussi, jusqu'à quatre. C'est ce qui rend le
 * plafond lisible AVANT de le heurter : sans eux, la seule façon d'apprendre qu'il existe
 * est de se voir refuser un cinquième bien par un toast.
 */
export function CompareFloatingBar({ className }: { className?: string }) {
  const { ids, previews, isHydrated, remove, clear } = useCompare();
  const t = useTranslations('compare.floatingBar');

  // Register with the FloatingDock orchestrator (TCK-275). The slot is only
  // “active” once we actually render content — otherwise the dock would
  // reserve vertical space for an invisible bar.
  const isVisible = isHydrated && ids.length > 0;
  const { bottom } = useFloatingDockSlot({
    id: 'compare-floating-bar',
    corner: 'bottom-right',
    priority: 1, // sits above chat (priority 0)
    height: COMPARE_PILL_HEIGHT_PX,
    enabled: isVisible,
  });

  if (!isVisible) return null;

  const canCompare = ids.length >= 2;
  const emplacementsLibres = Math.max(0, COMPARE_MAX_IDS - ids.length);

  return (
    <aside
      aria-label={t('ariaLabel')}
      style={{ bottom }}
      className={cn(
        // Ancrée aux DEUX bords sous `sm` : à `right-4` seul, quatre vignettes plus le
        // libellé débordaient l'écran d'un téléphone au lieu de s'y adapter.
        'fixed inset-x-4 z-40 sm:inset-x-auto sm:right-6 sm:w-[19.5rem]',
        'animate-compare-dock-in',
        className,
      )}
    >
      {/*
        RAYONS CONCENTRIQUES — extérieur = intérieur + rembourrage, sans quoi les coins
        des enfants « flottent » dans ceux du panneau. L'échelle du dépôt est calculée
        depuis `--radius: 0.625rem` : `rounded-2xl` vaut 18 px, `rounded-lg` 10 px, et
        `p-2` en vaut 8 — 18 = 10 + 8, la relation est exacte et non approchée.

        L'ombre passe par `--shadow-color`, le seul jeton qui assombrit dans les DEUX
        thèmes (cf. docs/design-guidelines.md § L'OMBRE). Deux couches : un contact court
        et net, une diffusion large — une seule ombre donne un halo plat.
      */}
      <div
        className={cn(
          'rounded-2xl border border-border bg-card/95 p-2 backdrop-blur-md',
          'shadow-[0_1px_2px_color-mix(in_srgb,var(--shadow-color)_6%,transparent),0_12px_32px_color-mix(in_srgb,var(--shadow-color)_14%,transparent)]',
        )}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            aria-hidden
          >
            <Scale className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight text-foreground">{t('title')}</p>
            <p className="text-[11px] leading-tight text-muted-foreground tabular-nums">
              {t('count', { count: ids.length, max: COMPARE_MAX_IDS })}
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            aria-label={t('clearAria')}
            title={t('clearAria')}
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-full',
              'text-muted-foreground hover:bg-muted hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              'transition-[background-color,color,scale] duration-150 active:scale-[0.96]',
            )}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <ul className="mt-2 flex items-center gap-2" role="list">
          {ids.map((id) => (
            <li key={id}>
              <Vignette
                id={id}
                preview={previews[id]}
                onRemove={() => remove(id)}
                // Le nom accessible NOMME le bien quand on le connaît. Le repli sur l'id
                // n'est pas décoratif : sans aperçu — sélection venue d'une URL partagée —
                // quatre boutons « Retirer du comparateur » identiques seraient
                // indistinguables à la voix.
                label={
                  previews[id]
                    ? t('removeNamedAria', { title: previews[id]!.title })
                    : t('removeAria', { id })
                }
              />
            </li>
          ))}
          {Array.from({ length: emplacementsLibres }).map((_, i) => (
            <li key={`libre-${i}`} aria-hidden>
              <span className="grid size-14 place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
                <Plus className="size-4" />
              </span>
            </li>
          ))}
        </ul>

        <LienLocalise
          href={canCompare ? `/compare?ids=${idsToCsv(ids)}` : '/compare'}
          aria-disabled={!canCompare}
          tabIndex={canCompare ? 0 : -1}
          className={cn(
            'mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5',
            'text-[13px] font-semibold',
            'transition-[background-color,color,scale] duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            canCompare
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]'
              : 'pointer-events-none bg-muted text-muted-foreground',
          )}
        >
          {/*
            Un bouton grisé qui ne dit pas ce qui manque est une impasse : sous le plafond
            de deux biens, il ANNONCE la condition au lieu de la subir.
          */}
          {canCompare ? (
            <>
              <span className="tabular-nums">{t('cta', { count: ids.length })}</span>
              <ArrowRight className="size-4" aria-hidden />
            </>
          ) : (
            t('needOneMore')
          )}
        </LienLocalise>
      </div>
    </aside>
  );
}

/**
 * Une vignette EST le bouton de retrait — 56 × 56, très au-dessus du plancher de 40 px,
 * là où la croix seule en faisait 28. La croix reste dessinée en pastille d'angle : elle
 * dit ce que le clic fait, sans être elle-même la cible.
 */
function Vignette({
  id,
  preview,
  onRemove,
  label,
}: {
  readonly id: number;
  readonly preview: ComparePreview | undefined;
  readonly onRemove: () => void;
  readonly label: string;
}) {
  const titre = preview?.title ?? `#${id}`;

  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={label}
      title={titre}
      className={cn(
        'group relative block size-14 cursor-pointer overflow-hidden rounded-lg',
        // ── Le liseré d'image ──────────────────────────────────────────────────────────
        // Une photo posée sur une surface claire n'a pas de bord ; sans liseré, les
        // vignettes claires fondent dans la carte et la rangée perd son rythme.
        //
        // Il est écrit en `box-shadow` INTÉRIEUR et non en `outline`, pour une raison de
        // jeton et non de rendu : le liseré doit être un NOIR PUR (un neutre teinté prend
        // la couleur de la surface et se lit comme de la saleté sur le bord de la photo),
        // le seul noir pur du produit est `--scrim`, et `check-public-chrome-tokens.mjs`
        // n'admet ce jeton que derrière un préfixe de FOND — un voile n'est pas un
        // contour. `color-mix` pose l'alpha, comme pour toute ombre du dépôt.
        //
        // ⚠ Ne pas écrire la classe refusée EN TOUTES LETTRES ici, fût-ce pour l'expliquer :
        // cette garde ne dépouille pas les commentaires, délibérément, et la première
        // version de ce bloc l'a fait rougir sur sa propre justification.
        'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--scrim)_12%,transparent)]',
        'dark:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_14%,transparent)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'transition-[scale] duration-150 active:scale-[0.96]',
      )}
    >
      {preview?.photo ? (
        <Image
          src={preview.photo}
          alt=""
          fill
          sizes={`${VIGNETTE_PX}px`}
          className="object-cover transition-[scale] duration-300 group-hover:scale-105"
        />
      ) : (
        <span className="grid size-full place-items-center bg-muted text-sm font-semibold text-muted-foreground">
          {initiale(titre)}
        </span>
      )}

      {/*
        La pastille de retrait. Trois croix affichées en permanence sur trois vignettes
        lisent comme un rang de boutons « supprimer » et détournent l'œil de ce que la
        barre montre vraiment — les biens.
        Elle n'apparaît donc qu'au survol… `@media (hover: hover)` SEULEMENT. Sur un écran
        tactile il n'y a pas de survol : la même règle y rendrait le retrait invisible, et
        `group-hover` s'y déclenche au premier appui, c'est-à-dire APRÈS coup. Le défaut
        par défaut est donc « visible », et c'est le pointeur fin qui gagne le droit de la
        cacher — jamais l'inverse.
      */}
      <span
        aria-hidden
        className={cn(
          'absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full',
          'bg-card text-foreground shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_28%,transparent)]',
          'transition-[opacity,background-color,color] duration-150',
          // ⚠ La media query ne se répète PAS sur la ligne de révélation : Tailwind v4
          // enveloppe `group-hover:` dans `@media (hover: hover)` de lui-même — vérifié
          // dans la FEUILLE COMPILÉE, pas supposé. L'écrire deux fois n'ajoute rien et
          // laisse croire que c'est nécessaire.
          '[@media(hover:hover)]:opacity-0',
          'group-hover:opacity-100 group-focus-visible:opacity-100',
          'group-hover:bg-destructive group-hover:text-primary-foreground',
        )}
      >
        <X className="size-3 stroke-[2.5]" />
      </span>
    </button>
  );
}

/** La première lettre d'un titre — le repli quand le bien n'a pas de photo. */
function initiale(titre: string): string {
  const premier = titre.trim().charAt(0);
  return premier ? premier.toLocaleUpperCase('fr') : '·';
}
