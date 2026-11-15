import type { LucideIcon } from 'lucide-react';
import { CalendarClock, CreditCard, Inbox, Megaphone, Settings, Star, TriangleAlert } from 'lucide-react';

import type { AppNotification, FamilleDeNotification } from '@/lib/notifications';

/**
 * TCK-2634 — l'icône et le ton de chaque famille de la cloche, ceux de la maquette retenue
 * (`app-notifications`, `FAMILLES`). Le front ne porte QUE cela : la famille d'une ligne et son
 * « à traiter » viennent de l'API (`NotificationClassification`, TCK-2633), jamais d'une liste ici.
 *
 * Un écart à la maquette : la visite y est `bg-accent/15`, que la garde des valeurs arbitraires refuse
 * dans `/app` (l'accent est réservé aux badges *featured*) — le disque prend le fond d'avatar, comme
 * les disques de la messagerie (TCK-2632), l'icône garde l'encre de l'accent.
 */
export const FAMILLES: Readonly<Record<FamilleDeNotification, { readonly icone: LucideIcon; readonly ton: string }>> = {
  demande: { icone: Inbox, ton: 'bg-primary/12 text-primary-deep' },
  visite: { icone: CalendarClock, ton: 'bg-fond-avatar text-accent' },
  paiement: { icone: CreditCard, ton: 'bg-success/15 text-success' },
  retard: { icone: TriangleAlert, ton: 'bg-warning/15 text-warning' },
  bien: { icone: Megaphone, ton: 'bg-muted text-muted-foreground' },
  avis: { icone: Star, ton: 'bg-secondary text-primary-deep' },
  systeme: { icone: Settings, ton: 'bg-muted text-muted-foreground' },
};

/** La famille d'une ligne ; une réponse qui ne la porte pas (ou une famille inconnue) se lit en `systeme`. */
export function familleDe(notification: AppNotification): FamilleDeNotification {
  const famille = notification.famille;
  return famille && famille in FAMILLES ? famille : 'systeme';
}
