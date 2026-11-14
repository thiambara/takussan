'use client';

import { useSyncExternalStore } from 'react';

import { RouteSkeleton } from '@/components/console/RouteSkeleton';
import { REQUETE_DE_LA_BARRE } from '@/components/layout/plein-ecran';
import { useCanAll } from '@/hooks/useCan';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';

import { VueAdmin } from './VueAdmin';
import { VueAgent } from './VueAgent';

/** Les capacités qui ouvrent tout le grand livre : celles de `CommissionEntry::readsWholeLedger`. */
const LIT_TOUT_LE_GRAND_LIVRE = ['reports.view_agency', 'payouts.approve'] as const;

const sAbonnerARien = () => () => {};
const auNavigateur = () => true;
const auServeur = () => false;

/**
 * TCK-2662 — `/app/commissions` : une route, deux lectures (maquette `app-commissions`, approche A,
 * « Le solde d'abord »). Qui lit tout le grand livre (l'API en décide par les mêmes capacités) voit
 * ce que l'agence doit à chacun et le solde ; les autres membres du personnel, « Mes commissions ».
 *
 * Tant que les capacités se lisent, ni l'une ni l'autre : le titre ne passe pas de « Mes
 * commissions » à « Commissions » (la coque de `/app` les amorce d'ordinaire, TCK-1278).
 *
 * ⚠ **Le squelette aussi pendant l'hydratation, quoi que dise le cache.** Le serveur rend sans les
 * capacités (squelette) ; au navigateur, la coque les a souvent déjà amorcées, et le premier rendu
 * client montrait la vue de l'agent — React rejetait le HTML serveur (mesuré : agent, 3 chargements
 * sur 24). L'instantané serveur de `useSyncExternalStore` vaut pour l'hydratation seule : une
 * navigation douce, qui n'hydrate rien, rend la vue dès le premier rendu.
 *
 * Le téléphone est l'écran de la barre d'onglets (`REQUETE_DE_LA_BARRE`, sous `md`).
 */
export function Commissions() {
  const telephone = useMatchesMedia(REQUETE_DE_LA_BARRE);
  const { can: litTout, isLoading } = useCanAll(LIT_TOUT_LE_GRAND_LIVRE, { mode: 'any' });
  const hydrate = useSyncExternalStore(sAbonnerARien, auNavigateur, auServeur);
  if (!hydrate || isLoading) return <RouteSkeleton variant="list" />;
  return litTout ? <VueAdmin telephone={telephone} /> : <VueAgent telephone={telephone} />;
}
