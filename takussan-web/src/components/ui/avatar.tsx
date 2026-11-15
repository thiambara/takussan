"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"

import { cn } from "@/lib/utils"

/**
 * TCK-2687 — les six tailles des maquettes retenues (97 % de leurs usages), en px fixes : elles ne
 * rétrécissent pas au bureau. `sm`, `default` et `lg` restent celles d'avant (24, 32, 40 sur
 * l'échelle ×0,9).
 */
type TailleAvatar = "default" | "sm" | "lg" | "28" | "32" | "36" | "40" | "44" | "48"

function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: TailleAvatar
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
        "data-[size=28]:size-avatar-28 data-[size=32]:size-avatar-32 data-[size=36]:size-avatar-36 data-[size=40]:size-avatar-40 data-[size=44]:size-avatar-44 data-[size=48]:size-avatar-48",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn(
        "aspect-square size-full rounded-full object-cover",
        className
      )}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        // TCK-2687 — le repli lit des JETONS de couleur (`globals.css`, bloc `primitives-de-l-app`) :
        // hors portée `/app`, `bg-muted text-muted-foreground` comme avant ; sous la portée, le beige
        // de chrome et l'encre profonde. Un appelant qui repeint (`bg-foreground text-background`)
        // les REMPLACE (`tailwind-merge` connaît les jetons). La graisse 600 est une variante : hors
        // portée, le repli n'en pose aucune et hérite, comme avant.
        "flex size-full items-center justify-center rounded-full bg-fond-avatar text-sm text-encre-avatar group-data-[size=sm]/avatar:text-xs portee-app:font-semibold",
        // La police vaut 0,36 × la taille, pour les six tailles en px.
        "group-data-[size=28]/avatar:text-avatar-28 group-data-[size=32]/avatar:text-avatar-32 group-data-[size=36]/avatar:text-avatar-36 group-data-[size=40]/avatar:text-avatar-40 group-data-[size=44]/avatar:text-avatar-44 group-data-[size=48]/avatar:text-avatar-48",
        className
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export type { TailleAvatar }

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
