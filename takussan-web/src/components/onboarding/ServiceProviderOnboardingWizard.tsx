'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/ui/toast';
import { marquerArriveeDeParcours } from '@/lib/arrivee-de-parcours';
import { useAuth } from '@/context/AuthContext';
import { WizardReprenable, type WizardStep } from '@/components/wizard/WizardReprenable';
import { spOnboardCompleteAction } from '@/app/actions/service-provider-onboarding';
import { INDICATIF_PAR_DEFAUT, recomposerTelephone, relireTelephoneBrouillon } from '@/lib/phone';
import type { PieceDuProfil } from '@/lib/pieces/pieces';
import type { InterventionDOrigine, ReglagesDuPrestataire } from '@/lib/service-provider-onboarding';

import { AssistantDInvite, etapeDInvite } from './invite/AssistantDInvite';
import { CeQuiVousAttend } from './invite/CeQuiVousAttend';
import { EtapeDuNumero } from './invite/EtapeDuNumero';
import { InterventionDuPrestataire } from './invite/InterventionDuPrestataire';

/**
 * TCK-261, refait par TCK-2613 — l'assistant du prestataire invité, en DEUX écrans (maquette `app-entree-assistants`,
 * approche a) :
 *   1. le numéro (obligatoire ; un numéro déjà vérifié saute l'écran) ;
 *   2. la raison de venir : l'intervention que l'agence a jointe à l'invitation, « Accepter » ou « Proposer un
 *      créneau » (décision du porteur du 2026-11-10, point 11 b), puis « Complétez votre profil pour en recevoir
 *      d'autres » — sans intervention jointe, « Bienvenue chez {agence} » et la même liste.
 *
 * Les métiers, les zones, les tarifs, les disponibilités et l'assurance ne sont plus des écrans : ils se règlent
 * dans le profil (`/app/profile/professional`, TCK-592) et les pièces (`/app/pieces`), et l'écran 2 dit ce qui
 * reste. Aucun n'est exigé pour entrer.
 *
 * `complete()` passe le profil en `active`, ouvre les collaborations et assigne la demande jointe : TOUTE sortie de
 * l'écran 2 l'appelle d'abord. « Accepter » aussi, sans quitter l'écran (`finaliser`) — la demande n'est au
 * prestataire qu'après, et `POST …/accept` rendrait 403 avant.
 */
export type ServiceProviderOnboardingWizardProps = {
  spProfileId: number;
  /** Le nom de l'agence qui invite ; `null` s'il n'est pas connu. */
  agence?: string | null;
  /** `GET /api/me/profiles/{sp}/intervention-d-origine` ; `null` : rien de joint, ou lecture en échec. */
  intervention?: InterventionDOrigine | null;
  /** Le libellé de la catégorie de l'intervention (`maintenance.category.*`), traduit par la page. */
  categorie?: string | null;
  /** `GET /api/me/profiles/{sp}` ; `null` si la lecture a échoué. */
  reglages?: ReglagesDuPrestataire | null;
  /** Les pièces du profil (`GET /api/me/pieces`, `X-Profile-Id`) ; `null` si la lecture a échoué. */
  pieces?: readonly PieceDuProfil[] | null;
};

/** Le brouillon ne garde que le numéro : un brouillon de l'assistant à quatre écrans reprend à l'écran 2. */
type WizardData = {
  phone: { number: string; code: string; verified: boolean };
};

function relireBrouillon(data: WizardData): WizardData {
  return {
    phone: {
      // TCK-1362 — un code d'un brouillon d'avant ne survit pas à la relecture.
      code: '',
      verified: Boolean(data.phone?.verified),
      // TCK-566 — un numéro écrit par l'ancien champ libre repasse par la même normalisation.
      number: relireTelephoneBrouillon(data.phone?.number, INDICATIF_PAR_DEFAUT),
    },
  };
}

export function ServiceProviderOnboardingWizard({
  spProfileId,
  agence = null,
  intervention = null,
  categorie = null,
  reglages = null,
  pieces = null,
}: ServiceProviderOnboardingWizardProps) {
  const t = useTranslations('serviceProviders.onboarding');
  const router = useRouter();
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  // Où aller une fois l'onboarding fini ; `null` : rester sur l'écran (« Accepter »).
  const destination = useRef<string | null>('/app');
  const finalise = useRef(false);
  // ⚠ La fin d'onboarding RE-REND la page : l'action serveur pose le cookie du profil actif, et Next re-rend la
  // route courante (docs `cookies`, « Server Functions »). Le lien est alors consommé et la page relit une
  // intervention `null` — l'écran perdait sa carte, et « Intervention acceptée » avec elle. Il garde donc
  // l'intervention qu'il a montrée en premier.
  const [interventionMontree] = useState(intervention);
  const [categorieMontree] = useState(categorie);

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

  const aller = useCallback(
    (href: string) => {
      // TCK-2615 — l'arrivée qui suit l'assistant n'ouvre aucune fenêtre de bienvenue.
      marquerArriveeDeParcours('assistant');
      router.push(href);
    },
    [router],
  );

  const handleComplete = useCallback(async () => {
    // Le code a été vérifié à l'écran 1 : l'API ne le redemande pas quand `phone_verified_at` est posé.
    const completeRes = await spOnboardCompleteAction(spProfileId, undefined);
    if (!completeRes.ok) {
      toast.add({ title: t('errors.completeTitle'), description: completeRes.message, type: 'error' });
      return;
    }
    finalise.current = true;
    await refreshUser();
    if (destination.current !== null) {
      toast.add({ title: t('success.title'), description: t('success.body'), type: 'success' });
      aller(destination.current);
    }
  }, [aller, refreshUser, spProfileId, t, toast]);

  const steps: WizardStep<WizardData>[] = useMemo(
    () => [
      { id: 'phone', title: 'phone', canAdvance: (d) => d.phone.verified, render: () => null },
      { id: 'intervention', title: 'intervention', render: () => null },
    ],
    [],
  );

  return (
    <WizardReprenable<WizardData>
      storageKey={`sp-onboarding-${spProfileId}`}
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
              panneau={<CeQuiVousAttend qui="prestataire" agence={agence} intervention={interventionMontree?.title ?? null} />}
              onVerifie={() => {
                api.setData({ ...api.data, phone: { ...api.data.phone, code: '', verified: true } });
                api.allerA(1);
              }}
            />
          ) : (
            <InterventionDuPrestataire
              agence={agence}
              telephone={api.data.phone.number || user?.phone || null}
              intervention={interventionMontree}
              categorie={categorieMontree}
              reglages={reglages}
              pieces={pieces}
              enCours={api.enCours}
              finaliser={async () => {
                if (finalise.current) return true;
                destination.current = null;
                await api.suivant();
                return finalise.current;
              }}
              onAller={(href) => {
                // Déjà finalisé (« Accepter ») : la sortie n'a plus rien à écrire.
                if (finalise.current) {
                  aller(href);
                  return;
                }
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
