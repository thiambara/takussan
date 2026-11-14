import { garderLOnglet } from '@/lib/rapports/gardes-serveur';

/** TCK-2628 — la garde de l'onglet, au-dessus de son `loading.tsx` (TCK-426) : `garderLOnglet`. */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  await garderLOnglet('equipe');
  return <>{children}</>;
}
