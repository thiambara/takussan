import { Suspense } from 'react';

import { MotDePasseOublie } from '@/components/auth/MotDePasseOublie';
import { intentionDeLaRequete, type RechercheDeLaPage } from '@/components/auth/intention-de-la-requete';

/**
 * `/auth/forgot-password` — « Mot de passe oublié », puis « Lien envoyé » (TCK-2606).
 *
 * SERVEUR pour la même raison que la connexion (TCK-2604) : le bien quitté reste dans la barre, lu
 * par la lecture partagée de la fiche dès le premier rendu. Le formulaire est client.
 */
export default async function ForgotPasswordPage({ searchParams }: { readonly searchParams: RechercheDeLaPage }) {
  const intention = await intentionDeLaRequete(await searchParams);
  return (
    <Suspense>
      <MotDePasseOublie intention={intention} />
    </Suspense>
  );
}
