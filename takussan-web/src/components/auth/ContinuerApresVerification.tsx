'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { avecRedirection } from '@/lib/redirection-interne';

import { cheminDEntree } from './liens-de-l-entree';
import { intentionDeVerificationMemorisee, oublierIntentionDeVerification } from './memoire-de-l-intention';

/**
 * TCK-2606 — « Continuer » de la page du lien de vérification : vers l'intention d'origine quand ce
 * navigateur l'a mémorisée (`memoriserIntentionDeVerification`, posée par « Vérifiez votre
 * adresse »), sinon vers la porte seule — le comportement d'avant. Sans session, la connexion, qui
 * rouvre ensuite la même intention.
 *
 * Lue par `useSyncExternalStore` : le rendu serveur (et l'hydratation) rend la porte seule, le
 * navigateur relit ensuite le stockage — sans `setState` dans un effet. Oubliée au clic : elle a servi.
 */
function sAbonner(changement: () => void): () => void {
  window.addEventListener('storage', changement);
  return () => window.removeEventListener('storage', changement);
}

function destination(vers: '/onboarding/intention' | '/auth/login'): string {
  const memorisee = intentionDeVerificationMemorisee();
  if (!memorisee) return vers;
  // La connexion relit aussi le geste (la barre du bien) ; la porte de sortie, la page seule.
  return vers === '/auth/login' ? cheminDEntree(vers, memorisee) : avecRedirection(vers, memorisee.redirect);
}

export function ContinuerApresVerification({
  vers,
  className,
  children,
}: {
  /** La porte de sortie (session ouverte), ou la connexion (lien ouvert sans session). */
  readonly vers: '/onboarding/intention' | '/auth/login';
  readonly className: string;
  readonly children: React.ReactNode;
}) {
  const href = useSyncExternalStore(
    sAbonner,
    () => destination(vers),
    () => vers,
  );

  return (
    <Link href={href} className={className} onClick={oublierIntentionDeVerification}>
      {children}
    </Link>
  );
}
