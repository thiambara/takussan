import * as React from "react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"

/**
 * Footer — generic minimal public footer shell.
 *
 * Structural skeleton intended to be populated by TCK-055
 * (Layout System + Navigation). The rich marketing footer used on the
 * landing page lives in `@/components/home/Footer`. This component
 * targets secondary public pages that only need a compact footer.
 */
export interface FooterProps {
  readonly className?: string
  /** Link clusters injected by consumers (TCK-055 will wire these). */
  readonly children?: React.ReactNode
}

export function Footer({ className, children }: FooterProps) {
  // next-intl 4 : appelable en composant serveur tant que le composant n'est pas `async`.
  const t = useTranslations()
  const year = new Date().getFullYear()
  return (
    <footer
      className={cn(
        "mt-auto w-full border-t border-border bg-background",
        className
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {children ? (
          <>
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
              {children}
            </div>
            <Separator />
          </>
        ) : null}
        <div className="flex flex-col items-start justify-between gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <p>{t("layout.footer.brandLine")}</p>
          <p>{t("footer.copyright", { year })}</p>
        </div>
      </div>
    </footer>
  )
}
