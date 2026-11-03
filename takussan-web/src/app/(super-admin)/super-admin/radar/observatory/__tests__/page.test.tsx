import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SuperAdminRadarObservatoryPage, { generateMetadata } from '../page';

/** TCK-2393 — la page de l'observatoire : elle rend l'écran, et son titre vient des messages de l'observatoire. */
vi.mock('next-intl/server', () => ({
  getTranslations: async (espace: string) => (cle: string) => `${espace}.${cle}`,
}));
vi.mock('@/components/admin/super/radar/observatoire/RadarObservatoire', () => ({
  RadarObservatoire: () => <div data-testid="observatoire" />,
}));

describe('/super-admin/radar/observatory (TCK-2393)', () => {
  it('rend l’observatoire', () => {
    render(<SuperAdminRadarObservatoryPage />);
    expect(screen.getByTestId('observatoire')).toBeInTheDocument();
  });

  it('le titre de l’onglet vient des messages de l’observatoire', async () => {
    expect(await generateMetadata()).toEqual({ title: 'superAdmin.pages.radar.observatory.metaTitle' });
  });
});
