'use client';
import { useTranslations } from 'next-intl';
import { WhatsAppButton } from '@/components/contact/WhatsAppButton';
import { ListeDeNumeros } from '@/components/contact/ListeDeNumeros';
import type { PropertyDetail, PropertyOwnerLite } from '@/types/property';
import { PropertyEntryCost } from './PropertyEntryCost';
import { actionsDuContrat } from './actions-de-la-fiche';
import {
  PropertyActionButton,
  PropertyApplyAfterVisit,
  PropertyCallButton,
  PropertyMessageButton,
  PropertyPrice,
} from './PropertyContactActions';
import { useAppelDuBien } from './useAppelDuBien';

interface PropertyBookingCardProps {
  property: PropertyDetail;
  /** TCK-2501 — le destinataire (TCK-502 : `primary_contact ?? owner`) : ses canaux sont ici. */
  contact: PropertyOwnerLite | null;
  onRequestVisit: () => void;
  onRequestBooking: () => void;
  onMessage: () => void;
  /**
   * TCK-500 — `false` retire le bouton. Un agent (ou le propriétaire) n'a personne à qui écrire
   * sur son propre bien : l'API répondait 422 APRÈS qu'il ait rédigé son message.
   */
  canMessage?: boolean;
}

/**
 * La carte de réservation de BUREAU (la barre basse tient ce rôle sous `lg`).
 *
 * TCK-2501 — l'ordre de la maquette « Le prix d'abord » : prix, coût d'entrée, l'action du contrat
 * (« Demander une visite » d'abord pour une location au dossier — décision 3a), puis WhatsApp et
 * Appeler, sortis de la carte de l'agent (4a), puis LA porte « message », la seule de la page.
 */
export function PropertyBookingCard({
  property,
  contact,
  onRequestVisit,
  onRequestBooking,
  onMessage,
  canMessage = true,
}: PropertyBookingCardProps) {
  const t = useTranslations('property.detail');
  const { primaire, secondaire } = actionsDuContrat(property);
  // TCK-590 — sans numéro, ni « Appeler » ni WhatsApp. TCK-633 — WhatsApp vers un numéro DÉCLARÉ.
  const hasPhone = contact?.has_phone === true;
  const hasWhatsApp = contact?.has_whatsapp === true;
  const appel = useAppelDuBien(property.slug);

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div>
        <PropertyPrice property={property} className="text-3xl tracking-tight" periodeClassName="text-base" />
        {property.contract_type_label && (
          <p className="text-sm text-muted-foreground mt-0.5">{property.contract_type_label}</p>
        )}
      </div>

      {/* TCK-598 (V9) — sous le prix ; absent quand l'API rend `null`. */}
      <PropertyEntryCost entryCost={property.entry_cost} currency={property.currency} />

      <div className="space-y-2">
        <PropertyActionButton
          action={primaire}
          onRequestVisit={onRequestVisit}
          onRequestBooking={onRequestBooking}
          className="w-full"
        />
        {secondaire === 'visit' && (
          <PropertyActionButton
            action="visit"
            variant="outline"
            onRequestVisit={onRequestVisit}
            onRequestBooking={onRequestBooking}
            className="w-full"
          />
        )}
        {(hasWhatsApp || hasPhone) && (
          <div className={hasWhatsApp && hasPhone ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
            <WhatsAppButton
              slug={property.slug}
              title={property.title}
              hasWhatsApp={hasWhatsApp}
              className="h-11 min-h-11 gap-2 px-3 py-0 text-sm"
            >
              {t('actions.whatsapp')}
            </WhatsAppButton>
            {hasPhone && <PropertyCallButton onClick={appel.appeler} enCours={appel.enCours} />}
          </div>
        )}
        {appel.numeros ? <ListeDeNumeros numeros={appel.numeros} /> : null}
        {canMessage && <PropertyMessageButton onClick={onMessage} className="w-full" />}
      </div>

      {secondaire === 'apply' && (
        <PropertyApplyAfterVisit onRequestBooking={onRequestBooking} className="border-t border-border pt-3" />
      )}

      <p className="text-xs text-muted-foreground text-center text-pretty">
        {t('noChargeNotice')}
      </p>
    </section>
  );
}
