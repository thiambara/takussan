"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

/**
 * TCK-2690 (ADR-0106) — L'INTERRUPTEUR de la partie connectée, sur `@base-ui/react/switch`
 * (`role="switch"`, `aria-checked`, `Espace` et `Entrée` le basculent).
 *
 * La maquette en dessine quatre gabarits : la valeur majoritaire est retenue (agenda, aujourd'hui,
 * réservations, documents) — **piste 24 × 40** (`h-6 w-10 p-0.5`), pouce `size-5 bg-card` à ombre
 * légère. Sur l'échelle : 21,6 × 36 au bureau, comme toute la maquette à ×0,9.
 *
 * Allumé `bg-primary` (5,32:1 sur `--card`) ; éteint `controle-vide` — la maquette écrit
 * `foreground/20` (1,52:1) ou `border` (1,26:1), sous les 3:1 de WCAG 1.4.11 : `--input` en clair
 * (3,59:1), `--muted-foreground` en sombre.
 *
 * ⚠ **La cible n'est pas la piste** : la ligne qui la porte l'est (un `<label>` qui l'enveloppe).
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-controle-vide p-0.5 outline-none transition-colors",
        "data-checked:bg-primary",
        "focus-visible:ring-3 focus-visible:ring-ring",
        "aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-card shadow-sm transition-transform data-checked:translate-x-4 motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
