import { cn } from "@/lib/utils"

/**
 * TCK-2534 — la couleur se lit dans `--skeleton`, `--muted` à défaut. Un squelette `bg-muted` posé
 * DIRECTEMENT sur un fond `bg-muted` (la zone `main` de la console super-admin) avait exactement la
 * couleur du fond : mesuré rgb(241, 236, 224) sur rgb(241, 236, 224), ~280 px vides pendant tout le
 * chargement. La surface qui a ce fond pose `--skeleton` (`SuperAdminShell`) ; partout ailleurs — site
 * public, `/app`, cartes —, la variable est absente et le squelette garde `--muted`, inchangé.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-[var(--skeleton,var(--muted))]", className)}
      {...props}
    />
  )
}

export { Skeleton }
