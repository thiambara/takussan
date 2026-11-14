'use client';

import { useRouter } from 'next/navigation';

import { CreationDuClient, type CreationDuClientProps } from './CreationDuClient';

/**
 * TCK-2590 — `/app/customers/new` (le lien d'un bail, « Créer sa fiche » depuis une visite) ouvre la
 * même création que la liste ; la fermer ramène à la liste des clients.
 */
export function CreationDepuisLaRoute(props: Pick<CreationDuClientProps, 'initial' | 'visiteDOrigine'>) {
  const router = useRouter();
  return <CreationDuClient open onClose={() => router.push('/app/customers')} {...props} />;
}
