import type * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * TCK-2689 (ADR-0106, annexe B § 6 n° 22) — LA LIGNE DE LISTE MOBILE de `/app` : `LigneLien` des
 * maquettes retenues (`app-biens-pieces.tsx:158`), 11 pages au moins.
 *
 *  · `flex min-h-14 items-center gap-3 px-4 py-2.5` (56 px au moins), bord à bord de SON conteneur,
 *    filet `border-b border-border` ;
 *  · début : un avatar de 40 px (`<Avatar size="40">`, TCK-2687) OU une icône dans un disque `size-9`
 *    (`IconeDeLigne`) ;
 *  · titre 15 px (`text-corps`) 500, détail 13 px (`text-ui`) en encre discrète, tous deux tronqués
 *    sur une ligne, `leading-snug` comme la maquette ;
 *  · fin : une pastille de statut (`StatusBadge`, TCK-2687), un montant (`MontantDeLigne`, formaté
 *    par l'appelant : préréglage court de TCK-2685) et/ou le chevron `size-4` (`chevron`).
 *
 * LA CIBLE est la ligne entière (56 ≥ 44) : `href` en fait un lien, `onClick` un bouton ; sans
 * l'un ni l'autre, c'est une ligne d'information (`div`).
 */
interface LigneDeListeProps {
  readonly titre: React.ReactNode
  readonly detail?: React.ReactNode
  readonly debut?: React.ReactNode
  readonly fin?: React.ReactNode
  /** Le chevron `size-4` en bout de ligne (une ligne qui mène ailleurs). */
  readonly chevron?: boolean
  readonly href?: string
  readonly onClick?: React.MouseEventHandler<HTMLButtonElement>
  readonly className?: string
}

const CLASSES_LIGNE =
  "flex min-h-14 w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left text-foreground"
const CLASSES_INTERACTIVE =
  "outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"

function LigneDeListe({ titre, detail, debut, fin, chevron = false, href, onClick, className }: LigneDeListeProps) {
  const contenu = (
    <>
      {debut}
      <span className="min-w-0 flex-1 leading-snug">
        <span data-slot="ligne-de-liste-titre" className="block truncate text-corps font-medium">
          {titre}
        </span>
        {detail ? (
          <span data-slot="ligne-de-liste-detail" className="block truncate text-ui text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
      {fin}
      {chevron ? (
        <ChevronRight data-slot="ligne-de-liste-chevron" className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      ) : null}
    </>
  )

  if (href !== undefined) {
    return (
      <Link href={href} data-slot="ligne-de-liste" className={cn(CLASSES_LIGNE, CLASSES_INTERACTIVE, className)}>
        {contenu}
      </Link>
    )
  }
  if (onClick !== undefined) {
    return (
      <button type="button" onClick={onClick} data-slot="ligne-de-liste" className={cn(CLASSES_LIGNE, CLASSES_INTERACTIVE, className)}>
        {contenu}
      </button>
    )
  }
  return (
    <div data-slot="ligne-de-liste" className={cn(CLASSES_LIGNE, className)}>
      {contenu}
    </div>
  )
}

/**
 * L'icône de début, dans un disque `size-9` sur `bg-muted`. L'encre douce OPAQUE de TCK-2685 au lieu
 * de l'encre principale à 70 % de la maquette (TCK-658 : aucune encre translucide).
 */
function IconeDeLigne({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="ligne-de-liste-icone"
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-encre-douce [&_svg:not([class*='size-'])]:size-icone",
        className
      )}
      {...props}
    />
  )
}

/** Le montant de fin de ligne : `text-sm` 500, chiffres tabulaires, jamais coupé. */
function MontantDeLigne({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="ligne-de-liste-montant"
      className={cn("flex-none whitespace-nowrap text-sm font-medium tabular-nums", className)}
      {...props}
    />
  )
}

export { LigneDeListe, IconeDeLigne, MontantDeLigne }
export type { LigneDeListeProps }
