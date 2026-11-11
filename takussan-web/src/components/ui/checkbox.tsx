"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * TCK-2690 (ADR-0106) — LA CASE À COCHER de la partie connectée, sur `@base-ui/react/checkbox`.
 *
 * La maquette en dessine sept (16 / 18 / 20 px, rayons 4 à 8 px) : la valeur majoritaire est
 * retenue (argent, équipe, commissions, biens) — **18 px, rayon 5 px**, en `rem` fixes
 * (`size-icone`, `rounded-case`) : elle ne rétrécit pas au bureau.
 *
 * - vide : bord `controle-vide` (`--input` en clair, 3,59:1 sur `--card` ; `--muted-foreground` en
 *   sombre), fond `--card` — la maquette écrit `foreground/30`, 1,93:1, sous les 3:1 de WCAG 1.4.11 ;
 * - cochée : `border-primary bg-primary`, coche de 14 px au trait 2,5 ;
 * - mixte (`indeterminate`) : même aplat, la BARRE de 10 × 2 de la maquette (`h-0.5 w-2.5`), pas
 *   l'icône `Minus` que le ticket nommait — la maquette fait foi ;
 * - focus : l'anneau plein du produit (TCK-753) ; en erreur : `aria-invalid`, bord `--destructive`.
 *
 * ⚠ **La cible n'est pas la boîte** : 18 px ne font pas une cible tactile. La ligne qui la porte
 * l'est (44 à 56 px) — un `<label>` qui l'enveloppe, et le clic sur le libellé la coche.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative inline-flex size-icone shrink-0 items-center justify-center rounded-case border border-controle-vide bg-card outline-none transition-[color,background-color,border-color,box-shadow]",
        // L'encre de la coche n'existe que cochée ou mixte (l'indicateur n'est rendu qu'alors) : posée
        // nue, elle se lirait sur la case VIDE (`--card`, 1,05:1 — `surface-publique.contraste`).
        "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground",
        "focus-visible:ring-3 focus-visible:ring-ring",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="flex items-center justify-center">
        <CheckIcon className="size-3.5 in-data-indeterminate:hidden" strokeWidth={2.5} aria-hidden="true" />
        <span className="hidden h-0.5 w-2.5 rounded bg-current in-data-indeterminate:block" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
