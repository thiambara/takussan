'use client';
import { useTranslations } from 'next-intl';
import { WhatsAppButton } from '@/components/contact/WhatsAppButton';
import { ListeDeNumeros } from '@/components/contact/ListeDeNumeros';
import { useFloatingDockSlot } from '@/components/floating-dock';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import type { PropertyDetail, PropertyOwnerLite } from '@/types/property';
import { actionsDuContrat, canalPrincipal } from './actions-de-la-fiche';
import { PropertyActionButton, PropertyCallButton, PropertyMessageButton } from './PropertyContactActions';
import { useAppelDuBien } from './useAppelDuBien';

/**
 * Logical height of the sticky toolbar (px). Used by the FloatingDock to
 * lift bottom-right slots (chat FAB, compare pill) above us so they stay
 * reachable even when this bar is mounted on mobile property pages.
 * TCK-2501 — 12 px de haut + 48 px de boutons + 12 px de bas (hors zone sûre) + 1 px de bordure.
 */
const MOBILE_BOTTOM_BAR_HEIGHT_PX = 73;

/** Tailwind `lg` breakpoint (matches the `lg:hidden` wrapper class below). */
const LG_BREAKPOINT_PX = 1024;

interface PropertyMobileBottomBarProps {
  property: PropertyDetail;
  /** TCK-2501 — le destinataire (TCK-502) : son canal de premier rang occupe la moitié gauche. */
  contact: PropertyOwnerLite | null;
  canMessage: boolean;
  onMessage: () => void;
  onRequestVisit: () => void;
  onRequestBooking: () => void;
}

/**
 * TCK-2501 — la barre basse « Le prix d'abord » : **deux boutons de même largeur, sans montant.**
 *
 * Elle portait le prix, tronqué à 390 px (« 2 240 000 F CF… », 172 px nécessaires pour 146 — audit
 * UX 2026-11, P0) : le prix est désormais en tête de fiche, lu avant toute action. À gauche le canal
 * de premier rang (4a : WhatsApp quand le contact l'a déclaré, sinon Appeler, sinon Écrire) ; à
 * droite l'action du contrat (3a : Visiter pour une location au dossier). Les autres canaux et
 * l'action seconde sont dans le bloc de contact, sous l'interlocuteur.
 */
export function PropertyMobileBottomBar({
  property,
  contact,
  canMessage,
  onMessage,
  onRequestVisit,
  onRequestBooking,
}: PropertyMobileBottomBarProps) {
  const t = useTranslations('property.detail');
  const canal = canalPrincipal(contact, canMessage);
  const { primaire } = actionsDuContrat(property);
  const appel = useAppelDuBien(property.slug);

  // Register with the FloatingDock orchestrator (TCK-275) so the chat FAB and
  // comparator pill float ABOVE us instead of being hidden behind the sticky
  // bar. Mirror the `lg:hidden` visual gate on the dock registration: above the
  // `lg` breakpoint (1024px) the bar is `display: none`, so we MUST NOT
  // claim a `bottom-full` slot — otherwise desktop chat/compare slots would
  // float above an invisible bar (phantom offset → AC3 regression).
  const isMobile = useMatchesMaxWidth(LG_BREAKPOINT_PX - 1);
  // TCK-477 — `safeAreaInset` est EXIGÉ par le type pour tout slot `bottom-full`, et
  // le hook le rend sous `paddingBottom` : la valeur déclarée ici est celle qui est
  // posée plus bas, il n'y en a pas deux. La somme n'est pas décorative — mesurée
  // sous TCK-453 : `env(safe-area-inset-bottom)` seul REMPLACE le `py-3` au lieu de
  // s'y ajouter, et vaut `0px` sur tout appareil sans encoche. iOS serait corrigé en
  // faisant perdre 12 px à tous les autres.
  const { bottom, paddingBottom } = useFloatingDockSlot({
    id: 'property-mobile-bottom-bar',
    corner: 'bottom-full',
    height: MOBILE_BOTTOM_BAR_HEIGHT_PX,
    enabled: isMobile,
    safeAreaInset: 'calc(var(--spacing) * 3 + env(safe-area-inset-bottom))',
  });

  // `basis-0` : deux moitiés ÉGALES, quel que soit le libellé ; aucun `truncate` — un libellé qui ne
  // tiendrait plus passerait à la ligne, il ne serait jamais coupé (AC1).
  const moitie = 'h-12 min-h-12 flex-1 basis-0 rounded-xl px-3 text-[0.9375rem] font-semibold whitespace-normal leading-tight';

  return (
    <div
      style={{ bottom, paddingBottom }}
      className="lg:hidden fixed inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur px-4 py-3"
      data-testid="barre-d-actions-de-la-fiche"
    >
      <div className="flex gap-2.5">
        {canal === 'whatsapp' && (
          <WhatsAppButton
            slug={property.slug}
            title={property.title}
            hasWhatsApp
            className={`${moitie} gap-2 py-0`}
          >
            {t('actions.whatsapp')}
          </WhatsAppButton>
        )}
        {canal === 'call' && (
          <PropertyCallButton onClick={appel.appeler} enCours={appel.enCours} className={moitie} />
        )}
        {canal === 'message' && (
          <PropertyMessageButton onClick={onMessage} court variant="outline" className={moitie} />
        )}
        <PropertyActionButton
          action={primaire}
          court
          onRequestVisit={onRequestVisit}
          onRequestBooking={onRequestBooking}
          className={moitie}
        />
      </div>

      {/* Plusieurs numéros (TCK-633) : la liste monte en feuille, au-dessus de la barre. */}
      <Sheet open={appel.numeros !== null} onOpenChange={(ouvert) => !ouvert && appel.fermerNumeros()}>
        <SheetContent side="bottom" className="rounded-t-2xl p-4 pb-[calc(var(--spacing)*4+env(safe-area-inset-bottom))]">
          <SheetHeader className="p-0 pb-3">
            <SheetTitle>{t('actions.numbersTitle', { name: contact?.name ?? '' })}</SheetTitle>
            <SheetDescription>{t('actions.numbersDescription')}</SheetDescription>
          </SheetHeader>
          {appel.numeros ? <ListeDeNumeros numeros={appel.numeros} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
