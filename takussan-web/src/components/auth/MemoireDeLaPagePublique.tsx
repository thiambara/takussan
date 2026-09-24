'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { memoriserPagePublique } from './page-publique-memorisee';

function Memoire() {
  const pathname = usePathname();
  const params = useSearchParams();
  const requete = params.toString();

  useEffect(() => {
    // Le chemin ET la requête : une recherche sans ses filtres n'est plus celle qu'on quittait.
    // Le filtre (site public seulement) est dans `memoriserPagePublique`.
    memoriserPagePublique(requete === '' ? pathname : `${pathname}?${requete}`);
  }, [pathname, requete]);

  return null;
}

/**
 * Retient la dernière page du site public vue dans l'onglet — cf. `page-publique-memorisee.ts`.
 *
 * Monté dans le layout RACINE, pas dans celui du site public : il doit survivre à la navigation
 * qui mène à `/auth/login` pour que l'écran de connexion puisse la relire. Il ne rend rien.
 */
export function MemoireDeLaPagePublique() {
  return (
    <Suspense fallback={null}>
      <Memoire />
    </Suspense>
  );
}
