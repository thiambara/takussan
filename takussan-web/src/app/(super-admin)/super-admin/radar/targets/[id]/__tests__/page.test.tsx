import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SuperAdminRadarTargetPage, { generateMetadata } from '../page';

/** TCK-2469 — la page d'une cible : un identifiant qui n'est pas un entier positif est un 404, avant tout appel. */
const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async (espace: string) => (cle: string) => `${espace}.${cle}`,
}));
vi.mock('@/components/admin/super/radar/cibles/RadarCibleFiche', () => ({
  RadarCibleFiche: ({ id }: { id: number }) => <div data-testid="fiche" data-id={id} data-type={typeof id} />,
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('/super-admin/radar/targets/[id] (TCK-2469)', () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  it.each(['abc', '0', '-3', '1.5', ''])('« %s » → notFound, sans rendre la fiche', async (id) => {
    await expect(SuperAdminRadarTargetPage(params(id))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('un entier positif rend la fiche, avec un nombre', async () => {
    render(await SuperAdminRadarTargetPage(params('12')));
    expect(screen.getByTestId('fiche')).toHaveAttribute('data-id', '12');
    expect(screen.getByTestId('fiche')).toHaveAttribute('data-type', 'number');
  });

  it('le titre de l\'onglet vient des messages des cibles', async () => {
    expect(await generateMetadata()).toEqual({ title: 'superAdmin.pages.radar.targets.detailMetaTitle' });
  });
});
