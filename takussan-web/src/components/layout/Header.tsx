import * as React from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * Header — generic public header shell.
 *
 * Empty structural skeleton intended to be populated by TCK-055
 * (Layout System + Navigation). The authenticated app uses the
 * richer AppTopbar; this component targets public pages that
 * only need brand + a thin slot row.
 */
export interface HeaderProps {
  readonly className?: string
  /** Nav items injected by consumers (TCK-055 will wire this). */
  readonly children?: React.ReactNode
  /** Right-hand slot for auth buttons, CTAs, etc. */
  readonly actions?: React.ReactNode
}

export function Header({ className, children, actions }: HeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70",
        className
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Retour à l'accueil Takussan"
        >
          Takussan
        </Link>

        {/* Primary nav slot — nav items injected by TCK-055 */}
        <nav
          aria-label="Navigation principale"
          className="hidden flex-1 items-center gap-6 md:flex"
        >
          {children}
        </nav>

        {/* Actions slot (auth, CTA) */}
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
    </header>
  )
}
