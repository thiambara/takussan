'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/ui/toast';
import type { PaymentHistoryRow } from '@/types/invoice';

import { useLireLesEcheancesARelancer } from './lire-les-echeances';
import { ordreDeLaFile } from './selection';

/**
 * TCK-2775 (décision du porteur du 2026-11-14, n° 16 b) — l'écran Impayés OUVRE LA RELANCE DEPUIS
 * SON ADRESSE. L'accueil et la fiche du bail y mènent au lieu d'embarquer la relance :
 *
 *  - `?tab=impayes&relance=<échéance>` ouvre la relance de cette échéance de bail — la feuille au
 *    téléphone, le dossier en mode relance au bureau (les deux gestes de l'écran) ;
 *    `&bail=<bail>` restreint la lecture à ce bail, pour une échéance au-delà des 100 plus en retard.
 *  - `?tab=impayes&relance=file` démarre la file guidée, dans l'ordre de « Relancer tout » de l'écran.
 *
 * L'adresse n'ÉCRIT rien : elle ouvre ; le lien de paiement et la note ne partent qu'au geste de
 * l'admin (décision 1 de TCK-2660). Lue une fois, la demande quitte l'adresse : un retour arrière ou un
 * rechargement ne la rejoue pas.
 *
 * ⚠ Le retrait passe par `history.replaceState` (que Next 16 synchronise avec `useSearchParams`), et non
 * par `router.replace` : celui-ci s'écrit dans une transition, APRÈS l'ouverture de la file ou de la
 * feuille — dont l'entrée sentinelle (`useFermeAuRetour`) était alors remplacée, et le geste retour ne
 * fermait plus rien (mesuré au navigateur le 2026-11-14, 390 px). Synchrone, le retrait précède la sentinelle. Une échéance absente des impayés (soldée, d'une
 * autre agence, une réservation) n'ouvre rien, et l'écran le dit.
 *
 * Deux moitiés : la PAGE lit et retire le paramètre (`useRelanceDemandeeParLAdresse`) ; le composant Impayés l'exécute (`useOuvrirLaRelanceDemandee`) — il ne lit
 * jamais l'adresse, puisque Rapports le monte aussi (TCK-2629).
 */
export type CibleDeRelance = { readonly genre: 'file' } | { readonly genre: 'echeance'; readonly id: number; readonly bail?: number } | { readonly genre: 'invalide' };

export interface DemandeDeRelance {
  /** Chaque lecture de l'adresse a son jeton : la même demande ne s'exécute qu'une fois. */
  readonly jeton: number;
  readonly cible: CibleDeRelance;
}

const ENTIER = /^[1-9]\d{0,9}$/;

export function cibleDe(relance: string, bail: string | null): CibleDeRelance {
  if (relance === 'file') return { genre: 'file' };
  if (!ENTIER.test(relance)) return { genre: 'invalide' };
  return { genre: 'echeance', id: Number(relance), ...(bail && ENTIER.test(bail) ? { bail: Number(bail) } : {}) };
}

/** La page : lit `relance` (et `bail`), les retire de l'adresse, et garde la demande jusqu'à sa prise. */
export function useRelanceDemandeeParLAdresse() {
  const recherche = useSearchParams();
  const relance = recherche?.get('relance') ?? null;
  const bail = recherche?.get('bail') ?? null;
  const [demande, setDemande] = useState<DemandeDeRelance | null>(null);
  const jetons = useRef(0);
  // La valeur déjà lue : les effets doublés du mode strict ne la lisent pas deux fois.
  const lue = useRef<string | null>(null);

  useEffect(() => {
    if (relance === null) {
      lue.current = null;
      return;
    }
    const cle = `${relance}|${bail ?? ''}`;
    if (lue.current === cle) return;
    lue.current = cle;
    jetons.current += 1;
    setDemande({ jeton: jetons.current, cible: cibleDe(relance, bail) });
    const reste = new URLSearchParams(recherche?.toString() ?? '');
    reste.delete('relance');
    reste.delete('bail');
    const q = reste.toString();
    const adresse = `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`;
    // TCK-2824 — DIFFÉRÉ d'une micro-tâche. Next ne relaie un `replaceState` vers son routeur (adresse
    // canonique, `useSearchParams`) qu'une fois SON correctif d'`history` posé — dans un effet de
    // l'`AppRouter`, qui passe APRÈS les effets de ses enfants. Au chargement direct de l'adresse, un
    // appel synchrone d'ici précédait ce correctif : l'URL changeait, l'adresse canonique de Next
    // non, et le prochain rendu du routeur (`router.refresh()`, rafraîchissement du serveur de dev)
    // réécrivait `relance=` dans la barre (mesuré par CDP, 2 sur 2 sous `router.refresh()`). La
    // micro-tâche passe après tous les effets du même rendu, et toujours AVANT l'entrée sentinelle de
    // la file (`useFermeAuRetour`), posée après la lecture réseau. `null` : Next recopie son état.
    queueMicrotask(() => window.history.replaceState(null, '', adresse));
  }, [relance, bail, recherche]);

  return { demande, prise: () => setDemande(null) };
}

/** Le composant Impayés : exécute une demande, une fois, puis la rend (`onPrise`). */
export function useOuvrirLaRelanceDemandee(
  demande: DemandeDeRelance | null | undefined,
  onPrise: (() => void) | undefined,
  gestes: {
    readonly ouvrir: (row: PaymentHistoryRow) => void;
    readonly demarrerLaFile: (rows: readonly PaymentHistoryRow[]) => void;
  },
) {
  const t = useTranslations('admin.finances.impayes.adresse');
  const toast = useToast();
  const lire = useLireLesEcheancesARelancer();
  const executee = useRef<number | null>(null);
  const monte = useRef(true);
  // Les gestes du rendu courant : la lecture revient après, et ouvre avec l'état de l'écran d'alors.
  const courants = useRef(gestes);
  useEffect(() => {
    courants.current = gestes;
  });
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  useEffect(() => {
    if (!demande || executee.current === demande.jeton) return;
    executee.current = demande.jeton;
    onPrise?.();
    const { cible } = demande;
    if (cible.genre === 'invalide') {
      toast.add({ title: t('introuvable'), type: 'info' });
      return;
    }
    // Non annulée au démontage de l'effet : rendre la demande (`onPrise`) change ses dépendances.
    void (async () => {
      try {
        const { rows, tronquee } = await lire(cible.genre === 'echeance' && cible.bail ? { bail: cible.bail } : {});
        if (!monte.current) return;
        if (cible.genre === 'file') {
          if (rows.length === 0) {
            toast.add({ title: t('rienARelancer'), type: 'info' });
            return;
          }
          courants.current.demarrerLaFile(ordreDeLaFile(rows));
          if (tronquee) toast.add({ title: t('plafondAtteint.titre'), description: t('plafondAtteint.detail'), type: 'info' });
          return;
        }
        const row = rows.find((r) => r.id === cible.id);
        if (row) courants.current.ouvrir(row);
        else toast.add({ title: t('introuvable'), type: 'info' });
      } catch {
        if (monte.current) toast.add({ title: t('lectureEchouee'), type: 'error' });
      }
    })();
  }, [demande, onPrise, lire, t, toast]);
}
