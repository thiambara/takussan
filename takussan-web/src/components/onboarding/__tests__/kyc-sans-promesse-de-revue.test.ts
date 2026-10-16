import { describe, it, expect } from 'vitest';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';

/**
 * TCK-685 (P15.02) — le dossier KYC que l'agent et le bailleur envoient depuis leur assistant
 * n'est relu par aucune file : ni l'agence ni la console ne le voient, et rien ne bascule son
 * statut. Décision du porteur : retirer la promesse « Votre agence va le vérifier » et le statut
 * « en revue ». Ce test fige les textes de l'étape KYC des deux assistants, dans les trois
 * langues : le badge dit « soumis », la confirmation dit seulement qu'on peut continuer.
 */
const ATTENDU = {
  fr: {
    agents: { submittedBadge: 'Soumis', submittedBody: 'Vous pouvez continuer.' },
    owners: { submittedBadge: 'Soumis', submittedBody: 'Vous pouvez continuer.' },
  },
  en: {
    agents: { submittedBadge: 'Submitted', submittedBody: 'You can continue.' },
    owners: { submittedBadge: 'Submitted', submittedBody: 'You can continue.' },
  },
  wo: {
    agents: { submittedBadge: 'Soumis', submittedBody: 'Mën nga continuer.' },
    owners: { submittedBadge: 'Yónni', submittedBody: 'Mën nga jëkk.' },
  },
} as const;

type Etape = { submittedBadge: string; submittedBody: string };
type Messages = Record<'agents' | 'owners', { onboarding: { steps: { kyc: Etape } } }>;

const MESSAGES: Record<keyof typeof ATTENDU, Messages> = {
  fr: fr as unknown as Messages,
  en: en as unknown as Messages,
  wo: wo as unknown as Messages,
};

describe('étape KYC des assistants agent et bailleur : aucune promesse de relecture', () => {
  for (const langue of ['fr', 'en', 'wo'] as const) {
    for (const role of ['agents', 'owners'] as const) {
      it(`${langue} · ${role}`, () => {
        const kyc = MESSAGES[langue][role].onboarding.steps.kyc;
        expect({
          submittedBadge: kyc.submittedBadge,
          submittedBody: kyc.submittedBody,
        }).toEqual(ATTENDU[langue][role]);
      });
    }
  }
});
