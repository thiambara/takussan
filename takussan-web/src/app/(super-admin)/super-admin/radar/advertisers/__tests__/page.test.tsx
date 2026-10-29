import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SuperAdminRadarAdvertisersPage, { generateMetadata } from '../page';

/** TCK-2388 — la page des files d'annonceurs : elle rend la liste, et son titre vient des messages des files. */
vi.mock('next-intl/server', () => ({
  getTranslations: async (espace: string) => (cle: string) => `${espace}.${cle}`,
}));
vi.mock('@/components/admin/super/radar/annonceur/RadarAdvertiserList', () => ({
  RadarAdvertiserList: () => <div data-testid="liste-annonceurs" />,
}));

describe('/super-admin/radar/advertisers (TCK-2388)', () => {
  it('rend la liste des files', () => {
    render(<SuperAdminRadarAdvertisersPage />);
    expect(screen.getByTestId('liste-annonceurs')).toBeInTheDocument();
  });

  it('le titre de l’onglet vient des messages des files d’annonceurs', async () => {
    expect(await generateMetadata()).toEqual({ title: 'superAdmin.pages.radar.advertisers.metaTitle' });
  });
});
