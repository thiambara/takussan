"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverClose = PopoverPrimitive.Close;
const PopoverAnchor = PopoverPrimitive.Trigger;

/**
 * `collisionPadding` (TCK-569) — la marge que le positionneur garde avec les bords de l'écran quand
 * il décale le panneau pour le faire tenir. Le défaut de base-ui est 5 px ; un panneau de la barre
 * mobile la veut égale à la gouttière des pages (16 px), sans quoi il se recale à 5 px du bord, hors
 * de l'alignement du contenu. Non transmise (`undefined`), la primitive garde son défaut : les
 * autres usages (sélecteurs de date, dialogue de visite) sont inchangés — `useAnchorPositioning` de
 * base-ui (1.7) applique son défaut `= 5` à une valeur `undefined`.
 *
 * `voile` (TCK-572, solde de TCK-569) — un voile TRANSPARENT sous le panneau, qui reçoit l'appui
 * « à côté » : le panneau se ferme et RIEN d'autre ne se passe. Sans lui, l'appui qui fermait les
 * favoris à 320 px tombait aussi sur la carte dessous et ouvrait sa fiche (mesuré : `/fr` →
 * `/fr/properties/parking-couvert-a-pikine-UjterU`) — le défaut que TCK-551 a fermé pour le menu
 * mobile. ⚠ Le voile interne de base-ui (`modal`) ne suffit pas : il est posé sans `z-index`, et le
 * lien étiré d'une carte (`absolute inset-0 z-[1]`) passe au-dessus (mesuré, `elementFromPoint`).
 * Celui-ci est juste sous le positionneur (`z-[1099]` contre `z-[1100]`). Opt-in : les autres
 * usages sont inchangés.
 */
function PopoverContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  collisionPadding,
  voile = false,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "side" | "sideOffset" | "align" | "alignOffset" | "collisionPadding"
  > & { readonly voile?: boolean }) {
  return (
    <PopoverPrimitive.Portal>
      {voile ? (
        <PopoverPrimitive.Backdrop data-slot="popover-voile" className="fixed inset-0 z-[1099]" />
      ) : null}
      <PopoverPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        className="isolate z-[1100]"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-[1100] w-72 origin-(--transform-origin) rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverClose };
