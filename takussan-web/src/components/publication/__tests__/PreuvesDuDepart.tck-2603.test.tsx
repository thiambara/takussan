/**
 * TCK-2603 — la carte de preuves du départ de `/publish` : le chiffre vrai de l'API, groupé par `useFormatteurs()`, et
 * RIEN quand il n'y a pas de chiffre (sous le seuil, en échec, en attente).
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

  it('sous le seuil (`null`), la carte n’est pas rendue — ni zéro, ni libellé', async () => {
    apiRequest.mockResolvedValue({ data: { city: 'Dakar', searches_7d: null } });
    monter();

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(carte()).toBeNull();
    expect(screen.queryByText(/cette semaine/)).toBeNull();
  });

  it('AC3 — API injoignable : rien n’est rendu, aucun message, et aucune nouvelle tentative', async () => {
    apiRequest.mockRejectedValue(new TypeError('Failed to fetch'));
    const { client, container } = monter();

    // L'échec est définitif dès le premier appel : avec la nouvelle tentative du client par défaut, la requête resterait
    // « en attente » une seconde de plus.
    await waitFor(() => expect(client.getQueryState(demandeDePublicationQueryKeys.ville(null))?.status).toBe('error'), {
      timeout: 300,
    });
    expect(container.textContent).toBe('');
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('en attente, rien n’est rendu (pas de squelette)', () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    const { container } = monter();

    expect(container.innerHTML).toBe('');
  });
});
