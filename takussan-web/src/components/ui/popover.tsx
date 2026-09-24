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
 */
function PopoverContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  collisionPadding,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "side" | "sideOffset" | "align" | "alignOffset" | "collisionPadding"
  >) {
  return (
    <PopoverPrimitive.Portal>
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
