'use client';

import type { ReactElement } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Sheet, SheetClose, SheetOverlay, SheetPortal, SheetTrigger } from '@/components/ui/sheet';
import { useFermeAuRetour } from '@/hooks/useFermeAuRetour';
import { useVerrouDeDefilement } from '@/hooks/useVerrouDeDefilement';
import { cn } from '@/lib/utils';

import { ContenuDeLaCloche } from './ContenuDeLaCloche';

interface FeuilleDesNotificationsProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** La cloche : rendue par `SheetTrigger`, elle reprend le focus à la fermeture. */
  readonly declencheur: ReactElement;
}

/**
 * TCK-2634 — au téléphone, la cloche ouvre une FEUILLE (maquette `app-notifications`, `FeuilleCloche`)
 * au lieu du popover de 340 px : voile `foreground/35`, panneau `rounded-t-2xl bg-background` de 92 %
 * de la hauteur, poignée, en-tête, puces, liste qui défile, pied « Tout l'historique · Préférences ».
 *
 * Pas `FeuilleDuBas` : son corps a une gouttière (`px-4`) que les rangées bord à bord n'ont pas, son
 * en-tête n'a pas de place pour « Tout lire », et elle devient le panneau latéral dès `md` — or la
 * cloche du téléphone n'existe que sous `md` (l'en-tête mobile est `md:hidden`). Elle en reprend les
 * pièces et les règles :
 *  · le focus est piégé et rendu à la cloche à la fermeture (`SheetTrigger`), `Échap` ferme ;
 *  · le défilement de la page est verrouillé par `useVerrouDeDefilement`, pas par base-ui (TCK-551 :
 *    `overflow: hidden` seul ne tient pas au doigt) — d'où `modal="trap-focus"` ;
 *  · le geste retour ferme la feuille (`useFermeAuRetour`) ; une notification ouverte garde
 *    l'entrée, pour ne pas défaire sa navigation.
 *
 * Le nom du dialogue est « Centre de notifications » (`aria-label`), son titre visible « Notifications ».
 */
export function FeuilleDesNotifications({ open, onOpenChange, declencheur }: FeuilleDesNotificationsProps) {
  const t = useTranslations('nav.notifications');
  const tActions = useTranslations('common.actions');
  useVerrouDeDefilement(open);
  const retour = useFermeAuRetour(open, () => onOpenChange(false));

  return (
    <Sheet open={open} onOpenChange={(suivante) => onOpenChange(suivante)} modal="trap-focus">
      <SheetTrigger render={declencheur} />
      <SheetPortal>
        <SheetOverlay className="bg-foreground/35" />
        <DialogPrimitive.Popup
          data-slot="feuille-des-notifications"
          aria-label={t('center')}
          aria-modal="true"
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex h-[92dvh] flex-col overflow-hidden rounded-t-2xl bg-background text-foreground shadow-feuille outline-none duration-200',
            'data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none',
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-8 flex-none rounded-full bg-border" />
          <ContenuDeLaCloche
            surface="feuille"
            onFermer={(parNavigation) => {
              if (parNavigation) retour.garderLEntree();
              onOpenChange(false);
            }}
            fermer={
              <SheetClose
                aria-label={tActions('close')}
                className="inline-flex size-11 flex-none items-center justify-center rounded-full text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
              >
                <XIcon className="size-5" aria-hidden="true" />
              </SheetClose>
            }
          />
        </DialogPrimitive.Popup>
      </SheetPortal>
    </Sheet>
  );
}
