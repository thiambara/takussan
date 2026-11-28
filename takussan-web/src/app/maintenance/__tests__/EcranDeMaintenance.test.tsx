import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import { EcranDeMaintenance } from '../EcranDeMaintenance';

/**
 * TCK-3009 — l'écran de maintenance lit `/api/maintenance/status` par `appelBff`. Avant, il lisait le corps
 * sans regarder le statut : le 502 `{ code }` du relais (l'API ne répond pas, ce qui est précisément le cas
 * d'une maintenance) devenait la DONNÉE de la requête, et `data.data.window` levait au rendu.
 */
function monter(reponse: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><EcranDeMaintenance /></QueryClientProvider>));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<EcranDeMaintenance>', () => {
  it('le relais en échec (502) : l’écran reste debout, avec le message par défaut', async () => {
    monter(new Response(JSON.stringify({ code: 'upstream_unavailable' }), { status: 502 }));
    expect(await screen.findByText('Takussan est temporairement en maintenance.')).toBeInTheDocument();
    // Laisser la lecture aboutir : c'est à son arrivée que l'ancien code levait.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText('Service temporairement indisponible')).toBeInTheDocument();
  });

  it('une fenêtre annoncée : son message dans la langue de la page', async () => {
    monter(
      new Response(
        JSON.stringify({
          data: {
            active: true,
            window: { id: 1, ends_at: '2026-05-07T11:00:00.000Z', messages: { fr: 'Retour à midi' } },
          },
        }),
        { status: 200 },
      ),
    );
    expect(await screen.findByText('Retour à midi')).toBeInTheDocument();
  });
});
