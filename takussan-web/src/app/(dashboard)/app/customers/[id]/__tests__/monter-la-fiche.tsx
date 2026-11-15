/**
 * TCK-2589 — monter la PAGE fiche client entière (composant serveur attendu, puis rendu) : depuis que
 * la tête et ses gestes vivent dans `FicheDuClient` (composant client), parcourir les props de l'arbre
 * serveur ne les atteint plus. Les tests de la page la montent donc, et lisent les props que les
 * composants espionnés ont reçues.
 */
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';

export async function monterLaFiche(Page: (p: { params: Promise<{ id: string }> }) => Promise<ReactElement | null>, id: string) {
  const arbre = await Page({ params: Promise.resolve({ id }) });
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{arbre}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

/** Une réponse vide de l'API pour les lectures du résumé (tâches, biens correspondants, agents). */
export function reponseVide() {
  return new Response(JSON.stringify({ data: [], meta: { total: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
