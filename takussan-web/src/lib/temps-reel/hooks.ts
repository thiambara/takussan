/**
 * TCK-2954 (ADR-0129 § 4) — les primitives que tout écran réutilise. Hors de `TempsReelProvider`
 * (pages publiques, `/super-admin`), elles n'abonnent rien et rendent le comportement d'aujourd'hui.
 *
 * · {@link useSignal} — la primitive : rappelle l'écran à chaque signal d'un sujet
 *   (`conversation:42`) ou du canal personnel de la session, filtré par codes d'événement ;
 * · {@link useSujetEnDirect} — invalide les requêtes React Query nommées à chaque signal d'un sujet ;
 * · {@link useIntervalleDeRelecture} — l'intervalle d'une relecture périodique selon l'état du temps
 *   réel : 60 s de sécurité sous un canal tenu, l'intervalle d'aujourd'hui sinon ;
 * · {@link usePresenceDuSujet} — les identifiants présents sur un sujet (canal de présence), sans
 *   interface : c'est TCK-2955 qui l'affiche.
 *
 * **Un signal n'est jamais une donnée** : un écran ne lit que `subject`, `event` et `cursor`, et
 * relit l'objet par l'API.
 */
import { useContext, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ContexteDuTempsReel } from './TempsReelProvider';
import { ETAT_INACTIF, type EtatDuTempsReel, type RappelDuSignal } from './moteur';
import { canalDeLaCible, canalDuSujet, type CibleDuSignal } from './signal';

export type { CibleDuSignal, SignalTempsReel } from './signal';
export type { RappelDuSignal } from './moteur';

/** ADR-0129 § 4 — sous une connexion tenue, la relecture périodique devient une relecture de sécurité. */
export const RELECTURE_DE_SECURITE_MS = 60_000;

const suivreRien = () => () => {};
const lireInactif = (): EtatDuTempsReel => ETAT_INACTIF;

/**
 * Rappelle `rappel` à chaque signal de `cible` — un sujet, ou `{ personnel: [codes] }` pour le canal
 * personnel de la session —, et avec `null` à la reconnexion (« relisez : un signal a pu se perdre »).
 * `cible` nulle ou mal formée : rien n'est abonné.
 */
export function useSignal(cible: CibleDuSignal | null | undefined, rappel: RappelDuSignal): void {
  const contexte = useContext(ContexteDuTempsReel);
  const moteur = contexte?.moteur ?? null;
  const canal = contexte ? canalDeLaCible(cible, contexte.utilisateurId) : null;
  // Une chaîne, pour que l'effet ne se rejoue pas à chaque tableau neuf écrit en ligne par l'appelant.
  const filtre = cible !== null && typeof cible === 'object' ? cible.personnel.join(' ') : null;
  const surSignal = useEffectEvent(rappel);

  useEffect(() => {
    if (!moteur || !canal) return;
    const evenements = filtre === null ? null : new Set(filtre.split(' ').filter(Boolean));
    return moteur.abonner(canal, (signal) => {
      if (signal !== null && evenements !== null && !evenements.has(signal.event)) return;
      surSignal(signal);
    });
  }, [moteur, canal, filtre]);
}

/**
 * Invalide les requêtes nommées par `cles` à chaque signal du sujet, et à la reconnexion. React Query
 * ne relit que celles qu'un écran affiche ; les autres le seront à leur prochain montage.
 */
export function useSujetEnDirect(sujet: string | null | undefined, cles: readonly QueryKey[]): void {
  const queryClient = useQueryClient();
  useSignal(sujet, () => {
    for (const cle of cles) void queryClient.invalidateQueries({ queryKey: cle });
  });
}

/** L'état du temps réel de l'onglet : `inactif` hors du fournisseur. */
export function useEtatDuTempsReel(): EtatDuTempsReel {
  const moteur = useContext(ContexteDuTempsReel)?.moteur;
  return useSyncExternalStore(moteur?.suivre ?? suivreRien, moteur?.lire ?? lireInactif, lireInactif);
}

/**
 * L'intervalle d'une relecture périodique (`refetchInterval`) selon l'état du temps réel (ADR-0129 § 4) :
 *
 * · **connexion tenue ET canal de `cible` accepté** : {@link RELECTURE_DE_SECURITE_MS} (jamais moins
 *   que l'intervalle d'aujourd'hui) ;
 * · sinon — connexion perdue, jamais établie, canal refusé ou en attente, hors du fournisseur, sans clé,
 *   sous impersonation — **l'intervalle d'aujourd'hui**, tel quel. `false` reste `false`.
 *
 * La cible est celle que l'écran écoute par {@link useSignal} : sans abonnement au canal, son état est
 * inconnu et l'intervalle d'aujourd'hui s'applique.
 */
export function useIntervalleDeRelecture(
  intervalle: number | false,
  cible: CibleDuSignal | null | undefined,
): number | false {
  const contexte = useContext(ContexteDuTempsReel);
  const etat = useEtatDuTempsReel();
  if (intervalle === false || !contexte) return intervalle;
  const canal = canalDeLaCible(cible, contexte.utilisateurId);
  if (canal !== null && etat.connexion === 'tenue' && etat.canaux.get(canal) === 'abonne') {
    return Math.max(intervalle, RELECTURE_DE_SECURITE_MS);
  }
  return intervalle;
}

/** Les identifiants des comptes présents sur le sujet ; `[]` sans connexion. Aucun nom : l'API ne publie que `{id}`. */
export function usePresenceDuSujet(sujet: string | null | undefined): readonly number[] {
  const moteur = useContext(ContexteDuTempsReel)?.moteur ?? null;
  const canal = sujet ? canalDuSujet(sujet) : null;
  const [presents, setPresents] = useState<{ canal: string | null; ids: readonly number[] }>({ canal: null, ids: [] });

  useEffect(() => {
    if (!moteur || !canal) return;
    return moteur.rejoindre(canal, (ids) => setPresents({ canal, ids }));
  }, [moteur, canal]);

  return presents.canal === canal ? presents.ids : [];
}
