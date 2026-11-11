"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetPortal, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useMatchesMedia } from "@/hooks/useMatchesMedia"
import { useVerrouDeDefilement } from "@/hooks/useVerrouDeDefilement"
import { cn } from "@/lib/utils"

/**
 * TCK-2688 (ADR-0106) — LE PANNEAU LATÉRAL DROIT de la partie connectée : l'aperçu d'une ligne ou un
 * formulaire court, ouvert à côté de la liste. Maquette : `PanneauDroit` de `chrome-app.tsx`.
 *
 * Construit sur les pièces de `Sheet`, comme `FeuilleDuBas` (TCK-2690) : `SheetContent side="right"`
 * et ses onze appelants d'avant (288 px, voile, modal) restent INCHANGÉS. Les pages l'adoptent avec
 * leurs tickets (vagues 86 à 90).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * DEUX RÉGIMES, PAR LA LARGEUR (ADR-0106 § 4 : « un panneau de fiche de 480 px passe en plein écran
 * sous `xl` »)
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * · Dès `xl` (1280) : 480 px FIXES (`w-panneau`, 30rem, hors de l'échelle du bureau), bord gauche,
 *   ombre `panneau`, AUCUN voile, et NON MODAL — décision du porteur du 2026-11-10 (2 a) : la page
 *   reste lisible et cliquable à côté. Le focus entre dans le panneau à l'ouverture sans y être
 *   piégé, `Échap` ferme, le focus revient au déclencheur. Un clic dans la page NE ferme PAS le
 *   panneau (`disablePointerDismissal`) : on clique une autre ligne sans le perdre.
 * · Sous `xl` : plein écran. Il ne reste rien de cliquable à côté, le panneau redevient un dialogue
 *   à focus piégé, défilement verrouillé par `useVerrouDeDefilement` (TCK-551 : le verrou de Base UI
 *   ne tient pas au doigt).
 * Le seuil est une requête MÉDIA en `rem` (lue contre la taille initiale du navigateur, ADR-0107).
 *
 * En-tête `h-14 border-b pl-5 pr-2`, titre 17 px (`text-titre-court`) en 600, fermer `size-9`
 * (`size="icon"` : 36 px sous la portée au bureau, 44 au pouce) avec une croix de 20 px ; corps
 * `p-5` qui défile ; pied `flex justify-end gap-2 border-t px-5 py-3`.
 */
interface PanneauDroitProps
  extends Omit<DialogPrimitive.Popup.Props, "children" | "className" | "title"> {
  /** Ouverture contrôlée. Sans elle, le panneau gère son état (avec `declencheur` ou `defaultOpen`). */
  readonly open?: boolean
  readonly defaultOpen?: boolean
  readonly onOpenChange?: DialogPrimitive.Root.Props["onOpenChange"]
  /** Le titre de l'en-tête, nom accessible du dialogue. Tronqué sur une ligne. */
  readonly titre: React.ReactNode
  /** L'élément qui ouvre le panneau (rendu par `SheetTrigger`). */
  readonly declencheur?: React.ReactElement
  /** Les actions du pied, alignées à droite. */
  readonly pied?: React.ReactNode
  readonly className?: string
  readonly children: React.ReactNode
}

function PanneauDroit({
  open,
  defaultOpen = false,
  onOpenChange,
  titre,
  declencheur,
  pied,
  className,
  children,
  ...props
}: PanneauDroitProps) {
  const t = useTranslations("common.actions")
  const [ouvertSeul, setOuvertSeul] = React.useState(defaultOpen)
  const ouvert = open ?? ouvertSeul
  const large = useMatchesMedia("(width >= 80rem)")
  useVerrouDeDefilement(ouvert && !large)

  const changer: NonNullable<DialogPrimitive.Root.Props["onOpenChange"]> = (suivant, details) => {
    if (open === undefined) setOuvertSeul(suivant)
    onOpenChange?.(suivant, details)
  }

  return (
    <Sheet open={ouvert} onOpenChange={changer} modal={large ? false : "trap-focus"} disablePointerDismissal>
      {declencheur ? <SheetTrigger render={declencheur} /> : null}
      <SheetPortal>
        <DialogPrimitive.Popup
          data-slot="panneau-droit"
          data-regime={large ? "lateral" : "plein-ecran"}
          // base-ui ne pose pas `aria-modal` (point porteur n° 1) : vrai en plein écran, où le reste
          // de la page est rendu inerte ; ABSENT au régime latéral, où la page reste utilisable.
          aria-modal={large ? undefined : "true"}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-card text-card-foreground outline-none duration-200 xl:w-panneau xl:border-l xl:border-border xl:shadow-panneau",
            "data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
            className
          )}
          {...props}
        >
          <div
            data-slot="panneau-droit-en-tete"
            className="flex h-14 flex-none items-center gap-2 border-b border-border pr-2 pl-5"
          >
            <SheetTitle className="min-w-0 flex-1 truncate text-titre-court font-semibold">{titre}</SheetTitle>
            <SheetClose
              data-slot="panneau-droit-fermer"
              render={<Button variant="ghost" size="icon" className="text-foreground" aria-label={t("close")} />}
            >
              <XIcon className="size-5" aria-hidden="true" />
            </SheetClose>
          </div>
          <div data-slot="panneau-droit-corps" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            {children}
          </div>
          {pied ? (
            <div
              data-slot="panneau-droit-pied"
              className="flex flex-none justify-end gap-2 border-t border-border px-5 py-3"
            >
              {pied}
            </div>
          ) : null}
        </DialogPrimitive.Popup>
      </SheetPortal>
    </Sheet>
  )
}

export { PanneauDroit }
export type { PanneauDroitProps }
