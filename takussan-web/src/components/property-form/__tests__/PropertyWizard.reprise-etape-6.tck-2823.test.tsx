import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import fr from '@/messages/fr.json';
import { TIMEZONE } from '@/i18n/config';
import { surErreurIntl } from '@/i18n/erreurs';

/**
 * TCK-2823 — rechargée à l'étape 6, l'annonce rouvre (ADR-0093 : « un onglet fermé pendant le code
 * rouvre l'annonce »).
 *
 * La reprise se décide pendant le rendu (`setIndex(etape)`), mais le brouillon n'entrait au formulaire
 * que par un effet PASSIF de `PropertyWizard` — qui passe APRÈS ceux de ses enfants. L'effet de
 * `StepFinition` lisait donc un formulaire vide : `tType('')` → `MISSING_MESSAGE`, que l'application
 * lève hors production (`surErreurIntl`) — d'où le provider monté ICI avec son `onError` : `withIntl`
 * n'en passe pas, et un `MISSING_MESSAGE` n'y irait qu'à la console (le test serait vert sans le
 * correctif).
 *
 * Harnais de `PropertyWizard.google.tck-2777.test.tsx`, réduit à la reprise.
 */
const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur, useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="carte" />,
}));
vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({ location: null, loading: false }),
}));
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotosSousPlafond: vi.fn(async (fs: readonly File[]) => [...fs]),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/app/actions/publish-property', () => ({ publishPropertyAction: vi.fn() }));
vi.mock('@/app/actions/property-contacts', () => ({ replacePropertyContactsAction: vi.fn() }));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: vi.fn() }));
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  oauthProviders: vi.fn(async () => []),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, setUser: () => {}, refreshUser: async () => undefined, openSession: async () => {} }),
}));

import { AssistantDePublication, type ModeAnonyme } from '../PropertyWizard';

const brouillon = {
  isLoading: false,
  isSaving: false,
  error: null as Error | null,
  draft: null as { id: number; key: string; step: number; data: Record<string, unknown>; updated_at: null } | null,
  save: vi.fn(),
  flush: vi.fn(),
  clear: vi.fn(),
};

/** La frontière d'erreur de l'application, réduite : ce qu'elle attrape s'affiche. */
class Frontiere extends Component<{ readonly children: ReactNode }, { erreur: Error | null }> {
  state = { erreur: null as Error | null };
  static getDerivedStateFromError(erreur: Error) {
    return { erreur };
  }
  render() {
    return this.state.erreur ? <p role="alert">frontière : {String((this.state.erreur as { code?: string }).code ?? this.state.erreur.name)}</p> : this.props.children;
  }
}

function monter(donnees: Record<string, unknown>) {
  brouillon.draft = { id: 0, key: 'local', step: 5, data: donnees, updated_at: null };
  const anonyme: ModeAnonyme = {
    photosInitiales: [],
    surPhotos: () => {},
    surPublier: vi.fn(),
    depart: { titre: 'Publiez votre bien', sousTitre: '', dessous: null },
    finition: null,
    pourPublierEnPlus: { libelle: 'Votre numéro', note: 'à la fin' },
    surEtape: () => {},
    entreeParTelephone: true,
    preparerLEspace: vi.fn(async () => 'pret' as const),
  };
  render(
    <NextIntlClientProvider locale="fr" messages={fr} timeZone={TIMEZONE} now={new Date()} onError={surErreurIntl}>
      <Frontiere>
        <AssistantDePublication brouillon={brouillon as never} anonyme={anonyme} fraisDAgence={false} />
      </Frontiere>
    </NextIntlClientProvider>,
  );
}

const SANS_TITRE = { type: 'villa', contract_type: 'sale', price: 25000000, currency: 'XOF', city: 'Mbour', bedrooms: 3, furnished: false, tag_ids: [] };

beforeEach(() => {
  vi.clearAllMocks();
  brouillon.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.clear.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TCK-2823 — reprise d’un brouillon à l’étape 6', () => {
  it('AC1 — avec un titre : l’annonce rouvre sur son titre, sans frontière d’erreur ni MISSING_MESSAGE', async () => {
    monter({ ...SANS_TITRE, title: 'Ma villa de Saly' });
    await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox', { name: /Titre de l’annonce|Titre de l'annonce/ })).toHaveValue('Ma villa de Saly');
  });

  it('AC2 — sans titre : le titre proposé est composé depuis le brouillon, pas perdu', async () => {
    monter(SANS_TITRE);
    await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox', { name: /Titre de l’annonce|Titre de l'annonce/ })).toHaveValue('Villa 3 chambres à Mbour');
  });

  it('AC3 — aucune sauvegarde n’emporte le formulaire vide de la reprise', async () => {
    monter(SANS_TITRE);
    await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
    for (const [, valeurs] of brouillon.save.mock.calls) {
      expect((valeurs as Record<string, unknown>).type).toBe('villa');
    }
  });
});
