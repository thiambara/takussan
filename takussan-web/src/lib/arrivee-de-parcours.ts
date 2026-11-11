'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { estPleinEcran } from '@/components/layout/plein-ecran';

/**
 * TCK-2615 — aucune modale de bienvenue à l'arrivée d'un parcours (décision 4 b de l'audit,
 * famille 2).
 *
 * La personne qui vient de finir un assistant ou de publier son annonce arrive sur ce qu'elle a
 * fait ; la fenêtre « Bienvenue » qui lui réexpliquait l'espace qu'elle venait de traverser ne s'y
 * pose plus. Trois cas suspendent les fenêtres de la coque :
 *
 * 1. **un écran plein** (`estPleinEcran`, la création d'un bien) — tant qu'on y est ;
 * 2. **l'arrivée qui suit un assistant** (bailleur, agent, prestataire, administrateur, hôte) ;
 * 3. **l'arrivée qui suit une publication**.
 *
 * Pour 2 et 3, le parcours appelle {@link marquerArriveeDeParcours} juste avant de partir vers
 * `/app`. La suspension vaut pour TOUTE la visite qui commence (le montage de la coque, toutes ses
 * fenêtres ensemble), puis s'éteint : l'arrivée ordinaire suivante montre la fenêtre, comme avant.
 *
 * ⚠ **Une fenêtre suspendue n'est PAS marquée vue** : rien n'écrit `welcome-seen` ici. Elle reste
 * due à la prochaine arrivée ordinaire (contrainte du ticket : pas de régression tant que la
 * famille 3 n'a pas livré les bulles en place).
 *
 * Pourquoi un marqueur en `sessionStorage` et pas un paramètre d'URL : un `?arrivee=` survit à un
 * rechargement, à un lien copié, à un retour arrière, et se lit dans la barre d'adresse. Le
 * marqueur est daté : un assistant fini puis abandonné (jamais suivi de `/app`) ne suspend pas la
 * fenêtre d'une visite ordinaire du lendemain.
 */

const CLE = 'takussan:arrivee-de-parcours';
/** Au-delà, le marqueur ne décrit plus l'arrivée en cours (assistant fini, onglet laissé ouvert). */
const FRAICHEUR_MS = 2 * 60_000;

export type OrigineDArrivee = 'assistant' | 'publication';

/** La visite en cours de la coque : combien de fenêtres la tiennent, et si elle est suspendue. */
let montages = 0;
let lu = false;
let suspendue = false;
let finDeVisite: ReturnType<typeof setTimeout> | null = null;
const abonnes = new Set<() => void>();
const notifier = () => abonnes.forEach((f) => f());

function consommerLeMarqueur(): boolean {
  try {
    const brut = sessionStorage.getItem(CLE);
    if (brut === null) return false;
    sessionStorage.removeItem(CLE);
    const { a } = JSON.parse(brut) as { a?: unknown };
    return typeof a === 'number' && Date.now() - a <= FRAICHEUR_MS;
  } catch {
    return false;
  }
}

/** Le parcours se termine et part vers `/app` : l'arrivée qui suit n'ouvre aucune fenêtre de bienvenue. */
export function marquerArriveeDeParcours(origine: OrigineDArrivee): void {
  if (montages > 0) {
    // La coque est déjà là (la publication part de `/app/properties/new` vers la fiche, sans
    // quitter la coque) : la visite en cours est suspendue tout de suite.
    lu = true;
    suspendue = true;
    notifier();
    return;
  }
  try {
    sessionStorage.setItem(CLE, JSON.stringify({ origine, a: Date.now() }));
  } catch {
    // Stockage refusé (navigation privée stricte) : la fenêtre s'ouvrira, comme avant. Rien ne casse.
  }
}

function sAbonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/**
 * Lu par la première fenêtre de la visite, partagé par toutes les autres — y compris celle qui se
 * monte plus tard (le locataire attend le client, TCK-1477). Idempotent : la seule écriture est le
 * premier passage.
 */
function etatDeLaVisite(): boolean {
  if (!lu) {
    lu = true;
    suspendue = consommerLeMarqueur();
  }
  return suspendue;
}

/** Vrai quand les fenêtres de bienvenue de la coque doivent rester fermées (TCK-2615). */
export function useAccueilSuspendu(): boolean {
  const route = usePathname();
  const visiteSuspendue = useSyncExternalStore(sAbonner, etatDeLaVisite, () => false);

  useEffect(() => {
    // Un remontage immédiat (StrictMode, ou une fenêtre qui en remplace une autre) prolonge la
    // visite : la fin n'est actée qu'au tour suivant, quand plus aucune fenêtre n'est montée.
    if (finDeVisite !== null) {
      clearTimeout(finDeVisite);
      finDeVisite = null;
    }
    montages += 1;
    return () => {
      montages -= 1;
      if (montages === 0) {
        finDeVisite = setTimeout(() => {
          finDeVisite = null;
          lu = false;
          suspendue = false;
          notifier();
        }, 0);
      }
    };
  }, []);

  return estPleinEcran(route) || visiteSuspendue;
}
