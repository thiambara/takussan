import { Component, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { cleMiseEnService } from '@/lib/queries/mise-en-service';
import { BandeauMiseEnService } from '../BandeauMiseEnService';

/**
 * TCK-2622 — AC1 : la mise en service de l'agence sur l'accueil tient en UNE ligne, nomme l'étape
 * suivante (« Activez la double authentification ») et MÈNE à son réglage, avec le compte « 6/7 ».
 */
const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const CLES = ['kyc_verified', 'logo', 'commission_rate', 'payment_integration', 'first_member', 'first_published_property', 'admin_two_factor'] as const;

function etapes(faites: readonly string[]) {
  return { data: { complete: false, steps: CLES.map((key) => ({ key, done: faites.includes(key) })) } };
}

let client: QueryClient;

/** Un rendu qui PLANTE n'est pas un rendu vide : la frontière d'erreur le rend visible au test. */
class Garde extends Component<{ readonly children: ReactNode }, { readonly plante: boolean }> {
  state = { plante: false };
  static getDerivedStateFromError() {
    return { plante: true };
  }
  render() {
    return this.state.plante ? <p>planté</p> : this.props.children;
  }
}

function monter(large = false) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Garde>{withIntl(<BandeauMiseEnService agencyId={7} kind="standard" large={large} />)}</Garde>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequest.mockReset();
});

describe('BandeauMiseEnService', () => {
  it('AC1 — il reste la 2FA : une ligne « 6/7 · Activez la double authentification » qui mène à la sécurité du profil', async () => {
    apiRequest.mockResolvedValue(etapes(CLES.filter((k) => k !== 'admin_two_factor')));
    monter();

    const lien = await screen.findByRole('link');
    expect(lien).toHaveAttribute('href', '/app/profile/security');
    expect(lien).toHaveTextContent('6/7');
    expect(lien).toHaveTextContent('Activez la double authentification');
    // Une ligne, pas une carte : ni liste d'étapes ni barre de progression.
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('plusieurs étapes restent : la 2FA est nommée d’abord (elle conditionne les autres, TCK-761)', async () => {
    apiRequest.mockResolvedValue(etapes(['logo']));
    monter();

    const lien = await screen.findByRole('link');
    expect(lien).toHaveAttribute('href', '/app/profile/security');
    expect(lien).toHaveTextContent('1/7');
  });

  it('au bureau : « Mise en service de l’agence · 6 étapes sur 7 », la phrase et « Continuer »', async () => {
    apiRequest.mockResolvedValue(etapes(CLES.filter((k) => k !== 'admin_two_factor')));
    monter(true);

    const lien = await screen.findByRole('link');
    expect(lien).toHaveTextContent('Mise en service de l’agence · 6 étapes sur 7');
    expect(lien).toHaveTextContent('Il reste une étape : activez la double authentification de l’administrateur.');
    expect(lien).toHaveTextContent('Continuer');
  });

  it('l’agence est prête : rien', async () => {
    apiRequest.mockResolvedValue({ data: { complete: true, steps: CLES.map((key) => ({ key, done: true })) } });
    const { container } = monter();
    // La réponse LUE (et non le seul appel parti) : sans elle, un rendu vide ne prouverait rien.
    await waitFor(() => expect(client.getQueryState(cleMiseEnService(7))?.status).toBe('success'));
    expect(container).toBeEmptyDOMElement();
  });

  it('seule reste une étape que l’interface ne sait pas mener : rien (pas de lien sans destination)', async () => {
    apiRequest.mockResolvedValue({ data: { complete: false, steps: [...CLES.map((key) => ({ key, done: true })), { key: 'etape_future', done: false }] } });
    const { container } = monter();
    // La réponse LUE (et non le seul appel parti) : sans elle, un rendu vide ne prouverait rien.
    await waitFor(() => expect(client.getQueryState(cleMiseEnService(7))?.status).toBe('success'));
    expect(container).toBeEmptyDOMElement();
  });
});
