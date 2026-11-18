import type { Message } from '@/types/message';
import { natureDuMessage, SEUIL_DE_REPLI } from '../cartes/replierLesEvenements';

/**
 * TCK-2963 (maquette `fil-salle-bail` A, « La chronologie — repliée par mois, ouverte sur le mois courant ») —
 * l'ordre d'affichage d'une SALLE. Trois ans de bail ne se déroulent pas jour par jour :
 *
 * · un mois PASSÉ a un seul séparateur (« Septembre ») et chacune de ses suites d'`event` sans geste attendu
 *   se replie en une ligne fermée (« 3 événements · … »), même un événement seul ;
 * · le mois COURANT garde les séparateurs de jour (« Aujourd'hui ») ; ses suites d'au moins
 *   {@link SEUIL_DE_REPLI} événements se replient comme dans tout fil (TCK-2962), mais OUVERTES.
 *
 * Une carte, un message, un avis système ou un séparateur coupent une suite : l'ordre chronologique n'est
 * jamais changé. Un élément d'un mois passé porte `passe` : son heure se lit avec son jour.
 *
 * Fonction pure ; `maintenant` est passé pour que les tests figent l'horloge.
 */
export type ElementDeLaSalle =
  | { readonly kind: 'separator'; readonly key: string; readonly date: Date }
  | { readonly kind: 'mois'; readonly key: string; readonly date: Date }
  | { readonly kind: 'message'; readonly message: Message; readonly passe?: boolean }
  | {
      readonly kind: 'evenements';
      readonly key: string;
      readonly messages: readonly Message[];
      readonly ouvert?: boolean;
      readonly passe?: boolean;
    };

const cleDuMois = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
const cleDuJour = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function chronologieDeLaSalle(messages: readonly Message[], maintenant: Date): ElementDeLaSalle[] {
  const tries = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const moisCourant = cleDuMois(maintenant);
  // Un message daté APRÈS le mois courant (horloge du poste en retard) se lit comme le mois courant.
  const debutDuMoisCourant = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1).getTime();

  const sortie: ElementDeLaSalle[] = [];
  let suite: Message[] = [];
  let suitePassee = false;
  let dernierMois: string | null = null;
  let dernierJour: string | null = null;

  const clore = () => {
    if (suite.length === 0) return;
    if (suitePassee || suite.length >= SEUIL_DE_REPLI) {
      sortie.push({ kind: 'evenements', key: `evenements-${suite[0]!.id}`, messages: suite, ouvert: !suitePassee, passe: suitePassee });
    } else {
      for (const message of suite) sortie.push({ kind: 'message', message });
    }
    suite = [];
  };

  for (const message of tries) {
    const date = new Date(message.created_at);
    const passe = date.getTime() < debutDuMoisCourant && cleDuMois(date) !== moisCourant;

    if (passe) {
      const mois = cleDuMois(date);
      if (mois !== dernierMois) {
        clore();
        sortie.push({ kind: 'mois', key: `mois-${mois}`, date });
        dernierMois = mois;
      }
    } else {
      const jour = cleDuJour(date);
      if (jour !== dernierJour) {
        clore();
        sortie.push({ kind: 'separator', key: `sep-${jour}`, date });
        dernierJour = jour;
        dernierMois = moisCourant;
      }
    }

    if (natureDuMessage(message) === 'evenement') {
      if (suite.length > 0 && suitePassee !== passe) clore();
      suitePassee = passe;
      suite.push(message);
      continue;
    }
    clore();
    sortie.push(passe ? { kind: 'message', message, passe: true } : { kind: 'message', message });
  }
  clore();

  return sortie;
}
