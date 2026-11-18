/**
 * TCK-2955 (ADR-0129 § 2) — « en train d'écrire » dans un fil ouvert, par messages éphémères (*whispers*)
 * sur le canal de présence du sujet, de navigateur à navigateur.
 *
 * · **Rien ne passe par l'API** : ni route, ni stockage, ni journal. Le serveur Reverb relaie aux seuls
 *   membres du canal (`accept_client_events_from = members`), et pose lui-même l'identifiant de l'auteur.
 * · **Au plus une émission toutes les {@link INTERVALLE_D_EMISSION_MS}** pendant la frappe, jamais à chaque
 *   touche ; l'indicateur s'efface seul {@link DELAI_D_EFFACEMENT_MS} après le dernier signe reçu (plus long
 *   que l'intervalle d'émission : une frappe continue ne le fait pas clignoter).
 * · **Sans connexion tenue, rien ne part** : sans clé, sous impersonation (le fournisseur n'ouvre aucune
 *   connexion), connexion perdue, ou canal de présence non rejoint (`usePresenceDuSujet`).
 *
 * Un message éphémère n'est jamais une donnée affichée : seul son AUTEUR compte, et l'écran le nomme d'après
 * les participants qu'il a déjà lus (un identifiant inconnu d'eux est ignoré par l'écran).
 */
import { useContext, useEffect, useRef, useState } from 'react';
import { ContexteDuTempsReel } from './TempsReelProvider';
import { canalDuSujet } from './signal';

/** Au plus une émission « écrit » par intervalle, pendant la frappe. */
export const INTERVALLE_D_EMISSION_MS = 3_000;
/** L'indicateur s'efface ce délai après le dernier signe d'écriture reçu de la personne. */
export const DELAI_D_EFFACEMENT_MS = 6_000;

export type EcritureDuSujet = {
  /** Les identifiants des comptes qui écrivent (soi exclu), triés. */
  readonly auteurs: readonly number[];
  /** À appeler à chaque frappe : n'émet qu'au plus une fois par {@link INTERVALLE_D_EMISSION_MS}. */
  readonly signalerFrappe: () => void;
};

const AUCUN: readonly number[] = Object.freeze([]);

export function useEcritureDuSujet(sujet: string | null | undefined): EcritureDuSujet {
  const contexte = useContext(ContexteDuTempsReel);
  const moteur = contexte?.moteur ?? null;
  const moi = contexte?.utilisateurId ?? null;
  const canal = sujet ? canalDuSujet(sujet) : null;
  const [ecrivent, setEcrivent] = useState<{ canal: string | null; ids: readonly number[] }>({ canal: null, ids: AUCUN });
  const derniereEmission = useRef<{ canal: string | null; instant: number }>({ canal: null, instant: 0 });

  useEffect(() => {
    if (!moteur || !canal) return;
    const echeances = new Map<number, number>();
    let minuterie: ReturnType<typeof setTimeout> | null = null;

    const publier = () => setEcrivent({ canal, ids: [...echeances.keys()].sort((a, b) => a - b) });
    const planifier = () => {
      if (minuterie !== null) clearTimeout(minuterie);
      minuterie = null;
      if (echeances.size === 0) return;
      const prochaine = Math.min(...echeances.values());
      minuterie = setTimeout(purger, Math.max(0, prochaine - Date.now()));
    };
    function purger() {
      const maintenant = Date.now();
      for (const [id, echeance] of echeances) if (echeance <= maintenant) echeances.delete(id);
      publier();
      planifier();
    }

    const cesser = moteur.ecouterEcriture(canal, (id) => {
      if (id === moi) return;
      echeances.set(id, Date.now() + DELAI_D_EFFACEMENT_MS);
      publier();
      planifier();
    });
    return () => {
      cesser();
      if (minuterie !== null) clearTimeout(minuterie);
    };
  }, [moteur, canal, moi]);

  const signalerFrappe = () => {
    if (!moteur || !canal) return;
    const maintenant = Date.now();
    const derniere = derniereEmission.current;
    if (derniere.canal === canal && maintenant - derniere.instant < INTERVALLE_D_EMISSION_MS) return;
    if (moteur.signalerEcriture(canal)) derniereEmission.current = { canal, instant: maintenant };
  };

  return { auteurs: ecrivent.canal === canal && canal !== null ? ecrivent.ids : AUCUN, signalerFrappe };
}
