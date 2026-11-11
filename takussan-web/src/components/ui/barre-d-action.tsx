"use client"

import type * as React from "react"
import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

/**
 * L'`id` de l'emplacement que la coque `/app` (`AppShell`) réserve à la barre, ENTRE la rangée du
 * contenu et la barre d'onglets. Emplacement provisoire de TCK-2689 : TCK-2617 (en-tête du
 * téléphone) le reprend tel quel.
 */
export const EMPLACEMENT_BARRE_D_ACTION = "emplacement-barre-d-action"

const abonner = () => () => {}

/**
 * TCK-2689 (ADR-0106, annexe B § 3.2 et § 6 n° 10, annexe C § 2.3 et § 4) — LA BARRE D'ACTION
 * COLLANTE du bas de l'écran, au téléphone : `EcranApp` `bas` des maquettes retenues
 * (`chrome-app.tsx:433`), 20 pages.
 *
 *  · 73 px = filet 1 + `py-3` (12 + 12) + une action principale de 48 (`<Button size="xl">`) —
 *    mesuré sur 49 écrans (C § 2.3 ; TCK-2617 écrivait 64, à tort). `border-t border-border bg-card
 *    px-4 py-3`, ombre nommée `shadow-barre-collante` (TCK-2685).
 *  · Contenu : une action pleine largeur, ou deux à 50/50 (`gap-2`, chaque enfant `flex-1`).
 *  · PLACE : en flux, ENTRE le contenu et la barre d'onglets (`flex-none`) — rien ne passe dessous,
 *    et le `<main>` rétrécit de sa hauteur (TCK-503). Dans la coque, la barre est rendue EN PORTAIL
 *    dans l'emplacement `#emplacement-barre-d-action` ; hors de la coque (la vitrine), en flux là où
 *    elle est écrite. Elle n'est rendue qu'une fois le document hydraté : au rendu serveur, l'emplacement
 *    n'est pas encore lisible.
 *  · ZONE SÛRE (exception (2) d'ADR-0106) : aucune au-dessus de la barre d'onglets (elle porte la
 *    sienne) ; `env(safe-area-inset-bottom)` en plus quand la barre est le BAS de l'écran — la coque
 *    le dit à son emplacement (`data-bas-de-l-ecran`, sans barre d'onglets), l'appelant hors coque
 *    par `zoneSure`.
 *  · BUREAU : aucune barre collante dans les maquettes bureau retenues — rendue sous `md` seulement.
 *    ⚠ `md:hidden` CACHE, il ne démonte pas : les boutons restent dans le DOM dès `md`. La page pose
 *    son action de bureau ailleurs (en-tête, pied de carte), et un test jsdom voit les deux.
 *  · Le TOAST se pose au-dessus d'elle : `--barre-d-action-hauteur` (globals.css) s'ajoute à
 *    `--toast-bas` quand la barre occupe l'emplacement. Le dock flottant (`--floating-dock-base`)
 *    garde son calcul (contrainte du ticket) : une page qui monte les deux les vérifie ensemble.
 *
 * ⚠ FORMULAIRE : rendue en portail, la barre est HORS du `<form>` de la page dans le DOM. Son bouton
 * d'envoi le nomme : `<Button type="submit" form="<id du formulaire>">`. Sans `form`, il n'envoie rien.
 */
interface BarreDActionProps extends React.ComponentProps<"div"> {
  /** La barre est le bas de l'écran hors de la coque (aucune barre d'onglets sous elle). */
  readonly zoneSure?: boolean
}

function BarreDAction({ zoneSure = false, className, children, ...props }: BarreDActionProps) {
  const hydrate = useSyncExternalStore(abonner, () => true, () => false)
  const emplacement = useSyncExternalStore(
    abonner,
    () => document.getElementById(EMPLACEMENT_BARRE_D_ACTION),
    () => null
  )
  if (!hydrate) return null

  const barre = (
    <div
      data-slot="barre-d-action"
      data-zone-sure={zoneSure ? "" : undefined}
      className={cn(
        "flex flex-none gap-2 border-t border-border bg-card px-4 py-3 shadow-barre-collante md:hidden *:min-w-0 *:flex-1",
        "data-zone-sure:pb-[calc(var(--spacing)*3+env(safe-area-inset-bottom))] in-data-bas-de-l-ecran:pb-[calc(var(--spacing)*3+env(safe-area-inset-bottom))]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )

  return emplacement ? createPortal(barre, emplacement) : barre
}

export { BarreDAction }
export type { BarreDActionProps }
