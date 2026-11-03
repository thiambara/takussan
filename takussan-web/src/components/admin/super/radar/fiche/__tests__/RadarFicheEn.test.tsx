import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRadarMatches } from '@/lib/queries/radar';
import { EXTRACTED, fiche, rendreFiche, reponseMatches } from './support';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/queries/radar', async (importOriginal) => (await import('./mocks')).mockRadarQueries(await importOriginal<object>()));
vi.mock('@/lib/queries/referentiel-public', async () => (await import('./mocks')).mockReferentiel());

Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.mocked(fetchRadarMatches).mockReset().mockResolvedValue(reponseMatches([]));
});

/** Revue finale : la ponctuation d'un libellé appartient à sa langue (« : » français, « : » collé en anglais). */
const SANS_PASSAGE = fiche({
  extracted: { ...EXTRACTED, title: { value: 'Appartement F3', confidence: 'high', evidence: 'introuvable dans la source', flags: [] } },
});

describe('ponctuation par langue (TCK-2387)', () => {
  it('en anglais, ni « Make advertiser : » ni « Cited passage : » ni « chosen, to be saved : »', async () => {
    const { user } = await rendreFiche(SANS_PASSAGE, 'en');

    expect(screen.getByRole('button', { name: 'Make advertiser: +221771234567' })).toBeInTheDocument();
    expect(screen.getByTestId('champ-title').textContent).toContain('Cited passage: introuvable dans la source');

    await user.click(screen.getByRole('button', { name: /Almadies \(Dakar\)/ }));
    expect(screen.getByTestId('radar-neighborhood-link')).toHaveTextContent('Neighborhood chosen, to be saved: Almadies');
    expect(document.body.textContent).not.toMatch(/Make advertiser :|Cited passage :|saved :/);
  });

  it('en français, l\'espace avant les deux-points reste', async () => {
    const { user } = await rendreFiche(SANS_PASSAGE, 'fr');

    expect(screen.getByRole('button', { name: 'En faire l’annonceur : +221771234567' })).toBeInTheDocument();
    expect(screen.getByTestId('champ-title').textContent).toContain('Passage cité : introuvable dans la source');

    await user.click(screen.getByRole('button', { name: /Almadies \(Dakar\)/ }));
    expect(screen.getByTestId('radar-neighborhood-link')).toHaveTextContent('Quartier choisi, à enregistrer : Almadies');
  });
});
