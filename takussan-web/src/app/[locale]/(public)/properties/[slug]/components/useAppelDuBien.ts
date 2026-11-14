'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/toast';
import { numerosDuBien, type NumeroDeContact } from '@/components/contact/numeros-du-bien';
import { signalerClic } from '@/lib/contact-click';

/**
 * Le geste « Appeler » de la fiche — sorti de `PropertyAgentCard` par TCK-2501 (WhatsApp et Appeler
 * quittent la carte de l'agent pour la barre basse et la carte de réservation), INCHANGÉ :
 *
 *   · TCK-590 — le clic est compté (`contact-click`, canal `call`) avant toute lecture, et une
 *     erreur passe par un toast, jamais par une boîte native ;
 *   · TCK-633 (lot C) — une LISTE : un seul numéro se compose aussitôt, plusieurs se rendent à
 *     l'appelant (`numeros`), qui les affiche au même geste.
 */
export function useAppelDuBien(slug: string) {
  const t = useTranslations('propertyDetail.agent');
  const tContact = useTranslations('propertyContact');
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);
  const [numeros, setNumeros] = useState<NumeroDeContact[] | null>(null);

  async function composer(): Promise<void> {
    setEnCours(true);
    signalerClic(slug, 'call');
    try {
      const liste = await numerosDuBien(slug);
      if (liste.length === 1) {
        window.location.href = `tel:${liste[0]!.phone.replace(/\s/g, '')}`;
      } else if (liste.length > 1) {
        setNumeros(liste);
      } else {
        toast.add({ title: tContact('errors.title'), description: t('phoneUnavailable'), type: 'error' });
      }
    } catch {
      toast.add({ title: tContact('errors.title'), description: t('phoneError'), type: 'error' });
    } finally {
      setEnCours(false);
    }
  }

  // Un gestionnaire de clic qui ne rend rien : l'échec est déjà traité (toast) dans `composer`.
  const appeler = (): void => {
    void composer();
  };

  return { appeler, enCours, numeros, fermerNumeros: () => setNumeros(null) };
}
