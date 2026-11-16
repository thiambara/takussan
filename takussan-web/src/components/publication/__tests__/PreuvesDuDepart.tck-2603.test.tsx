/**
 * TCK-2603 — la carte de preuves du départ de `/publish` : le chiffre vrai de l'API, groupé par `useFormatteurs()`.
 * TCK-2934 — la carte n'est jamais absente : « 0 F de commission » toujours, le chiffre des recherches à côté quand
 * l'API en rend un ; sous le seuil, en échec, en attente : la commission seule.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, type Matcher } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PreuvesDuDepart } from '@/components/publication/PreuvesDuDepart';
import { createQueryClient } from '@/lib/query-client';
import { demandeDePublicationQueryKeys } from '@/lib/queries/demande-de-publication';
import { withIntl } from '@/test/intl';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest,
}));

function monter(ui = <PreuvesDuDepart />, locale: 'fr' | 'en' = 'fr') {
  const client = createQueryClient();
  return { client, ...render(<QueryClientProvider client={client}>{withIntl(ui, locale)}</QueryClientProvider>) };
}

const carte = () => document.querySelector('[data-preuves-du-depart]');

/** Le texte EXACT, espaces comprises : le normaliseur par défaut ramène U+00A0 et U+202F à une espace ordinaire. */
const exact = { normalizer: (texte: string) => texte };
const chiffre = (texte: Matcher) => screen.findByText(texte, exact);

// Un bloc, pas une expression : un `beforeEach` qui RENVOIE une fonction la fait appeler comme nettoyage — ici le
// double de l'API lui-même.
beforeEach(() => {
  apiRequest.mockReset();
});

describe('PreuvesDuDepart', () => {
  it('affiche le total que rend l’API, groupé par une insécable U+00A0, et la ville qu’elle nomme', async () => {
    apiRequest.mockResolvedValue({ data: { city: 'Dakar', searches_7d: 1240 } });
    monter();

    const nombre = await chiffre('1\u00a0240');
    expect(nombre.closest('p')?.textContent).toBe('1\u00a0240recherches à Dakar cette semaine');
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][0]).toBe('/api/public/publish/demand');
  });

  it('demande la ville du bien quand le départ la connaît', async () => {
    apiRequest.mockResolvedValue({ data: { city: 'Thiès', searches_7d: 300 } });
    monter(<PreuvesDuDepart ville="Thiès" />);

    await chiffre('300');
    expect(apiRequest.mock.calls[0][0]).toBe('/api/public/publish/demand?city=Thi%C3%A8s');
    expect(screen.getByText(/recherches à Thiès cette semaine/)).toBeTruthy();
  });

  it('se traduit', async () => {
    apiRequest.mockResolvedValue({ data: { city: 'Dakar', searches_7d: 1240 } });
    monter(<PreuvesDuDepart />, 'en');

    expect(await screen.findByText('searches in Dakar this week', { exact: false })).toBeTruthy();
    expect(screen.getByText('1,240')).toBeTruthy();
  });

  it('AC1 — au-dessus du seuil, les DEUX preuves, en deux colonnes : les recherches puis la commission', async () => {
    apiRequest.mockResolvedValue({ data: { city: 'Dakar', searches_7d: 1240 } });
    monter();

    await chiffre('1\u00a0240');
    const preuves = [...carte()!.querySelectorAll('[data-preuve]')].map((p) => p.getAttribute('data-preuve'));
    expect(preuves).toEqual(['recherches', 'commission']);
    expect(carte()).toHaveClass('grid', 'grid-cols-[1.25fr_1fr]', 'divide-x');
    expect(carte()!.querySelector('[data-preuve="commission"]')!.textContent).toBe('0\u00a0Fde commission');
  });

  it('AC1 — sous le seuil (`null`), la carte reste : « 0 F de commission » seul, ni zéro ni libellé de recherches', async () => {
    apiRequest.mockResolvedValue({ data: { city: 'Dakar', searches_7d: null } });
    monter();

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(carte()).not.toBeNull();
    expect(carte()!.textContent).toBe('0\u00a0Fde commission');
    expect(carte()).not.toHaveClass('grid');
    expect(screen.queryByText(/cette semaine/)).toBeNull();
  });

  it('AC1 — API injoignable : la commission seule, aucun message, et aucune nouvelle tentative', async () => {
    apiRequest.mockRejectedValue(new TypeError('Failed to fetch'));
    const { client } = monter();

    // L'échec est définitif dès le premier appel : avec la nouvelle tentative du client par défaut, la requête resterait
    // « en attente » une seconde de plus.
    await waitFor(() => expect(client.getQueryState(demandeDePublicationQueryKeys.ville(null))?.status).toBe('error'), {
      timeout: 300,
    });
    expect(carte()!.textContent).toBe('0\u00a0Fde commission');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('en attente, la commission seule (pas de squelette)', () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    monter();

    expect(carte()!.textContent).toBe('0\u00a0Fde commission');
  });

  it('la preuve de la commission se traduit', async () => {
    apiRequest.mockResolvedValue({ data: { city: 'Dakar', searches_7d: null } });
    monter(<PreuvesDuDepart />, 'en');

    expect(await screen.findByText('commission', { exact: false })).toBeTruthy();
    expect(carte()!.textContent).toBe('0\u00a0Fcommission');
  });
});
