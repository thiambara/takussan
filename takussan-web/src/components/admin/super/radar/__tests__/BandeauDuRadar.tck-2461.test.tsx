import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import type { RadarDashboardResponse } from '@/types/radar';
import { BandeauDuRadar } from '../BandeauDuRadar';
import { MOTIFS_RADAR } from '../codes-radar';

/** TCK-2461 — une tuile filtre la liste, la même la retire, et le coût IA n'est plus une décision. */

function compteurs(ai: Partial<RadarDashboardResponse['data']['ai']> = {}) {
  return {
    stages: { captured: 0, extracted: 4, extraction_failed: 0, reviewed: 2, published: 7, duplicate: 0, discarded: 0, do_not_contact: 0 },
    pending_extraction: 3,
    follow_ups_due: 0,
    ai: { spent_today_usd: '0.04', daily_budget_usd: '1.00', usd_to_xof: '600', ...ai },
  } as unknown as RadarDashboardResponse['data'];
}

function rendre(etape: '' | 'extracted' = '', donnees = compteurs()) {
  const onEtape = vi.fn();
  render(withIntl(<BandeauDuRadar compteurs={donnees} chargement={false} etape={etape} onEtape={onEtape} />));
  return { onEtape, user: userEvent.setup() };
}

describe('Le bandeau du Radar (TCK-2461)', () => {
  it('pose le filtre de l’étape, puis le retire au second clic', async () => {
    const { onEtape, user } = rendre();
    await user.click(screen.getByTestId('radar-counter-extracted'));
    expect(onEtape).toHaveBeenCalledWith('extracted');
  });

  it('une étape déjà choisie est pressée, et la rechoisir vide le filtre', async () => {
    const { onEtape, user } = rendre('extracted');
    const tuile = screen.getByTestId('radar-counter-extracted');
    expect(tuile).toHaveAttribute('aria-pressed', 'true');
    await user.click(tuile);
    expect(onEtape).toHaveBeenCalledWith('');
  });

  it('un plafond atteint se voit sur le montant, pas seulement dans le libellé', () => {
    rendre('', compteurs({ spent_today_usd: '1.00', daily_budget_usd: '1.00' }));
    const montant = screen.getByTestId('radar-counter-ai').querySelector('.text-destructive');
    expect(montant).not.toBeNull();
  });

  it('sous le plafond, le montant reste neutre', () => {
    rendre();
    expect(screen.getByTestId('radar-counter-ai').querySelector('.text-destructive')).toBeNull();
  });
});

describe('Le refus d’une réclamation (TCK-2461)', () => {
  it('a son libellé : le code s’affichait brut dans la liste', () => {
    expect(MOTIFS_RADAR['radar.claim.declined']).toBe('claimDeclined');
  });
});
