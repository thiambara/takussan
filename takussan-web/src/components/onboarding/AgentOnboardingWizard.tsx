'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/ui/toast';
import { marquerArriveeDeParcours } from '@/lib/arrivee-de-parcours';
import { useAuth } from '@/context/AuthContext';
import { WizardReprenable, type WizardStep } from '@/components/wizard/WizardReprenable';
import { agentOnboardCompleteAction } from '@/app/actions/agent-onboarding';
import { INDICATIF_PAR_DEFAUT, recomposerTelephone, relireTelephoneBrouillon } from '@/lib/phone';
import type { PieceDuProfil } from '@/lib/pieces/pieces';

import { AssistantDInvite, etapeDInvite } from './invite/AssistantDInvite';
import { EtapeDuNumero } from './invite/EtapeDuNumero';
import { ProspectDeLAgent, SPECIALISATIONS, type Specialisation } from './invite/ProspectDeLAgent';

/**
 * TCK-259, refait par TCK-2613 — l'assistant de l'agent invité, en DEUX écrans (maquette `app-entree-assistants`,
 * approche a) :
 *   1. le numéro (obligatoire ; un numéro déjà vérifié saute l'écran) ;
 *   2. la raison de venir : le premier prospect confié par l'agence, ses zones et sa spécialisation, les droits
 *      que l'agence lui donne, puis « Aller à mon espace ».
 *
 * La carte professionnelle, la pièce d'identité et la photo ne sont plus un écran : elles attendent dans l'espace,
 * sous « Démarrer » (TCK-2612, TCK-2614), et l'écran 2 les rappelle. Plus de « Soumettre le dossier » : la
 * soumission n'ouvrait aucune revue (TCK-685).
 *
 * `complete()` passe le profil en `active` et pose le profil actif : TOUTE sortie de l'écran 2 l'appelle d'abord,
 * puis va où la personne a demandé (son espace, la fiche du prospect, les demandes).
 */
export type AgentOnboardingWizardProps = {
  agentProfileId: number;
  /** Le nom de l'agence qui invite (`Profile.agency.name`) ; `null` s'il n'est pas connu. */
  agence?: string | null;
  /** La spécialisation enregistrée sur le profil (`Profile.specialty`). */
  specialite?: string | null;
  /** Les pièces du profil (`GET /api/me/pieces`, `X-Profile-Id`) ; `null` si la lecture a échoué. */
  pieces?: readonly PieceDuProfil[] | null;
};

/**
 * Le brouillon garde la forme d'avant pour `phone` et `specialization` : un brouillon de l'assistant à quatre
 * écrans reprend à l'écran 2 avec les zones qu'il avait ENREGISTRÉES (`saved`). `kyc` reste lisible et ignoré.
 */
type WizardData = {
  phone: { number: string; code: string; verified: boolean };
  specialization: { value: Specialisation | ''; zones: string[]; saved: boolean };
};

function specialiteConnue(valeur: string | null | undefined): Specialisation | '' {
  return (SPECIALISATIONS as readonly string[]).includes(valeur ?? '') ? (valeur as Specialisation) : '';
}

export function AgentOnboardingWizard({ agentProfileId, agence = null, specialite = null, pieces = null }: AgentOnboardingWizardProps) {
  const t = useTranslations('agents.onboarding');
  const router = useRouter();
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  // Où aller une fois l'onboarding fini : l'espace, la fiche du prospect, les demandes.
  const destination = useRef('/app');
  const specialisationDuProfil = specialiteConnue(specialite);

  const initialData: WizardData = useMemo(
    () => ({
      phone: {
        // TCK-566 — remis en E.164 : le champ affiche l'indicatif en préfixe et ne porte que la suite.
        number: user?.phone ? recomposerTelephone(user.phone, INDICATIF_PAR_DEFAUT) : '',
        code: '',
        verified: Boolean(user?.phone_verified_at),
      },
      specialization: { value: specialisationDuProfil, zones: [], saved: false },
    }),
    [user, specialisationDuProfil],
  );

  const relireBrouillon = useCallback(
    (data: WizardData): WizardData => ({
      ...data,
      phone: {
        ...data.phone,
        // TCK-1362 — un code d'un brouillon d'avant ne survit pas à la relecture.
        code: '',
        number: relireTelephoneBrouillon(data.phone?.number, INDICATIF_PAR_DEFAUT),
      },
      // Une saisie jamais enregistrée n'est pas ce que l'agence lit : l'écran montrerait des zones qu'aucune
      // demande ne suit. Seul ce qui a été enregistré revient ; sinon, la spécialisation du profil.
      specialization: data.specialization?.saved
        ? {
            value: specialiteConnue(data.specialization.value) || specialisationDuProfil,
            zones: Array.isArray(data.specialization.zones) ? data.specialization.zones : [],
            saved: true,
          }
        : { value: specialisationDuProfil, zones: [], saved: false },
    }),
    [specialisationDuProfil],
  );

  const handleComplete = useCallback(async () => {
    // Le code a été vérifié à l'écran 1 : l'API ne le redemande pas quand `phone_verified_at` est posé.
    const completeRes = await agentOnboardCompleteAction(agentProfileId, undefined);
    if (!completeRes.ok) {
      toast.add({ title: t('errors.completeTitle'), description: completeRes.message, type: 'error' });
      return;
    }

    await refreshUser();
    toast.add({ title: t('success.title'), description: t('success.body'), type: 'success' });
    // TCK-2615 — l'arrivée qui suit l'assistant n'ouvre aucune fenêtre de bienvenue.
    marquerArriveeDeParcours('assistant');
    router.push(destination.current);
  }, [agentProfileId, refreshUser, router, t, toast]);

  const steps: WizardStep<WizardData>[] = useMemo(
    () => [
      { id: 'phone', title: 'phone', canAdvance: (d) => d.phone.verified, render: () => null },
      { id: 'prospect', title: 'prospect', render: () => null },
    ],
    [],
  );

  return (
    <WizardReprenable<WizardData>
      storageKey={`agent-onboarding-${agentProfileId}`}
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
              onVerifie={() => {
                api.setData({ ...api.data, phone: { ...api.data.phone, code: '', verified: true } });
                api.allerA(1);
              }}
            />
          ) : (
            <ProspectDeLAgent
              agentProfileId={agentProfileId}
              agence={agence}
              prenom={user?.first_name || null}
              telephone={api.data.phone.number || user?.phone || null}
              zones={{ specialisation: api.data.specialization.value, zones: api.data.specialization.zones }}
              onZones={(zones) =>
                api.setData({
                  ...api.data,
                  specialization: { value: zones.specialisation, zones: [...zones.zones], saved: true },
                })
              }
              pieces={pieces}
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
