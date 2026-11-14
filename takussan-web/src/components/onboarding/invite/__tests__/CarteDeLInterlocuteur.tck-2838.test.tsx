import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { InterlocuteurDuBailleur } from '@/lib/owner-onboarding';

const getOwnerPropertiesAction = vi.fn();
vi.mock('@/app/actions/owner-onboarding', () => ({
  getOwnerPropertiesAction: (...args: unknown[]) => getOwnerPropertiesAction(...args),
}));

import { BiensDuBailleur } from '../BiensDuBailleur';
import { CarteDeLInterlocuteur } from '../CarteDeLInterlocuteur';

/**
 * TCK-2838 — la carte « Votre interlocuteur à l'agence » de l'écran 2 du bailleur invité : nom, rôle, « Appeler »
 * (`tel:` sur le numéro que l'API retient), WhatsApp seulement sur un numéro déclaré WhatsApp. Au bureau (`xl`),
 * au-dessus d'« À faire pour être payé » ; au téléphone, rien de neuf.
 */
const AGENTE: InterlocuteurDuBailleur = {
  source: 'inviter',
  first_name: 'Awa',
  last_name: 'Diop',
  role: 'agent',
  phone: '+221771230001',
  whatsapp: true,
};

describe('CarteDeLInterlocuteur (TCK-2838)', () => {
  it('dit le nom et le rôle de l’agent, et « Appeler » ouvre tel: sur son numéro', () => {
    render(withIntl(<CarteDeLInterlocuteur interlocuteur={AGENTE} agence="Dakar Immo" />));

    expect(screen.getByText('Votre interlocuteur à l’agence')).toBeInTheDocument();
    expect(screen.getByText('Awa Diop')).toBeInTheDocument();
    expect(screen.getByText('Agent · Dakar Immo')).toBeInTheDocument();
    const appeler = screen.getByRole('link', { name: 'Appeler le +221 77 123 00 01' });
    expect(appeler).toHaveAttribute('href', 'tel:+221771230001');
    const whatsapp = screen.getByRole('link', { name: /WhatsApp/ });
    expect(whatsapp).toHaveAttribute('href', 'https://wa.me/221771230001');
    expect(whatsapp).toHaveAttribute('target', '_blank');
  });

  it('sans WhatsApp déclaré, pas de bouton WhatsApp', () => {
    render(withIntl(<CarteDeLInterlocuteur interlocuteur={{ ...AGENTE, whatsapp: false }} agence="Dakar Immo" />));

    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Appeler/ })).toBeInTheDocument();
  });

  it('l’agence elle-même quand l’invitant n’y est plus : son nom, « Agence », son numéro', () => {
    render(
      withIntl(
        <CarteDeLInterlocuteur
          interlocuteur={{ source: 'agency', first_name: null, last_name: null, role: 'agency', phone: '+221338200000', whatsapp: false }}
          agence="Dakar Immo"
        />,
      ),
    );

    expect(screen.getByText('Dakar Immo')).toBeInTheDocument();
    expect(screen.getByText('Agence')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Appeler/ })).toHaveAttribute('href', 'tel:+221338200000');
  });

  it('un invitant sans aucun numéro public reste montré : nom et rôle, sans appel ni WhatsApp', () => {
    render(
      withIntl(
        <CarteDeLInterlocuteur
          interlocuteur={{ source: 'inviter', first_name: 'Mariama', last_name: 'Faye', role: 'agency_admin', phone: null, whatsapp: false }}
          agence="Agence des personas"
        />,
      ),
    );

    expect(screen.getByText('Mariama Faye')).toBeInTheDocument();
    expect(screen.getByText('Responsable de l’agence · Agence des personas')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('en anglais, le rôle et le titre sont traduits', () => {
    render(withIntl(<CarteDeLInterlocuteur interlocuteur={{ ...AGENTE, role: 'agency_admin' }} agence="Dakar Immo" />, 'en'));

    expect(screen.getByText('Your contact at the agency')).toBeInTheDocument();
    expect(screen.getByText('Agency manager · Dakar Immo')).toBeInTheDocument();
  });
});

describe('BiensDuBailleur — la carte dans la colonne du bureau (TCK-2838)', () => {
  beforeEach(() => {
    getOwnerPropertiesAction.mockReset();
    getOwnerPropertiesAction.mockResolvedValue({ ok: true, data: { data: [], meta: { total: 0 } } });
  });

  const rendre = (interlocuteur: InterlocuteurDuBailleur | null, pieces: Parameters<typeof BiensDuBailleur>[0]['pieces'] = []) =>
    render(
      withIntl(
        <BiensDuBailleur
          ownerProfileId={7}
          agence="Dakar Immo"
          telephone="+221770000000"
          pieces={pieces}
          interlocuteur={interlocuteur}
          onAller={vi.fn()}
          enCours={false}
        />,
      ),
    );

  it('au-dessus d’« À faire pour être payé », dans la colonne cachée sous xl', () => {
    rendre(AGENTE, [{ code: 'rib', required: true, kind: 'file', state: 'missing' } as never]);

    const carte = screen.getByTestId('interlocuteur');
    const aFaire = screen.getByTestId('a-faire-pour-etre-paye');
    const colonne = carte.parentElement!;
    expect(colonne.tagName).toBe('ASIDE');
    expect(colonne).toHaveClass('hidden', 'xl:block');
    expect(colonne).toContainElement(aFaire);
    expect(carte.compareDocumentPosition(aFaire) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('montrée même quand aucune pièce n’est due', () => {
    rendre(AGENTE, []);

    expect(within(screen.getByTestId('interlocuteur')).getByText('Awa Diop')).toBeInTheDocument();
    expect(screen.queryByTestId('a-faire-pour-etre-paye')).not.toBeInTheDocument();
  });

  it('sans interlocuteur, aucune carte', () => {
    rendre(null, []);

    expect(screen.queryByTestId('interlocuteur')).not.toBeInTheDocument();
  });
});
