"use client"

import type * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

/**
 * P08.08 (TCK-756) — trop large, la liste défile dans sa propre boîte (`max-w-full` +
 * `overflow-x-auto`) au lieu de pousser la page : cinq onglets `fr` mesurent 454 px pour 328
 * disponibles à 360. `justify-center-safe` : centré, un contenu qui déborde perdrait son début.
 * `line` ne défile pas : son liseré actif est posé 5 px sous la liste, et serait rogné.
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit max-w-full items-center justify-center-safe rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 plancher-onglets-liste group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        // TCK-2689 — sous la portée `/app`, le CONTRÔLE SEGMENTÉ de la maquette (`Segmente`,
        // `app-biens-pieces.tsx:94`, valeur majoritaire D5) : piste `p-1` (44 px au téléphone,
        // 39,6 au bureau), `p-0.5` en `size="sm"`. Chaque règle porte `data-[variant=default]:` pour
        // l'emporter par la spécificité (`portee-app:` est un `:where`, il n'en ajoute aucune) sur
        // `p-[3px]` et `group-data-horizontal/tabs:h-8` de la base. Le plancher tactile (couche
        // `components`) est levé : la piste de 44 le dépasse, la petite est un gabarit de bureau.
        // Pleine largeur : `className="w-full"` (chaque item est déjà `flex-1`).
        default: [
          "bg-muted overflow-x-auto",
          "portee-app:data-[variant=default]:p-1 portee-app:data-[variant=default]:min-h-0 portee-app:data-[variant=default]:group-data-horizontal/tabs:h-auto",
          "portee-app:data-[variant=default]:data-[size=sm]:p-0.5",
        ].join(" "),
        // TCK-2687 — sous la portée `/app`, la liste soulignée de la maquette (`OngletsSoulignes`,
        // `chrome-app.tsx:377`) : pleine largeur, calée à gauche, `gap-6`, sans padding, sur un filet
        // `border-b`. La hauteur suit les onglets (32 px visibles) : la cible de 44 est portée par
        // chaque onglet (`before:`), pas par la liste — le plancher tactile est donc levé.
        line: "gap-1 bg-transparent portee-app:w-full portee-app:justify-start portee-app:gap-x-6 portee-app:border-b portee-app:border-border portee-app:p-0 portee-app:min-h-0 portee-app:group-data-horizontal/tabs:h-auto",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  size = "default",
  ...props
}: TabsPrimitive.List.Props &
  VariantProps<typeof tabsListVariants> & {
    /** TCK-2689 — le petit contrôle segmenté (`p-0.5`, items `h-8 px-3`, 13 px), sous la portée `/app`. */
    readonly size?: "default" | "sm"
  }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      data-size={size}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

/**
 * TCK-359 — l'onglet INACTIF doit tenir 4,5:1 sur les TROIS fonds où cette primitive est montée,
 * pas seulement sur `--background`.
 *
 * `text-foreground/60` a été mesuré contre `--background` (4,53:1, « tient de 0,03 ») et déclaré
 * conforme. Mais `variant="line"` rend la `TabsList` transparente : rien ne repeint le fond entre
 * le déclencheur et son conteneur. Sur `/super-admin/reports`, ce conteneur est le `<main>` du
 * shell, qui porte `bg-muted` depuis TCK-358 — et la mesure y tombe SOUS le plancher.
 *
 * Contrastes recalculés le 2026-08-27 (WCAG 2.x, composition alpha en sRGB avant le calcul ;
 * Tailwind v4 émet `color-mix(in oklab, #1f1812 70%, transparent)`, soit la même composition) :
 *
 *   clair, `--foreground` @60 %  →  --background 4,5278 · --card 4,6038 · --muted 4,3520  ← ÉCHEC
 *   clair, `--foreground` @65 %  →  --background 5,3377 · --card 5,4438 · --muted 5,0940
 *   clair, `--foreground` @70 %  →  --background 6,3280 · --card 6,4766 · --muted 5,9902  ← retenu
 *   sombre, `--muted-foreground` (opaque, via `dark:`) → --background 7,7108 · --card 7,0054
 *                                                        · --muted 5,7900
 *
 * 70 % est la valeur retenue : une seule valeur change, elle tient sur les trois fonds dans les
 * deux thèmes, et la moindre des six mesures garde 1,29 de marge — là où 65 % n'en garderait que
 * 0,59. L'état ACTIF ne repose de toute façon pas sur ce seul écart d'encre : `line` ajoute le
 * liseré `after:`, `default` une pastille `bg-background` et une ombre.
 *
 * ⚠ Primitive PARTAGÉE (12 consommateurs) : ne pas redescendre cette opacité sans refaire les six
 * mesures ci-dessus. Le fond à mesurer est celui du PARENT, jamais celui de la `TabsList`.
 */
/**
 * TCK-2687 (ADR-0106) — L'ONGLET SOULIGNÉ SOUS LA PORTÉE `/app`, et seulement là (`/super-admin` et
 * le site public gardent le leur, AC6). Valeurs de la maquette (annexe B § 3.1) :
 *
 *  · 32 px visibles (`text-sm` 500 et `pb-3`), sans padding x ni fond, calé sur son texte (`flex-none`) ;
 *  · inactif `text-muted-foreground` — 4,85:1 sur `--muted`, 5,44:1 sur `--background` en clair,
 *    5,79:1 au pire en sombre ; actif `text-foreground` (la règle `not-data-active:` ne touche
 *    pas l'onglet actif) ; au survol, l'inactif reprend `text-foreground` ;
 *  · le trait actif : 2 px `--primary` à `-bottom-px`, son bas sur le bas du filet de la liste. La
 *    règle porte AUSSI `group-data-horizontal/tabs:` pour l'emporter, par la spécificité et non par
 *    l'ordre de la feuille, sur `bottom-[-5px]` de la règle de base ;
 *  · la CIBLE de 44 px (WCAG 2.5.8, exception (1) d'ADR-0106) : un `before:` centré, de la hauteur
 *    d'un contrôle de la portée (`h-controle` : 44 sous le pouce, 32,4 au bureau). Un pseudo-élément
 *    appartient à son élément pour le pointeur : le clic à 6 px au-dessus du texte tombe sur l'onglet.
 *    `after:` est déjà le trait.
 */
const ONGLET_SOULIGNE_APP = [
  "portee-app:group-data-[variant=line]/tabs-list:h-auto",
  "portee-app:group-data-[variant=line]/tabs-list:min-h-0",
  "portee-app:group-data-[variant=line]/tabs-list:flex-none",
  "portee-app:group-data-[variant=line]/tabs-list:rounded-none",
  "portee-app:group-data-[variant=line]/tabs-list:border-0",
  "portee-app:group-data-[variant=line]/tabs-list:px-0",
  "portee-app:group-data-[variant=line]/tabs-list:pt-0",
  "portee-app:group-data-[variant=line]/tabs-list:pb-3",
  "portee-app:group-data-[variant=line]/tabs-list:not-data-active:text-muted-foreground",
  // Le survol de l'onglet inactif : la règle ci-dessus (3 sélecteurs) battrait `hover:text-foreground`
  // de la base (2) — l'onglet n'aurait plus d'état de survol visible. Celle-ci en porte 4.
  "portee-app:group-data-[variant=line]/tabs-list:not-data-active:hover:text-foreground",
  "portee-app:group-data-[variant=line]/tabs-list:after:bg-primary",
  "portee-app:group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:after:-bottom-px",
  "portee-app:group-data-[variant=line]/tabs-list:before:absolute",
  "portee-app:group-data-[variant=line]/tabs-list:before:inset-x-0",
  "portee-app:group-data-[variant=line]/tabs-list:before:top-1/2",
  "portee-app:group-data-[variant=line]/tabs-list:before:h-controle",
  "portee-app:group-data-[variant=line]/tabs-list:before:-translate-y-1/2",
].join(" ")

/**
 * TCK-2689 (ADR-0106, annexe B § 3.2 et § 6 n° 11) — L'ITEM DU CONTRÔLE SEGMENTÉ sous la portée
 * `/app` (`Tabs` par défaut : `/app/agency/team`, `bookings`, `payments`, `visits`, et les autres
 * listes d'onglets par défaut de `/app`) ; `/super-admin` et le site public gardent le leur.
 *
 *  · `h-9 px-4 rounded-md text-sm` 500 ; `size="sm"` : `h-8 px-3`, 13 px (`text-ui`) ;
 *  · actif `bg-card` (#fff) + l'ombre nommée « item actif » (`shadow-actif`, TCK-2685) — au thème
 *    clair ; le sombre garde `bg-input/30` (cf. la règle) ;
 *  · inactif `text-muted-foreground` — 4,85:1 sur `--muted` en clair (au lieu du
 *    `text-foreground/70` de TCK-359, que la maquette ne retient pas) ; au survol, `text-foreground`.
 *
 * Chaque règle porte `group-data-[variant=default]/tabs-list:` : un sélecteur d'attribut de plus que
 * la règle de base qu'elle remplace (`px-1.5`, `h-[calc(100%-1px)]`, `text-foreground/70`,
 * `data-active:bg-background`). L'ombre, à égalité avec `…data-active:shadow-sm` de la base, porte
 * en plus `group-data-horizontal/tabs:`. Le comportement (flèches, `aria-selected`) est celui de
 * base-ui, inchangé.
 */
const SEGMENTE_APP = [
  "portee-app:group-data-[variant=default]/tabs-list:h-9",
  "portee-app:group-data-[variant=default]/tabs-list:min-h-0",
  "portee-app:group-data-[variant=default]/tabs-list:px-4",
  "portee-app:group-data-[variant=default]/tabs-list:py-0",
  "portee-app:group-data-[variant=default]/tabs-list:not-data-active:text-muted-foreground",
  "portee-app:group-data-[variant=default]/tabs-list:not-data-active:hover:text-foreground",
  "portee-app:group-data-[variant=default]/tabs-list:data-active:bg-card",
  // Au thème sombre, `bg-card` est PLUS SOMBRE que la piste `--muted` (1,21:1 mesuré) : l'item choisi
  // se lirait creusé. Le sombre garde le remplissage du produit (`bg-input/30`, comme hors portée) —
  // aucune maquette ne dessine le sombre (TCK-2686 fait de même). Un sélecteur de plus pour gagner.
  "portee-app:dark:group-data-horizontal/tabs:group-data-[variant=default]/tabs-list:data-active:bg-input/30",
  "portee-app:group-data-horizontal/tabs:group-data-[variant=default]/tabs-list:data-active:shadow-actif",
  "portee-app:group-data-[variant=default]/tabs-list:group-data-[size=sm]/tabs-list:h-8",
  "portee-app:group-data-[variant=default]/tabs-list:group-data-[size=sm]/tabs-list:px-3",
  "portee-app:group-data-[variant=default]/tabs-list:group-data-[size=sm]/tabs-list:text-ui",
].join(" ")

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 plancher-onglets-declencheur items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/70 transition-[color,background-color,border-color,box-shadow] group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        ONGLET_SOULIGNE_APP,
        SEGMENTE_APP,
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

/**
 * TCK-2687 — le compte d'un onglet (« Documents 4 ») : `text-xs`, chiffres tabulaires, encre
 * discrète. L'écart de 6 px au libellé est le `gap-1.5` de l'onglet (la maquette écrit `ml-1.5`).
 */
function TabsCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="tabs-count"
      className={cn("text-xs tabular-nums text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsCount, tabsListVariants }
