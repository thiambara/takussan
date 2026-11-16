'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';

import { constructeurDeReconnaissance, erreurDeDictee, langueDeDictee, type ErreurDeDictee, type Reconnaissance } from '@/lib/dictee';

const rien = () => () => undefined;

/**
 * TCK-2880 (et TCK-2903) — la dictée d'une note par la reconnaissance vocale du navigateur
 * (`lib/dictee.ts`). `disponible` est faux au rendu serveur et sans l'API : le bouton n'est alors pas
 * rendu. Toucher démarre (`ecoute`), retoucher arrête ; chaque phrase reconnue est remise à
 * `onTexte`, que l'appelant AJOUTE à sa note (`ajouterALaNote`). Une erreur est rendue sans toucher
 * au texte. `secondes` cumule la durée dictée (« 0:14 dictées »). La reconnaissance s'arrête au
 * démontage.
 */
export function useDictee(onTexte: (texte: string) => void) {
  const locale = useLocale();
  const disponible = useSyncExternalStore(rien, () => constructeurDeReconnaissance() !== null, () => false);
  const [ecoute, setEcoute] = useState(false);
  const [erreur, setErreur] = useState<ErreurDeDictee | null>(null);
  const [secondes, setSecondes] = useState(0);
  const reconnaissance = useRef<Reconnaissance | null>(null);
  const rappel = useRef(onTexte);
  useEffect(() => {
    rappel.current = onTexte;
  }, [onTexte]);

  useEffect(() => {
    if (!ecoute) return;
    const minuterie = window.setInterval(() => setSecondes((s) => s + 1), 1000);
    return () => window.clearInterval(minuterie);
  }, [ecoute]);

  useEffect(() => () => reconnaissance.current?.abort(), []);

  const arreter = useCallback(() => {
    reconnaissance.current?.stop();
  }, []);

  const demarrer = useCallback(() => {
    const Constructeur = constructeurDeReconnaissance();
    if (!Constructeur) return;
    const r = new Constructeur();
    r.lang = langueDeDictee(locale);
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const resultat = e.results[i];
        if (resultat?.isFinal && resultat[0]?.transcript) rappel.current(resultat[0].transcript);
      }
    };
    r.onerror = (e) => {
      const code = erreurDeDictee(e.error);
      if (code) setErreur(code);
    };
    r.onend = () => {
      if (reconnaissance.current === r) reconnaissance.current = null;
      setEcoute(false);
    };
    reconnaissance.current?.abort();
    reconnaissance.current = r;
    setErreur(null);
    try {
      r.start();
      setEcoute(true);
    } catch {
      reconnaissance.current = null;
      setErreur('autre');
    }
  }, [locale]);

  const basculer = useCallback(() => {
    if (ecoute) arreter();
    else demarrer();
  }, [ecoute, arreter, demarrer]);

  return { disponible, ecoute, erreur, secondes, basculer, arreter };
}
