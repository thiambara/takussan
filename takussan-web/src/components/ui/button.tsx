import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Revue design 2026-09-16 — trois écarts de la primitive, corrigés ici pour les 117 pages à la fois :
 *
 *  - `transition-all` → la liste exacte des propriétés qui changent (couleurs, anneau, échelle) :
 *    `all` anime aussi `padding`/`width` quand un appelant les fait varier.
 *  - la pression passe de `translate-y-px` à `scale-[0.96]` — un retour tactile qui ne décale
 *    aucune ligne de base ; neutralisé sous `prefers-reduced-motion`.
 *  - le bouton PLEIN n'avait d'état de survol que rendu en `<a>` (`[a]:hover:bg-primary/80`) :
 *    un `<button>` principal ne réagissait pas au pointeur. Le survol prend `--primary-deep`, le
 *    « terracotta profond (hover) » de la charte — plus sombre, donc l'encre claire y GAGNE du
 *    contraste là où `/80` en perdait.
 *  - sous `sm`, les tailles `default`/`lg`/`icon` tiennent au moins 40 px et `sm`/`icon-sm` 36 px
 *    (28-32 px avant, relevé par trois groupes de la revue). C'est un PLANCHER, et il vit dans
 *    `@layer components` (`.plancher-tactile-*`, `globals.css`) — PAS dans les utilitaires :
 *    - une hauteur (`max-sm:h-10`) aurait ramené à 40 px un appelant en `h-11` ;
 *    - un utilitaire (`max-sm:min-h-10`) BATTAIT le `min-h-14` d'un appelant sous 640 px — même
 *      spécificité, variante émise plus tard, et `twMerge` ne voit aucun conflit entre les deux.
 *      Mesuré en relecture : `ContactSheet` rabotée de 56 à 40 px, `StepLieu` de 44 à 36.
 *    Une couche inférieure perd contre TOUT utilitaire d'appelant, quelle que soit sa spécificité :
 *    le plancher ne peut plus que relever, jamais raboter. Le bureau (≥ `sm`) ne bouge pas.
 *    `xs`/`icon-xs` restent délibérément compacts.
 *  - le survol `--primary-deep` est redéfini sous `.dark`, où l'encre devient sombre : plus
 *    CLAIR que `--primary` là-bas (6,78:1), sinon 2,18:1.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-[0.96] motion-reduce:active:not-aria-[haspopup]:scale-100 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--primary-deep)]",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        // TCK-480 — PLAFOND DES APLATS : aucun fond qui porte `text-destructive` au-delà de
        // `/15`. Les trois valeurs corrigées ici (hover `/20`, sombre `/20`, sombre hover
        // `/30`) sont celles qui écrasaient l'encre : mesuré avant correctif, 3,17:1 en
        // clair au survol et 3,39:1 en sombre au survol, encre et fond issus du MÊME jeton.
        // L'anneau et la bordure gardent leurs poids : ils ne portent pas de texte.
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/10 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/10 dark:hover:bg-destructive/10 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 plancher-tactile-10 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 plancher-tactile-9 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 plancher-tactile-10 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8 plancher-tactile-carre-10",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 plancher-tactile-carre-9 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
