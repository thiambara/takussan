"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-scrim/30 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

/**
 * ⚠ **Le titre était en pierre 900 et la description en pierre 500 — sur un `bg-card` qui
 * bascule, eux non.** Mesuré le 2026-08-27 (TCK-384), c'est le défaut le plus coûteux que ce
 * ticket a trouvé, et il ne se voyait pas en thème clair :
 *
 *   titre        pierre 900 #1c1917 sur --card clair #ffffff .......... 17,49:1  ✓
 *   titre        pierre 900 #1c1917 sur --card SOMBRE #2a2018 ......... **1,10:1**  ✗✗
 *   description  pierre 500 #79716b sur --card SOMBRE #2a2018 ......... 3,33:1   ✗ (AA : 4,5)
 *
 * Un titre à 1,10:1 n'est pas « peu contrasté », il est ABSENT. Les jetons rendent 15,16:1 et
 * 7,01:1 sur la même surface sombre, et 17,53:1 / 5,72:1 en clair.
 */
function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold text-card-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "left",
  ...props
}: DialogPrimitive.Popup.Props & {
  side?: "left" | "right" | "bottom" | "top"
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col bg-card shadow-[0_0_40px_0_color-mix(in_srgb,var(--foreground)_4%,transparent)] outline-none duration-200 data-open:animate-in data-closed:animate-out",
          (side === "left" || side === "right") && "inset-y-0 h-full w-72",
          (side === "top" || side === "bottom") && "inset-x-0 w-full max-h-[90vh]",
          side === "left" &&
            "left-0 data-open:slide-in-from-left data-closed:slide-out-to-left",
          side === "right" &&
            "right-0 data-open:slide-in-from-right data-closed:slide-out-to-right",
          side === "bottom" &&
            "bottom-0 data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
          side === "top" &&
            "top-0 data-open:slide-in-from-top data-closed:slide-out-to-top",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </SheetPortal>
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetOverlay, SheetPortal, SheetHeader, SheetTitle, SheetDescription }
