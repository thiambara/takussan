import { garderLesIndicateurs } from '@/lib/rapports/gardes-serveur';

/** TCK-2628 — la garde des indicateurs (celle d'`overview/kpis`), au-dessus de son `loading.tsx` (TCK-426). */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  await garderLesIndicateurs();
  return <>{children}</>;
}
