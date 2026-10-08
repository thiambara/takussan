'use client';

import { useEffect, useState } from 'react';

import { connexionParTelephoneActive } from '@/lib/connexion-telephone';

/**
 * TCK-589 — `true` quand l'API propose la connexion par téléphone (`phone_login`).
 *
 * `false` tant que la réponse n'est pas là, et sur toute erreur : drapeau éteint, les pages de
 * connexion et d'inscription restent EXACTEMENT celles d'avant (AC2b).
 */
export function useConnexionParTelephone(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let annule = false;
    void connexionParTelephoneActive().then((oui) => {
      if (!annule) setActive(oui);
    });
    return () => {
      annule = true;
    };
  }, []);

  return active;
}
