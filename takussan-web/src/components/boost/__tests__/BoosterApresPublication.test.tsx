import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import fr from '@/messages/fr.json';
import table from '@/i18n/namespaces.json';
import { TIMEZONE } from '@/i18n/config';
import { withIntl } from '@/test/intl';
import { useCan } from '@/hooks/useCan';
import { BoostButton } from '../BoostButton';
import { LienBoosterApresPublication } from '../BoosterApresPublication';

/**
 * TCK-633 (décision 5 du porteur, 2026-10-12) — « Booster » dans le message qui confirme la
 * publication. Le message est un toast levé par l'assistant juste avant de quitter la page : son
 * bouton ne peut pas porter le dialogue (le toast se ferme seul et l'emporterait). Il mène donc à
 * la fiche du bien avec `?booster=1`, et c'est le « Booster » de la fiche qui s'ouvre.
 *
 * ⚠ Le toast est rendu par le `<Toaster />` du LAYOUT `(dashboard)`, sous le dictionnaire de cette
 * seule frontière (`messagesPour('(dashboard)')`), et non sous celui de la page qui l'a levé. Relevé
 * au navigateur le 2026-10-12 : un `useTranslations('boost')` dans le lien y levait
 * MISSING_MESSAGE, et la frontière d'erreur emportait le `<Toaster />` entier — le message de
 * publication disparaissait. Le lien se rend donc ici sous CE dictionnaire-là, pas sous `withIntl`.
 */

/** Le dictionnaire que le `<Toaster />` du layout `(dashboard)` reçoit réellement. */
function sousLeLayoutDuTableauDeBord(ui: ReactNode) {
  const complet = fr as Record<string, unknown>;
  const messages = Object.fromEntries(
    (table.frontieres['(dashboard)'] as readonly string[]).filter((n) => n in complet).map((n) => [n, complet[n]]),
  );
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone={TIMEZONE} now={new Date()} onError={(e) => { throw e; }}>
      {ui}
    </NextIntlClientProvider>
  );
}

vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));
vi.mock('../BoostDialog', () => ({
  BoostDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) =>
    open ? (
      <div role="dialog" aria-label="dialogue de boost">
        <button type="button" onClick={() => onOpenChange(false)}>fermer</button>
      </div>
    ) : null,
}));

function peut(can: boolean) {
  vi.mocked(useCan).mockReturnValue({ can, isLoading: false } as never);
}

describe('LienBoosterApresPublication', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mène à la fiche du bien, « Booster » demandé, sous le dictionnaire du layout', () => {
    peut(true);
    render(sousLeLayoutDuTableauDeBord(<LienBoosterApresPublication propertyId={42} libelle="Booster cette annonce" />));

    expect(screen.getByRole('link', { name: 'Booster cette annonce' })).toHaveAttribute('href', '/app/properties/42?booster=1');
    expect(useCan).toHaveBeenCalledWith('boost.spend');
  });

  it('ne propose rien à qui ne peut pas dépenser de crédits', () => {
    peut(false);
    const { container } = render(sousLeLayoutDuTableauDeBord(<LienBoosterApresPublication propertyId={42} libelle="Booster cette annonce" />));

    expect(container).toBeEmptyDOMElement();
  });
});

describe('BoostButton — ouverture demandée par l’adresse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/app/properties/42?booster=1');
  });

  it('s’ouvre seul quand la fiche est ouverte avec ?booster=1', () => {
    peut(true);
    render(withIntl(<BoostButton propertyId={42} propertyTitle="Villa" isPublic ouvrirDemande />));

    expect(screen.getByRole('dialog', { name: 'dialogue de boost' })).toBeInTheDocument();
  });

  it('reste fermé sans la demande', () => {
    peut(true);
    render(withIntl(<BoostButton propertyId={42} propertyTitle="Villa" isPublic />));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Booster' })).toBeInTheDocument();
  });

  it('s’ouvre quand la demande arrive après le montage (navigation douce depuis le message)', () => {
    peut(true);
    const { rerender } = render(withIntl(<BoostButton propertyId={42} propertyTitle="Villa" isPublic />));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(withIntl(<BoostButton propertyId={42} propertyTitle="Villa" isPublic ouvrirDemande />));

    expect(screen.getByRole('dialog', { name: 'dialogue de boost' })).toBeInTheDocument();
  });

  it('fermé, il retire ?booster=1 de l’adresse : un rechargement ne le rouvre pas', async () => {
    peut(true);
    const user = userEvent.setup();
    render(withIntl(<BoostButton propertyId={42} propertyTitle="Villa" isPublic ouvrirDemande />));

    await user.click(screen.getByRole('button', { name: 'fermer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/app/properties/42');
  });

  it('ne s’ouvre pas pour un bien qui n’est pas public, même demandé', () => {
    peut(true);
    render(withIntl(<BoostButton propertyId={42} propertyTitle="Villa" isPublic={false} ouvrirDemande />));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
