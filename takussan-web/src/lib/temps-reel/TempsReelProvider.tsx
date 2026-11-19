'use client';

/**
 * TCK-2954 (ADR-0129 § 4) — le fournisseur temps réel de la coque de `/app` : UNE connexion par
 * onglet, et seulement là. Aucune page publique, ni `/super-admin`, ni `/auth` ne le monte.
 *
 * **Quand il n'ouvre rien** — et l'écran tourne alors exactement comme avant le temps réel, à ses
 * intervalles de relecture d'aujourd'hui :
 *
 * · sans `TEMPS_REEL_URL` / `TEMPS_REEL_CLE` (`configTempsReel()`) : ni connexion tentée, ni module
 *   de connexion chargé (Echo et Pusher ne sont pas téléchargés), ni appel à `/api/broadcasting/auth` ;
 * · sans session (`useAuth().token`) ;
 * · **pendant une impersonation** — signal du layout (cookie `httpOnly` lu au serveur) OU témoin du
 *   relais (`relaisImpersonationActif()`). L'opérateur ne doit ni paraître présent ni « écrire » chez la
 *   cible, et l'API refuse de toute façon toute autorisation de canal sous impersonation (TCK-2952).
 *   La vérification ne repose PAS sur l'absence de jeton : un jeton resté dans le contexte à l'entrée
 *   d'une impersonation ouvrirait sinon une connexion au nom de l'opérateur.
 *
 * **La session suit `AuthContext`.** La connexion est ouverte avec le jeton courant, fermée quand il
 * change ou disparaît (`logout()`), rouverte sous le suivant (`openSession()`). La connexion fermée
 * emporte ses canaux, ses curseurs et l'état de ses abonnements : la session suivante n'hérite de rien.
 * Le registre des écrans, lui, reste — un écran monté se rebranche sur la nouvelle connexion, avec
 * l'autorisation du nouveau jeton, ou n'est pas rebranché si son canal change (le canal personnel).
 */
import { createContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { configTempsReel } from '@/lib/config-publique';
import { relaisImpersonationActif } from '@/lib/impersonation';
import type { ouvrirConnexion } from './connexion';
import { MoteurTempsReel } from './moteur';

/** Ce que le chargement paresseux du module de connexion doit rendre. */
export type ModuleDeConnexion = { readonly ouvrirConnexion: typeof ouvrirConnexion };

/** Le seul point d'entrée de `laravel-echo` et `pusher-js` : un import dynamique. */
const chargerLaConnexion = (): Promise<ModuleDeConnexion> => import('./connexion');

export type ContexteTempsReel = {
  readonly moteur: MoteurTempsReel;
  /** L'identifiant du compte de la session, qui nomme son canal personnel ; `null` sans session. */
  readonly utilisateurId: number | null;
};

/** `null` hors du fournisseur : les hooks y rendent le comportement d'aujourd'hui, sans rien abonner. */
export const ContexteDuTempsReel = createContext<ContexteTempsReel | null>(null);

interface TempsReelProviderProps {
  readonly children: ReactNode;
  /** Le layout dit, d'après le cookie `httpOnly`, qu'une impersonation est en cours. */
  readonly impersonation?: boolean;
  /** Le chargement du module de connexion. Remplacé par les tests seulement. */
  readonly chargerConnexion?: () => Promise<ModuleDeConnexion>;
}

export function TempsReelProvider({
  children,
  impersonation = false,
  chargerConnexion = chargerLaConnexion,
}: TempsReelProviderProps) {
  const { token, user } = useAuth();
  const utilisateurId = user?.id ?? null;
  const [moteur] = useState(() => new MoteurTempsReel());

  useEffect(() => {
    const config = configTempsReel();
    // ADR-0129 § 4 — coupé sous impersonation, AVANT tout chargement et toute autorisation.
    const coupe = impersonation || relaisImpersonationActif();
    if (!config || !token || utilisateurId === null || coupe) {
      moteur.fermer();
      return;
    }
    let annule = false;
    chargerConnexion().then(
      (module) => {
        if (annule) return;
        moteur.brancher(module.ouvrirConnexion({ url: config.url, cle: config.cle, jeton: token }));
      },
      // Module introuvable (déploiement remplacé, réseau) : mode dégradé, sans rien afficher.
      () => {},
    );
    return () => {
      annule = true;
      moteur.fermer();
    };
  }, [moteur, token, utilisateurId, impersonation, chargerConnexion]);

  return (
    <ContexteDuTempsReel.Provider value={{ moteur, utilisateurId }}>{children}</ContexteDuTempsReel.Provider>
  );
}
