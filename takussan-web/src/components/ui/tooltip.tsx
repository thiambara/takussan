"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * TCK-635 — l'infobulle, sur le patron de `popover.tsx` (même `z-[1100]`, au-dessus du lien étiré
 * des cartes). Un texte court qui EXPLIQUE un contrôle déjà nommé : ce qu'elle dit ne doit jamais
 * être le seul endroit où vit une information nécessaire, une infobulle ne s'ouvre pas au toucher.
 */
function TooltipContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "center",
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset" | "align">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={16}
        className="isolate z-[1100]"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "max-w-64 origin-(--transform-origin) rounded-lg bg-foreground px-3 py-2 text-xs leading-snug text-background shadow-md",
            "data-open:animate-in motion-reduce:data-open:animate-none data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out motion-reduce:data-closed:animate-none data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent };
