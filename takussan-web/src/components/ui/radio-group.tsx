"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { cn } from "@/lib/utils"

/**
 * TCK-2688 (ADR-0106) — LE RADIO de la partie connectée, sur `@base-ui/react/radio` : un groupe qui
 * gère les flèches, la boucle et l'arrêt de tabulation unique, et un rond PEINT (pas l'`accent-color`
 * bleu du système, cf. `ChoiceCard`). Aucun appelant d'avant : son défaut EST la maquette.
 *
 * · 20 px (`size-5`, l'échelle du bureau : 18 dès `lg`, comme la maquette le rend à 1440) ; la
 *   maquette en dessine aussi de 16 et de 18 px, la recommandation D5 de l'annexe B retient 20.
 * · Bord 1 px `controle-vide` (TCK-2690) — la maquette écrit `foreground/30` ou `input/60`
 *   (1,26 à 2,01:1) ; WCAG 1.4.11 veut 3:1 : `--input` en clair (3,59:1), `--muted-foreground` en
 *   sombre (ADR-0106 § 2 a). Coché : bord `primary` et point `size-2.5 bg-primary`.
 * · Le libellé est l'affaire de l'appelant : `<label>` qui l'enveloppe (eslint le sait :
 *   `controlComponents`), ou `aria-labelledby`.
 */
function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn("grid gap-3", className)} {...props} />
}

function Radio({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio"
      className={cn(
        "peer relative inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-controle-vide bg-card outline-none transition-[border-color,box-shadow]",
        "data-checked:border-primary",
        "focus-visible:ring-3 focus-visible:ring-ring",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator data-slot="radio-indicator" className="size-2.5 rounded-full bg-primary" />
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, Radio }
