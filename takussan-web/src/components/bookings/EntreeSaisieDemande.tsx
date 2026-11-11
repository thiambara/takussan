'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FilePlus2, Plus } from 'lucide-react';

import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { Button } from '@/components/ui/button';
import { usePersonnelActif } from '@/hooks/usePersonnelActif';
import { SaisirUneDemande, type BienDeLaDemande, type ClientDeLaDemande } from './SaisirUneDemande';

interface EntreeSaisieDemandeProps {
  /**
   * Où l'entrée se pose (TCK-2580, trois points d'entrée, chacun prérempli) :
   * - `reservations` — l'en-tête de la page : le « + » de l'en-tête du téléphone, le bouton primaire
   *   « Saisir une demande » dès `md` (jamais les deux visibles) ; rien de prérempli ;
   * - `fiche` — un geste de la fiche client : le client prérempli.
   *
   * La suite d'une visite terminée (client ET bien) passe par « Et maintenant ? » (TCK-2581), qui
   * ouvre `SaisirUneDemande` directement.
   */
  readonly variante: 'reservations' | 'fiche';
  readonly client?: ClientDeLaDemande;
  readonly bien?: BienDeLaDemande;
}

/**
 * L'entrée « Saisir une candidature ou une offre », réservée au PERSONNEL actif de l'agence
 * (`usePersonnelActif`, le profil actif et non les rôles globaux) : le bailleur et le client ne la
 * voient jamais — l'API, elle, leur répond 403 (`BookingPolicy::recordForCustomer`).
 */
export function EntreeSaisieDemande({ variante, client, bien }: EntreeSaisieDemandeProps) {
  const t = useTranslations('saisieDemande');
  const personnel = usePersonnelActif();
  const [ouvert, setOuvert] = useState(false);
  if (!personnel) return null;

  const feuille = <SaisirUneDemande open={ouvert} onOpenChange={setOuvert} client={client} bien={bien} />;

  if (variante === 'reservations') {
    return (
      <>
        <DeclarerEnTete
          action={
            <ActionDEnTete
              libelle={t('entree')}
              icone={<Plus className="size-5" aria-hidden />}
              onClick={() => setOuvert(true)}
              primaire
            />
          }
        />
        <Button type="button" className="max-md:hidden" onClick={() => setOuvert(true)}>
          <Plus className="size-4" aria-hidden />
          {t('entreeCourte')}
        </Button>
        {feuille}
      </>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-10 gap-2 sm:h-8" onClick={() => setOuvert(true)}>
        <FilePlus2 className="size-4" aria-hidden />
        {t('entree')}
      </Button>
      {feuille}
    </>
  );
}
