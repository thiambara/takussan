'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/ui/toast';
import { marquerArriveeDeParcours } from '@/lib/arrivee-de-parcours';
import { useAuth } from '@/context/AuthContext';
import { WizardReprenable, type WizardStep } from '@/components/wizard/WizardReprenable';
import { ownerOnboardCompleteAction } from '@/app/actions/owner-onboarding';
import {
  INDICATIF_PAR_DEFAUT,
  recomposerTelephone,
  relireTelephoneBrouillon,
} from '@/lib/phone';
import type { InterlocuteurDuBailleur } from '@/lib/owner-onboarding';
import type { PieceDuProfil } from '@/lib/pieces/pieces';

import { AssistantDInvite, etapeDInvite } from './invite/AssistantDInvite';
import { BiensDuBailleur } from './invite/BiensDuBailleur';
import { CeQuiVousAttend } from './invite/CeQuiVousAttend';
import { EtapeDuNumero } from './invite/EtapeDuNumero';

/**
 * TCK-257, refait par TCK-2613 — l'assistant du bailleur invité, en DEUX écrans (maquette
 * `app-entree-assistants`, approche a) :
 *   1. le numéro (obligatoire ; un numéro déjà vérifié saute l'écran) ;
 *   2. la raison de venir : ses biens chez l'agence, « Proposer un bien », puis « Aller à mon espace ».
 *
 * Les pièces (CNI, RIB, NINEA) ne sont plus un écran : elles attendent dans l'espace, sous « Démarrer »
 * (TCK-2612, TCK-2614), et l'écran 2 les rappelle. La visite guidée de trois diapositives a disparu (TCK-2615).
 *
 * `complete()` passe le profil en `active` et pose le profil actif : TOUTE sortie de l'écran 2 l'appelle d'abord
 * (`onAller`), puis va où la personne a demandé.
 */
export type OwnerOnboardingWizardProps = {
  ownerProfileId: number;
  /** Le nom de l'agence qui invite (`Profile.agency.name`) ; `null` s'il n'est pas connu. */
  agence?: string | null;
  /** Les pièces du profil (`GET /api/me/pieces`, `X-Profile-Id`) ; `null` si la lecture a échoué. */
  pieces?: readonly PieceDuProfil[] | null;
  /** TCK-2838 — l'interlocuteur à l'agence (`GET /api/me/owner-profiles/{id}/interlocuteur`) ; `null` : aucune carte. */
  interlocuteur?: InterlocuteurDuBailleur | null;
};

/**
 * Le brouillon garde la forme d'avant (`kyc`, `tour` restent lisibles et ignorés) : un brouillon écrit par
 * l'assistant à quatre écrans reprend à l'écran 2 (`etapeDInvite`).
 */
type WizardData = {
  phone: { number: string; code: string; verified: boolean };
};

function relireBrouillon(data: WizardData): WizardData {
  return {
    ...data,
    phone: {
      ...data.phone,
      // TCK-1362 — un code d'un brouillon d'avant ne survit pas à la relecture.
      code: '',
      number: relireTelephoneBrouillon(data.phone?.number, INDICATIF_PAR_DEFAUT),
    },
  };
}

export function OwnerOnboardingWizard({ ownerProfileId, agence = null, pieces = null, interlocuteur = null }: OwnerOnboardingWizardProps) {
  const t = useTranslations('owners.onboarding');
  const router = useRouter();
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  // Où aller une fois l'onboarding fini : l'espace, un bien, la proposition d'un bien, les pièces.
  const destination = useRef('/app');

  const initialData: WizardData = useMemo(
    () => ({
      phone: {
        // TCK-566 — remis en E.164 : le champ affiche l'indicatif en préfixe et ne porte que la suite.
        number: user?.phone ? recomposerTelephone(user.phone, INDICATIF_PAR_DEFAUT) : '',
        code: '',
        verified: Boolean(user?.phone_verified_at),
      },
    }),
    [user],
  );

  const handleComplete = useCallback(async () => {
    // Le code a été vérifié à l'écran 1 : l'API ne le redemande pas quand `phone_verified_at` est posé.
    const completeRes = await ownerOnboardCompleteAction(ownerProfileId, undefined);
    if (!completeRes.ok) {
      toast.add({ title: t('errors.completeTitle'), description: completeRes.message, type: 'error' });
      return;
    }

    await refreshUser();
    toast.add({ title: t('success.title'), description: t('success.body'), type: 'success' });
    // TCK-2615 — l'arrivée qui suit l'assistant n'ouvre aucune fenêtre de bienvenue.
    marquerArriveeDeParcours('assistant');
    router.push(destination.current);
  }, [ownerProfileId, refreshUser, router, t, toast]);

  const steps: WizardStep<WizardData>[] = useMemo(
    () => [
      { id: 'phone', title: 'phone', canAdvance: (d) => d.phone.verified, render: () => null },
      { id: 'properties', title: 'properties', render: () => null },
    ],
    [],
  );

  return (
    <WizardReprenable<WizardData>
      storageKey={`owner-onboarding-${ownerProfileId}`}
      initialData={initialData}
      relireBrouillon={relireBrouillon}
      etapeImposee={etapeDInvite}
      steps={steps}
      onComplete={handleComplete}
      presentation={(api) => (
        <AssistantDInvite etape={api.etape} agence={agence} pret={api.pret}>
          {api.etape === 0 ? (
            <EtapeDuNumero
              numero={api.data.phone.number}
              onNumero={(number) => api.setData({ ...api.data, phone: { ...api.data.phone, number, verified: false } })}
              agence={agence}
              panneau={<CeQuiVousAttend qui="bailleur" agence={agence} />}
              onVerifie={() => {
                api.setData({ ...api.data, phone: { ...api.data.phone, code: '', verified: true } });
                api.allerA(1);
              }}
            />
          ) : (
            <BiensDuBailleur
              ownerProfileId={ownerProfileId}
              agence={agence}
              telephone={api.data.phone.number || user?.phone || null}
              pieces={pieces}
              interlocuteur={interlocuteur}
              enCours={api.enCours}
              onAller={(href) => {
                destination.current = href;
                void api.suivant();
              }}
            />
          )}
        </AssistantDInvite>
      )}
    />
  );
}
