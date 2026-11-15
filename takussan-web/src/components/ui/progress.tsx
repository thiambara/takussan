"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { useLocale } from "next-intl"

import { cn } from "@/lib/utils"

/**
 * TCK-2690 (ADR-0106) — LA JAUGE de la partie connectée, sur `@base-ui/react/progress`
 * (`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`
 * formaté dans la langue de la page).
 *
 * La maquette en dessine quatre (`h-1`, `h-1.5`, `h-2` ; rail `muted` ou `border`) : rail
 * **`h-1.5 rounded-full bg-muted`** (`taille="grand"` : `h-2`), remplissage `rounded-full`. Chaque
 * ton tient 3:1 contre le rail (WCAG 1.4.11, graphique porteur de sens), mesuré dans les deux
 * thèmes : `primary` 4,51 / 3,99, `success` 5,24 / 6,25, `warning` 5,31 / 6,03, `neutral`
 * (`foreground/50`, composé SUR le rail) 3,23 / 4,37.
 *
 * Un NOM accessible est exigé par le type (`aria-label` ou `aria-labelledby`) : une jauge muette
 * ne dit rien à l'assistance.
 */
type TonDeJauge = "primary" | "success" | "warning" | "neutral"

const REMPLISSAGE: Readonly<Record<TonDeJauge, string>> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  neutral: "bg-foreground/50",
}

type NomDeJauge = { readonly "aria-label": string } | { readonly "aria-labelledby": string }

type ProgressProps = Omit<ProgressPrimitive.Root.Props, "children" | "aria-label" | "aria-labelledby"> &
  NomDeJauge & {
    readonly ton?: TonDeJauge
    readonly taille?: "defaut" | "grand"
  }

function Progress({ className, ton = "primary", taille = "defaut", ...props }: ProgressProps) {
  const locale = useLocale()
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      data-ton={ton}
      data-taille={taille}
      locale={locale}
      className={cn("block w-full", className)}
      {...props}
    >
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className={cn("relative block overflow-hidden rounded-full bg-muted", taille === "grand" ? "h-2" : "h-1.5")}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className={cn("block h-full rounded-full transition-[width] motion-reduce:transition-none", REMPLISSAGE[ton])}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

type ProgressSegmentsProps = Omit<
  ProgressPrimitive.Root.Props,
  "children" | "value" | "min" | "max" | "aria-label" | "aria-labelledby"
> &
  NomDeJauge & {
    /** Le nombre d'étapes faites (0 à `total`). */
    readonly value: number
    readonly total: number
    readonly ton?: TonDeJauge
  }

/**
 * La variante « segments » (étapes d'un parcours, pièces d'un dossier) : `total` segments `h-1`
 * séparés de `gap-1.5`, les `value` premiers remplis, les autres au ton du rail. Le défaut de
 * `aria-valuetext` est un POURCENTAGE : un parcours en étapes passe le sien (`aria-valuetext`,
 * « Étape 2 sur 4 »), ou `getAriaValueText`.
 */
function ProgressSegments({ className, value, total, ton = "primary", ...props }: ProgressSegmentsProps) {
  const locale = useLocale()
  return (
    <ProgressPrimitive.Root
      data-slot="progress-segments"
      data-ton={ton}
      value={value}
      min={0}
      max={total}
      locale={locale}
      className={cn("flex w-full gap-1.5", className)}
      {...props}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          data-slot="progress-segment"
          data-rempli={i < value ? "" : undefined}
          aria-hidden="true"
          className={cn("block h-1 min-w-0 flex-1 rounded-full", i < value ? REMPLISSAGE[ton] : "bg-muted")}
        />
      ))}
    </ProgressPrimitive.Root>
  )
}

export { Progress, ProgressSegments }
export type { ProgressProps, ProgressSegmentsProps, TonDeJauge }
