import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // TCK-2686 — texte, fond, padding vertical et interligne par les jetons de l'échelle de
        // densité (`globals.css`) : mêmes valeurs hors portée, `py-2.5 leading-snug` et fond `card`
        // dans `/app`. Une hauteur de départ d'appelant (`min-h-*`) reste permise.
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-fond-champ px-3 py-zone-texte-y text-champ leading-zone-texte transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-border/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
