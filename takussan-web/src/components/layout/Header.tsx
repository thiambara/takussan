import * as React from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher"

/**
 * Header — generic public header shell used by the `(public)` layout
 * consumers that opt in to the shared chrome.
 *
 * Provides brand + primary nav slot + language switcher + actions slot
 * (auth buttons / user menu). The marketing home page still uses its own
 * domain-specific `Navbar` with search + categories — this generic Header
 * is the opt-in alternative for lighter public pages.
 */
export interface HeaderProps {
  readonly className?: string
  /** Nav items slot (inject `<Navigation orientation="horizontal">` here). */
  readonly children?: React.ReactNode
  /** Right-hand slot for auth buttons / `<UserMenu>` / CTAs. */
  readonly actions?: React.ReactNode
  /** Show the language switcher (defaults to true). */
  readonly showLanguageSwitcher?: boolean
}

export function Header({
  className,
  children,
  actions,
  showLanguageSwitcher = true,
}: HeaderProps) {
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

        <nav
          aria-label="Navigation principale"
          className="hidden flex-1 items-center gap-6 md:flex"
        >
          {children}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {showLanguageSwitcher ? <LanguageSwitcher variant="compact" /> : null}
          {actions}
        </div>
      </div>
    </header>
  )
}
