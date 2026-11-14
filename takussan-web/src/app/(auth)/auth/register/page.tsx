import { redirect } from 'next/navigation';

import { une, type RechercheDeLaPage } from '@/components/auth/intention-de-la-requete';
import { lireActionDEntree } from '@/components/auth/lien-connexion';
import { cheminDEntree } from '@/components/auth/liens-de-l-entree';

/**
 * TCK-2604 — `/auth/register` n'est plus une porte : connexion et inscription montraient le même
 * champ sous deux titres, et le compte naît de toute façon au premier code d'un numéro inconnu. La
 * route redirige vers `/auth/login` (307), en gardant l'intention — `redirect`, assaini par
 * `avecRedirection`, et l'action quand elle est de la liste fermée. Aucun lien entrant ne casse.
 *
 * TCK-2606 — et elle ouvre la voie e-mail sur l'onglet « Créer un compte » (`voie=inscription`) : qui
 * suit un lien « Créer un compte » n'a pas à le chercher derrière le numéro.
 */
export default async function RegisterPage({ searchParams }: { readonly searchParams: RechercheDeLaPage }) {
  const params = await searchParams;
  redirect(
    cheminDEntree('/auth/login', { redirect: une(params.redirect), action: lireActionDEntree(une(params.intention)) }, { voie: 'inscription' }),
  );
}
