import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"
import { FIELD_DENSITY_HEIGHT } from "@/components/ui/field-density"
import { profil as attributsDuProfil, type NomDuProfil } from "@/lib/clavier"

type ProfilDeChamp = Exclude<NomDuProfil, "texte-long" | "message" | "liens">

/**
 * ADR-0135 — `profil` règle le clavier (type, `inputMode`, touche Entrée, saisie automatique, correction,
 * majuscule) : ses valeurs passent AVANT les props de l'appelant, qui ne surcharge que `autoComplete` et
 * `enterKeyHint` (`scripts/check-champs.mjs` refuse le reste à côté d'un profil).
 */
function Input({ className, type, profil, ...props }: React.ComponentProps<"input"> & { readonly profil?: ProfilDeChamp }) {
  const clavier = profil ? attributsDuProfil(profil) : null
  return (
    <InputPrimitive
      {...clavier}
      type={type ?? clavier?.type}
      data-slot="input"
      className={cn(
        // TCK-468 — la hauteur de base ne change PAS ; une portée
        // `data-field-density="comfortable"` la relève à 44 px (`field-density.ts`).
        // Revue 2026-09-16 : sous `sm`, un PLANCHER de 40 px (`plancher-tactile-10`, en
        // `@layer components` : tout `min-h-*` d'appelant le bat, cf. `button.tsx`) — il ne bat
        // jamais la portée confortable (44 px) et laisse le bureau inchangé. Le texte reste à
        // 16 px sous `md` (`text-base md:text-sm`) : iOS ne zoome pas au focus.
        // TCK-2686 — hauteur, texte et fond par les jetons de l'échelle de densité (`h-controle`,
        // `text-champ`, `bg-fond-champ`, `globals.css`) : mêmes valeurs hors portée, 44 px / 16 px
        // sous le pouce et `h-9` / `text-sm` au bureau dans `/app`, fond `card`.
        FIELD_DENSITY_HEIGHT,
        "h-controle w-full min-w-0 plancher-tactile-10 rounded-lg border border-input bg-fond-champ px-3 py-1 text-champ transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input, type ProfilDeChamp }
