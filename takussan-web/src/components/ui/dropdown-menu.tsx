"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
  )
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

/**
 * ⚠ **Le popup était rempli d'un blanc LITTÉRAL, avec `text-foreground` par-dessus** — donc,
 * sous `.dark`, de l'encre #fcf9f3 sur un fond #ffffff : 1,07:1. Le blanc ne basculait pas,
 * l'encre si. Porté sur `--popover` / `--popover-foreground` par TCK-384, la paire que ce
 * composant aurait dû lire depuis l'origine (17,53:1 en clair, 15,16:1 en sombre).
 *
 * L'anneau était un noir littéral à 5 % ; il passe à `ring-border`. `--border` EST la valeur que
 * ce noir approchait en clair, et il devient un filet CLAIR sous `.dark` (`oklch(1 0 0 / 10%)`) —
 * un hairline sombre sur une surface sombre ne dessine rien.
 *
 * ⚠ L'ombre ne pouvait pas devenir un `shadow-*` standard sans changer la géométrie (0 0 40px 0,
 * une lueur ambiante, pas une ombre portée). Elle garde sa géométrie et lit le jeton :
 * `color-mix` sur `var(--foreground)` à 4 % rend en clair très exactement le noir-brun à 4 %
 * qu'elle écrivait en dur (`--foreground` vaut #1f1812), et devient sous `.dark` une lueur
 * claire — ce qui est la forme d'élévation qui fonctionne sur une surface sombre.
 */
function DropdownMenuContent({
  className,
  sideOffset = 8,
  align = "end",
  ...props
}: MenuPrimitive.Popup.Props & {
  sideOffset?: number
  align?: MenuPrimitive.Positioner.Props["align"]
}) {
  return (
    <DropdownMenuPortal>
      {/*
        The Positioner is the element that gets portaled to <body>; the Popup
        sits inside it. The z-index MUST live on the Positioner — otherwise
        the menu lands inside a `position: fixed` ancestor's stacking context
        (e.g. the home navbar at `z-50`) and renders behind it. Mirrors the
        Popover and Select primitives.
      */}
      <MenuPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        className="isolate z-[1100]"
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "z-[1100] min-w-48 overflow-hidden rounded-xl bg-popover p-1 text-sm text-popover-foreground shadow-[0_0_40px_0_color-mix(in_srgb,var(--foreground)_4%,transparent)] outline-none ring-1 ring-border data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </DropdownMenuPortal>
  )
}

function DropdownMenuItem({
  className,
  ...props
}: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-card data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-separator"
      className={cn("my-1 h-px bg-muted", className)}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn("px-3 py-2 text-xs font-semibold text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuPortal,
}
