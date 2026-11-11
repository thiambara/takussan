/**
 * TCK-2659 — au téléphone, le sélecteur de mois se rend dans l'en-tête de la COQUE (`DeclarerEnTete`),
 * sous le fournisseur de messages de la coque, qui ne porte pas `admin.finances` (`namespaces.json`
 * découpe le dictionnaire par frontière). Mesuré le 2026-11-11 : un `useTranslations` dans le
 * sélecteur y rendait MISSING_MESSAGE et la page tombait sur sa frontière d'erreur. Ses libellés
 * viennent donc de la page ; ce test le rend sous un fournisseur SANS aucun message.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { SelecteurDeMois } from '../SelecteurDeMois';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/app/agency/finances',
  useSearchParams: () => new URLSearchParams(''),
}));

describe('SelecteurDeMois (TCK-2659)', () => {
  it('se rend sous un fournisseur qui ne porte pas admin.finances, sans erreur de message', () => {
    const onError = vi.fn();
    render(
      <NextIntlClientProvider locale="fr" messages={{}} timeZone="Africa/Dakar" onError={onError}>
        <SelecteurDeMois mois="2026-10" courant="2026-11" variante="telephone" textes={{ toutes: 'Toutes les dates', choisir: (m) => `Mois : ${m}` }} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Mois : Octobre' })).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });
});
