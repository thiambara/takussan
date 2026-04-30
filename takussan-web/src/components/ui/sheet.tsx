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
        "fixed inset-0 z-50 bg-black/30 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
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

function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold text-stone-900", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-stone-500", className)}
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
  side?: "left" | "right"
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-50 flex h-full w-72 flex-col bg-app-surface-1 shadow-[0_0_40px_0_rgba(31,27,23,0.04)] outline-none duration-200 data-open:animate-in data-closed:animate-out",
          side === "left" &&
            "left-0 data-open:slide-in-from-left data-closed:slide-out-to-left",
          side === "right" &&
            "right-0 data-open:slide-in-from-right data-closed:slide-out-to-right",
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
