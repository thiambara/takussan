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
 *
 * TCK-2586 — LE FORMULAIRE PLEIN ÉCRAN (`formulaire`) : sous `xl`, l'écran de saisie des maquettes
 * (`EnTeteFormulaire` et `EcranApp bas` de `chrome-app.tsx`) au lieu de l'en-tête du panneau — la
 * croix À GAUCHE (`size-11`), le titre en 16 px 600 et sa ligne d'étape (`sousTitre`, 13 px) sur le
 * fond de la page ; le corps en `px-4 pt-5 pb-8` ; le pied devient la barre collante du téléphone
 * (`BarreDAction` : filet, `px-4 py-3`, ombre `barre-collante`, zone sûre, enfants à parts égales).
 * Dès `xl`, rien ne change : le panneau de 480 px, son en-tête et son pied.
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
  /** TCK-2586 — sous `xl`, l'en-tête et la barre collante d'un formulaire plein écran (cf. ci-dessus). */
  readonly formulaire?: boolean
  /** TCK-2586 — la ligne d'étape sous le titre (« Depuis sa demande · tout est repris »). */
  readonly sousTitre?: React.ReactNode
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
  formulaire = false,
  sousTitre,
  className,
  children,
  ...props
}: PanneauDroitProps) {
  const t = useTranslations("common.actions")
  const [ouvertSeul, setOuvertSeul] = React.useState(defaultOpen)
  const ouvert = open ?? ouvertSeul
  const large = useMatchesMedia("(width >= 80rem)")
  useVerrouDeDefilement(ouvert && !large)
  const plein = formulaire && !large

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
          data-formulaire={plein ? "" : undefined}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-card text-card-foreground outline-none duration-200 xl:w-panneau xl:border-l xl:border-border xl:shadow-panneau",
            plein && "bg-background text-foreground",
            "data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
            className
          )}
          {...props}
        >
          {plein ? (
            <div
              data-slot="panneau-droit-en-tete"
              className="flex h-14 flex-none items-center gap-1 border-b border-border/70 bg-background px-1"
            >
              <SheetClose
                data-slot="panneau-droit-fermer"
                render={<Button variant="ghost" size="icon" className="size-11 text-foreground" aria-label={t("close")} />}
              >
                <XIcon className="size-5" aria-hidden="true" />
              </SheetClose>
              <div className="min-w-0 flex-1 leading-tight">
                <SheetTitle className="truncate text-base leading-5 font-semibold">{titre}</SheetTitle>
                {/* Le fond de l'en-tête redit sur la ligne : le couple encre/fond se mesure (TCK-458). */}
                {sousTitre ? <p className="bg-background text-ui text-muted-foreground">{sousTitre}</p> : null}
              </div>
            </div>
          ) : (
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
          )}
          <div
            data-slot="panneau-droit-corps"
            className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", plein ? "px-4 pt-5 pb-8" : "p-5")}
          >
            {children}
          </div>
          {pied ? (
            <div
              data-slot="panneau-droit-pied"
              className={cn(
                "flex flex-none gap-2 border-t border-border",
                plein
                  ? "bg-card px-4 pt-3 pb-[calc(var(--spacing)*3+env(safe-area-inset-bottom))] shadow-barre-collante *:min-w-0 *:flex-1"
                  : "justify-end px-5 py-3"
              )}
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
