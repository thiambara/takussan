'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

/**
 * TCK-509 — referme, en arrivant sur `/auth/*`, la session que le client croit encore ouverte alors
 * que le serveur l'a fermée : l'expiration (`getMeAction` → 401 → `/api/auth/session-expired`, qui
 * efface le cookie puis renvoie vers `/auth/login`), ou tout chemin futur qui contournerait
 * `useAuth().logout`. Sans elle, la page de connexion continue d'interroger l'API avec le jeton
 * mort — mesuré le 2026-09-10 : le sondage de `conversations` en 401 sur `/auth/login` —, et le
 * compte connecté ensuite garde le cache de l'ancien.
 *
 * ⚠ **Un jeton dans le contexte ici ne prouve PAS que la session est périmée — c'est le serveur qui
 * tranche** (`/api/auth/me`, qui lit le cookie). Le proxy renvoie bien vers `/app` toute requête
 * `/auth/*` qui porte le cookie, mais un **retour arrière** ne fait aucune requête : Next restaure
 * la page de son cache client, et le proxy ne la voit jamais. La première version concluait « jeton
 * au montage = session morte » ; mesuré au navigateur le 2026-09-11 (revue de la PR 257) :
 * connexion, `/app`, bouton Retour → deux `POST /api/auth/logout`, l'utilisateur déconnecté.
 *
 * ⚠ Ne juge que la session présente **au montage**, et renonce si le jeton a changé pendant la
 * vérification : la page de connexion ouvre une session pendant que ce composant est monté
 * (`openSession`, puis navigation) — la refermer serait le défaut inverse.
 */
export function ReinitialiserSessionClient() {
  const { token, user, logout } = useAuth();
  // `undefined` : aucune session au montage, rien à juger.
  const [jetonAuMontage] = useState(() => (token !== null || user !== null ? token : undefined));
  const jetonCourant = useRef(token);

  useEffect(() => {
    jetonCourant.current = token;
  }, [token]);

  useEffect(() => {
    if (jetonAuMontage === undefined) return;
    let abandonne = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => {
        // 401 seul : une erreur serveur ne dit rien de la session, et dans le doute on ne ferme rien.
        if (abandonne || res.status !== 401) return;
        if (jetonCourant.current !== jetonAuMontage) return;
        void logout();
      })
      .catch(() => {
        // Réseau indisponible : même règle, on ne ferme rien sur une absence de réponse.
      });
    return () => {
      abandonne = true;
    };
  }, [jetonAuMontage, logout]);

  return null;
}
