"use client"

import type * as React from "react"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

/**
 * TCK-2689 (ADR-0106, annexe B § 3.1 et § 6 n° 6) — LA PUCE DE FILTRE de `/app` et sa rangée
 * défilante : `PucesFiltres` (`chrome-app.tsx:646`) et `Pastille` (`kit.tsx:144`) des maquettes
 * retenues, 27 pages. Une primitive NEUVE : `ChoiceChips` du parcours de publication et les puces
 * du site public ne changent pas (leur migration relève des pages).
 *
 *  · Rendu : `h-9` (36 px au téléphone, 32,4 au bureau), `rounded-full border px-3.5`, `text-sm`
 *    500, `gap-1.5`. Taille `sm` (bureau, 5 pages) : `h-8 px-3`, texte 13 px (`text-ui`).
 *  · Repos `border-border bg-card` ; ACTIVE (`aria-pressed`) `border-foreground bg-foreground
 *    text-background`. Le filet du repos (1,26:1) n'est pas une limite de champ : la puce
 *    s'identifie par son libellé (WCAG 1.4.11 ne l'exige pas).
 *  · Le compte : `tabular-nums`, encre discrète au repos ; sur la puce active, l'encre douce
 *    INVERSE de TCK-2685, OPAQUE (TCK-658 : aucune encre de texte translucide), au lieu du
 *    `text-background/70` de la maquette.
 *  · LA CIBLE (exception (1) d'ADR-0106, décision D6 de l'annexe B) : rendu de 36 px, cible de
 *    44 par un `before:` centré de la hauteur d'un contrôle de la portée (`h-controle` : 44 sous le
 *    pouce et au pointeur grossier, 32,4 au bureau, où il ne déborde pas). Un pseudo-élément
 *    appartient à son élément pour le pointeur — même mécanique que l'onglet souligné (TCK-2687).
 *    Les 4 px qu'il ajoute de part et d'autre tiennent dans le `py-2.5` de la rangée.
 *  · Variante `ajouter` : bord en tirets, un `+`, « Ajouter un filtre » par défaut. C'est une
 *    ACTION, pas une bascule : jamais d'`aria-pressed`.
 */
interface PuceDeFiltreProps extends Omit<React.ComponentProps<"button">, "aria-pressed"> {
  /** La puce est enfoncée (`aria-pressed`). Ignoré pour la variante `ajouter`. */
  readonly active?: boolean
  /** Le compte affiché après le libellé (`tabular-nums`). */
  readonly compte?: React.ReactNode
  readonly taille?: "default" | "sm"
  readonly variante?: "filtre" | "ajouter"
}

function PuceDeFiltre({
  active = false,
  compte,
  taille = "default",
  variante = "filtre",
  className,
  children,
  type = "button",
  ...props
}: PuceDeFiltreProps) {
  const t = useTranslations("ui.filterChips")
  const ajouter = variante === "ajouter"

  return (
    <button
      type={type}
      data-slot="puce-de-filtre"
      data-taille={taille}
      data-variante={variante}
      aria-pressed={ajouter ? undefined : active}
      className={cn(
        "group/puce relative inline-flex h-9 flex-none items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium whitespace-nowrap text-foreground outline-none select-none",
        "transition-[color,background-color,border-color,box-shadow] hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        "aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground aria-pressed:hover:text-background",
        "data-[taille=sm]:h-8 data-[taille=sm]:px-3 data-[taille=sm]:text-ui",
        "data-[variante=ajouter]:border-dashed",
        // La cible de 44 px (cf. docblock).
        "before:absolute before:inset-x-0 before:top-1/2 before:h-controle before:-translate-y-1/2",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {ajouter ? <Plus aria-hidden="true" /> : null}
      {children ?? (ajouter ? t("add") : null)}
      {compte !== undefined && compte !== null ? (
        <span
          data-slot="puce-de-filtre-compte"
          className="tabular-nums text-muted-foreground group-aria-pressed/puce:text-encre-douce-inverse"
        >
          {compte}
        </span>
      ) : null}
    </button>
  )
}

/**
 * La rangée : `flex gap-2 overflow-x-auto px-4 py-2.5`, sans barre de défilement, bord à bord de
 * SON conteneur. Elle défile dans sa propre boîte et ne fait jamais défiler le document. Un groupe
 * nommé pour l'assistance (« Filtres » par défaut).
 */
function RangeeDePuces({
  className,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("ui.filterChips")

  return (
    <div
      role="group"
      data-slot="rangee-de-puces"
      aria-label={ariaLabel ?? t("rowLabel")}
      className={cn(
        "flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    />
  )
}

export { PuceDeFiltre, RangeeDePuces }
export type { PuceDeFiltreProps }
