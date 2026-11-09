'use client';
import { useTranslations } from 'next-intl';
import { ListeDeNumeros } from '@/components/contact/ListeDeNumeros';
import type { PropertyAgencyLite, PropertyDetail, PropertyOwnerLite } from '@/types/property';
import { PropertyAgentCard } from './PropertyAgentCard';
import { PropertyEntryCost } from './PropertyEntryCost';
import { actionsDuContrat, canalPrincipal } from './actions-de-la-fiche';
import {
  PropertyActionButton,
  PropertyApplyAfterVisit,
  PropertyCallButton,
  PropertyMessageButton,
} from './PropertyContactActions';
import { useAppelDuBien } from './useAppelDuBien';

interface PropertyMobileContactProps {
  readonly property: PropertyDetail;
  /** Le destinataire (TCK-502 : `primary_contact ?? owner`). */
  readonly contact: PropertyOwnerLite;
  readonly agency: PropertyAgencyLite | null;
  readonly canMessage: boolean;
  readonly onMessage: () => void;
  readonly onRequestVisit: () => void;
  readonly onRequestBooking: () => void;
}

/**
 * TCK-2501 — le premier écran mobile, sous le prix : **combien pour entrer, et à qui l'on parle**,
 * avant la description (ils arrivaient à ~2 200 et ~2 700 px — audit UX 2026-11).
 *
 * Il porte aussi ce que la barre basse ne porte pas : les canaux autres que celui de premier rang,
 * et l'action seconde du contrat (le dossier après la visite, ou la visite avant l'offre). Jamais un
 * doublon de la barre : la porte « message » n'y paraît que si la barre ne l'a pas prise.
 */
export function PropertyMobileContact({
  property,
  contact,
  agency,
  canMessage,
  onMessage,
  onRequestVisit,
  onRequestBooking,
}: PropertyMobileContactProps) {
  const t = useTranslations('property.detail');
  const canal = canalPrincipal(contact, canMessage);
  const { secondaire } = actionsDuContrat(property);
  const appel = useAppelDuBien(property.slug);
  const appelerIci = contact.has_phone === true && canal !== 'call';
  const ecrireIci = canMessage && canal !== 'message';

  return (
    <div className="space-y-3">
      <PropertyEntryCost entryCost={property.entry_cost} currency={property.currency} repliable />
      <PropertyAgentCard contact={contact} agency={agency} className="p-3" />

      {(appelerIci || ecrireIci) && (
        <div className={appelerIci && ecrireIci ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
          {appelerIci && <PropertyCallButton onClick={appel.appeler} enCours={appel.enCours} />}
          {ecrireIci && <PropertyMessageButton onClick={onMessage} court variant="outline" />}
        </div>
      )}
      {appel.numeros ? <ListeDeNumeros numeros={appel.numeros} /> : null}

      {secondaire === 'apply' ? (
        <PropertyApplyAfterVisit onRequestBooking={onRequestBooking} />
      ) : (
        <PropertyActionButton
          action="visit"
          variant="outline"
          onRequestVisit={onRequestVisit}
          onRequestBooking={onRequestBooking}
          className="w-full"
        />
      )}

      {/* Le signal de confiance de la carte de réservation (bureau), repris sous `lg` : la carte n'y
          est plus rendue, et la phrase accompagne le dossier, l'offre ou la réservation. */}
      <p className="bg-background text-center text-xs text-muted-foreground text-pretty">{t('noChargeNotice')}</p>
    </div>
  );
}
