import { garderLaVueDEnsemble } from '@/lib/rapports/gardes-serveur';

/**
 * TCK-2628 — la garde de la vue d'ensemble, au-dessus de son `loading.tsx` (TCK-426) : celles des vues
 * qu'elle remplace, par persona (`garderLaVueDEnsemble`). Le groupe `(ensemble)` la tient à l'écart des
 * autres onglets, qui ont chacun la leur.
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  await garderLaVueDEnsemble();
  return <>{children}</>;
}
