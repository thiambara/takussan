import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SuperAdminRadarTargetRevisionsPage, { generateMetadata } from '../page';

/** TCK-2470 — la page des révisions rend l'historique des révisions de la demande. */
vi.mock('next-intl/server', () => ({
  getTranslations: async (espace: string) => (cle: string) => `${espace}.${cle}`,
}));
vi.mock('@/components/admin/super/radar/cibles/RevisionsDemande', () => ({
  RevisionsDemande: () => <div data-testid="revisions" />,
}));

describe('/super-admin/radar/targets/revisions (TCK-2470)', () => {
  it('rend l\'historique des révisions', () => {
    render(<SuperAdminRadarTargetRevisionsPage />);
    expect(screen.getByTestId('revisions')).toBeInTheDocument();
  });

  it('le titre de l\'onglet vient des messages des révisions', async () => {
    expect(await generateMetadata()).toEqual({ title: 'superAdmin.pages.radar.targets.revisions.metaTitle' });
  });
});
