import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * TCK-2687 (ADR-0106) — LA CARTE SOUS LA PORTÉE `/app` : un TRAIT sable de 1 px DANS la boîte
 * (`border-border`, #ebe5d5) au lieu de l'anneau gris froid hors boîte, et un titre DM Sans de 15 px
 * en 600. Par la variante `portee-app:` : aucun appelant ne règle ni le trait ni la police d'une
 * carte (relevé du 2026-11-11 : `CardTitle` ne reçoit que `flex items-center gap-2`), et le site
 * public comme `/super-admin` gardent l'anneau au pixel (AC6).
 */
function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        "portee-app:border portee-app:border-border portee-app:ring-0",
        // L'en-tête à filet ouvre la carte : il porte son propre padding, la carte n'en ajoute pas.
        "has-data-filet:pt-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * `filet` (TCK-2687) — l'en-tête de la maquette (`Carte`, `chrome-app.tsx:695`) : `px-4 py-3`, un
 * filet `border-b` sous lui, titre et action alignés au centre. Hors `filet`, l'en-tête d'avant.
 */
function CardHeader({
  className,
  filet = false,
  ...props
}: React.ComponentProps<"div"> & { filet?: boolean }) {
  return (
    <div
      data-slot="card-header"
      data-filet={filet ? "" : undefined}
      className={cn(
        "@container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        // En variantes `data-filet:` et non en `border-b` nu : `[.border-b]:pb-4`, ci-dessus, lit la
        // CLASSE `border-b` et aurait remplacé le `py-3` du bas par 16 px.
        "data-filet:items-center data-filet:gap-x-2 data-filet:border-b data-filet:border-border data-filet:py-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        "portee-app:font-sans portee-app:text-corps portee-app:font-semibold",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end in-data-filet:self-center",
        "portee-app:text-sm portee-app:font-medium portee-app:text-primary",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
