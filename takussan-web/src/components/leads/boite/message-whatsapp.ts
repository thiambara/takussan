'use client';

import { useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { useNomDeLAgenceActive } from '@/hooks/useNomDeLAgenceActive';
import { prenomDuDemandeur } from '@/lib/demandes/boite';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { libelleDe } from '@/lib/identite';
import type { ContactLead, CreneauLibre } from '@/lib/queries/contact-leads';

/** « Chambre meublée · Ouakam » : le bien et son quartier (TCK-2884), le titre seul sans quartier. */
export function bienEtQuartier(property: NonNullable<ContactLead['property']>): string {
  const quartier = property.address?.neighborhood?.trim();
  return quartier ? `${property.title} · ${quartier}` : property.title;
}

/**
 * TCK-2885 — le message WhatsApp prérempli (maquette `app-fil-commercial` a-0) : « Bonjour Mouhamed,
 * c'est Sokhna Sène de Dakar Immo, au sujet de « Chambre meublée · Ouakam ». Je vous propose samedi
 * 10:00 ou lundi 17:30. »
 *
 *  · l'agent est l'utilisateur courant, l'agence celle de l'espace actif (`useNomDeLAgenceActive`) ;
 *    sans agence (le bailleur, cache vide), « c'est {agent} » seul ;
 *  · sans bien cité, la suite de la demande sur Takussan ;
 *  · la proposition prend les créneaux donnés (deux au plus, LIBRES : `useCreneauxLibresDuBien`) ;
 *    sans créneau, la phrase disparaît et le reste demeure.
 */
export function useMessageWhatsApp() {
  const t = useTranslations('contactLeads');
  const f = useFormatteurs();
  const { user } = useAuth();
  const agence = useNomDeLAgenceActive();
  const agent = libelleDe(user);

  const creneauEnClair = (c: CreneauLibre) =>
    `${f.date(`${c.jour}T12:00:00Z`, { weekday: 'long', timeZone: 'Africa/Dakar' })} ${c.heure}`;

  return (lead: Pick<ContactLead, 'name' | 'property'>, nomDeRepli: string, creneaux: readonly CreneauLibre[] = []): string => {
    const name = prenomDuDemandeur(lead.name) ?? nomDeRepli;
    const bien = lead.property ? bienEtQuartier(lead.property) : null;
    let base: string;
    if (agent) {
      const intro = agence ? t('whatsapp.intro', { name, agent, agency: agence }) : t('whatsapp.introAlone', { name, agent });
      base = bien ? t('whatsapp.about', { intro, title: bien }) : t('whatsapp.followUp', { intro });
    } else {
      base = bien ? t('whatsappReplyProperty', { name, title: bien }) : t('whatsappReply', { name });
    }
    const [premier, second] = creneaux;
    if (premier && second) return `${base} ${t('whatsapp.twoSlots', { first: creneauEnClair(premier), second: creneauEnClair(second) })}`;
    if (premier) return `${base} ${t('whatsapp.oneSlot', { first: creneauEnClair(premier) })}`;
    return base;
  };
}
