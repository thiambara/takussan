import { Suspense } from 'react';

import { intentionDeLaRequete, type RechercheDeLaPage } from '@/components/auth/intention-de-la-requete';

import { FormulaireDeConnexion } from './FormulaireDeConnexion';

/**
 * `/auth/login` — une seule porte, par le numéro (TCK-2604).
 *
 * La page est SERVEUR pour une raison : elle lit ce que le visiteur était en train de faire
 * (`?intention=`, liste fermée) et le bien qu'il quittait (le slug de `?redirect=`), puis le bien
 * lui-même par la lecture PARTAGÉE de la fiche (`bienQuitte` → `getProperty`, en cache) — la photo et
 * le prix sont donc là dès le premier rendu, sans appel du navigateur ni saut de mise en page. Le
 * formulaire, lui, reste client (`FormulaireDeConnexion`).
 *
 * Sans intention reconnue, ou sans bien public lisible : la forme directe, la marque seule. La lecture
 * est partagée avec l'oubli et la vérification de l'adresse (`intentionDeLaRequete`, TCK-2606).
 */
export default async function LoginPage({ searchParams }: { readonly searchParams: RechercheDeLaPage }) {
  const intention = await intentionDeLaRequete(await searchParams);
  return (
    <Suspense>
      <FormulaireDeConnexion intention={intention} />
    </Suspense>
  );
}
