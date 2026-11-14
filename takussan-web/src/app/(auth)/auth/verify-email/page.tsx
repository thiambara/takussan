import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { VerifierLAdresse } from '@/components/auth/VerifierLAdresse';
import { intentionDeLaRequete, une, type RechercheDeLaPage } from '@/components/auth/intention-de-la-requete';
import { cheminDEntree } from '@/components/auth/liens-de-l-entree';
import { lireActionDEntree } from '@/components/auth/lien-connexion';
import { avecRedirection } from '@/lib/redirection-interne';
import { utilisateurDuRendu } from '@/lib/utilisateur-du-rendu';
import type { User } from '@/types/user';

/**
 * `/auth/verify-email` — « Vérifiez votre adresse » (TCK-2606).
 *
 * SERVEUR : la page lit le compte de la session pour dire l'adresse EN CLAIR (la personne est
 * connectée, c'est la sienne), et pour ne pas montrer l'écran à qui n'a rien à vérifier — une
 * adresse déjà vérifiée, ou un compte sans adresse (ouvert par téléphone), part tout de suite vers
 * sa destination, par la porte unique de sortie (`/onboarding/intention`, TCK-624).
 *
 * Sans session (lien partagé, cookie expiré), la connexion, intention gardée : le renvoi du lien
 * exige le compte.
 */
export default async function VerifyEmailPage({ searchParams }: { readonly searchParams: RechercheDeLaPage }) {
  const params = await searchParams;
  const origine = { redirect: une(params.redirect), action: lireActionDEntree(une(params.intention)) };

  let user: User | null = null;
  try {
    user = await utilisateurDuRendu();
  } catch {
    user = null;
  }

  if (!user) redirect(cheminDEntree('/auth/login', origine, { voie: 'email' }));
  if (!user.email || user.email_verified_at) redirect(avecRedirection('/onboarding/intention', origine.redirect));

  const intention = await intentionDeLaRequete(params);
  return (
    <Suspense>
      <VerifierLAdresse adresse={user.email} intention={intention} />
    </Suspense>
  );
}
