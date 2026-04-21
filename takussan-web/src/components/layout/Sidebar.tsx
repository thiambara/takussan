"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Sheet, SheetContent } from "@/components/ui/sheet"

/**
 * Sidebar — generic vertical navigation shell.
 *
 * Empty structural skeleton intended to be populated by TCK-055
 * (Layout System + Navigation). The authenticated app uses the
 * richer AppSidebar; this one targets any screen that needs a
 * responsive sidebar with Sheet-driven mobile behaviour.
 *
 * Consumers wire nav items via `children`. For mobile, pair with
 * a trigger button that toggles `open`.
 */
export interface SidebarProps {
  readonly className?: string
  /** Nav items injected by consumers (TCK-055 will wire this). */
  readonly children?: React.ReactNode
  /** Controls the mobile Sheet. */
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  /** Accessible title for the mobile Sheet. */
  readonly mobileTitle?: string
}

function SidebarSurface({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <nav
      aria-label="Navigation latérale"
      className={cn(
        "flex h-full w-64 shrink-0 flex-col gap-1 border-r border-border bg-background p-4",
        className
      )}
    >
      {children}
    </nav>
  )
}

export function Sidebar({
  className,
  children,
  open,
  onOpenChange,
  mobileTitle = "Navigation",
}: SidebarProps) {
  return (
    <>
      {/* Desktop */}
      <aside className={cn("hidden md:block", className)}>
        <SidebarSurface>{children}</SidebarSurface>
      </aside>

      {/* Mobile */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-72 p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            {mobileTitle}
          </div>
          <SidebarSurface className="w-full border-r-0">
            {children}
          </SidebarSurface>
        </SheetContent>
      </Sheet>
    </>
  )
}
