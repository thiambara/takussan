import { describe, it, expect } from 'vitest';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';

/**
 * TCK-685 (P15.02) — les pièces que le bailleur et l'agent envoient ne sont relues par aucune file : ni l'agence ni la
 * console ne les voient, et rien ne bascule leur statut (`OwnerProfileController`, `AgentProfileController` : « no queue
 * reads this dossier »). Décision du porteur : aucun texte ne promet « votre agence va le vérifier » ni un statut « en
 * revue ».
 *
 * TCK-2821 — ce test figeait les textes de l'étape KYC des assistants (`<rôle>.onboarding.steps.kyc`). L'étape a quitté
 * les assistants (TCK-2613) et ses textes le dictionnaire : la règle se garde désormais sur le texte VIVANT, celui de
 * « Vos pièces » (`pieces`, TCK-2614) et des assistants du bailleur et de l'agent, dans les trois langues.
 *
 * `pieces.etats` est écarté : ce sont les libellés de l'état que le serveur RAPPORTE (« Vérifiée », « À refaire »), pas
 * une promesse ; ils ne s'affichent que si le serveur les rend.
 */
const PROMESSES: ReadonlyArray<RegExp> = [
  // fr (et wo, qui porte le français tel quel tant que le wolof est en pause)
  /\b(va|vont|allons|sera|seront)\b[^.]{0,40}\b(vérifi|valid|reli|relu|examin|contrôl)/i,
  /\ben (cours de )?(revue|vérification|validation|relecture|examen)\b/i,
  // en
  /\bwill\b[^.]{0,40}\b(verif|review|check|validat|examin|approv)/i,
  /\b(under|pending|in) review\b/i,
];

type Arbre = { [cle: string]: string | Arbre };

function textes(arbre: Arbre, chemin: string, exclus: ReadonlyArray<string>): Array<[string, string]> {
  return Object.entries(arbre).flatMap(([cle, valeur]) => {
    const ici = `${chemin}.${cle}`;
    if (exclus.includes(ici)) return [];
    return typeof valeur === 'string' ? [[ici, valeur] as [string, string]] : textes(valeur, ici, exclus);
  });
}

const LANGUES = { fr, en, wo } as unknown as Record<'fr' | 'en' | 'wo', Record<string, Arbre>>;

const SOUS_ARBRES: ReadonlyArray<readonly [string, (m: Record<string, Arbre>) => Arbre]> = [
  ['pieces', (m) => m.pieces],
  ['owners.onboarding', (m) => m.owners.onboarding as Arbre],
  ['agents.onboarding', (m) => m.agents.onboarding as Arbre],
];

describe('TCK-685 — aucune promesse de relecture des pièces du bailleur et de l’agent', () => {
  for (const langue of ['fr', 'en', 'wo'] as const) {
    for (const [nom, lire] of SOUS_ARBRES) {
      it(`${langue} · ${nom}`, () => {
        const lus = textes(lire(LANGUES[langue]), nom, ['pieces.etats']);
        // Témoin : un sous-arbre vide ou renommé laisserait la garde verte sans rien lire.
        expect(lus.length).toBeGreaterThan(5);
        const fautes = lus.filter(([, texte]) => PROMESSES.some((motif) => motif.test(texte)));
        expect(fautes).toEqual([]);
      });
    }
  }
});
