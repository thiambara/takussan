import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SuperAdminRadarTargetsPage, { generateMetadata } from '../page';

/** TCK-2469 — la page des cibles rend la console des cibles. */
vi.mock('next-intl/server', () => ({
  getTranslations: async (espace: string) => (cle: string) => `${espace}.${cle}`,
}));
vi.mock('@/components/admin/super/radar/cibles/RadarCibles', () => ({
  RadarCibles: () => <div data-testid="cibles" />,
}));

describe('/super-admin/radar/targets (TCK-2469)', () => {
  it('rend la liste des cibles', () => {
    render(<SuperAdminRadarTargetsPage />);
    expect(screen.getByTestId('cibles')).toBeInTheDocument();
  });

  it('le titre de l\'onglet vient des messages des cibles', async () => {
    expect(await generateMetadata()).toEqual({ title: 'superAdmin.pages.radar.targets.metaTitle' });
  });
});
