"use client"

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

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
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
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
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
function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/70 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
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

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
