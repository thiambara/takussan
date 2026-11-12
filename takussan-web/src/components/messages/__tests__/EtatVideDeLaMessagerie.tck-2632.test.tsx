/**
 * TCK-2632 (AC6, écran a-4 « Aucune conversation ») — l'état vide d'une messagerie sans aucun fil,
 * au bureau : il occupe le panneau du fil, et le personnel d'agence y trouve, sous « Écrire à un
 * client », « ou voir les demandes de contact » — d'où naissent la plupart de ses fils.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { EtatVideDeLaMessagerie } from '../EtatVideDeLaMessagerie';

let roles: string[] = ['agent'];
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, roles } }) }));

beforeEach(() => {
  roles = ['agent'];
});

describe('<EtatVideDeLaMessagerie bureau> (TCK-2632, a-4 bureau)', () => {
  it.each([['agent'], ['agency_admin']])(
    'le %s : « Écrire à un client » à la taille du bureau, puis « ou voir les demandes de contact »',
    (role) => {
      roles = [role];
      const onNouvelle = vi.fn();
      render(withIntl(<EtatVideDeLaMessagerie bureau onNouvelle={onNouvelle} />));

      expect(screen.getByTestId('messagerie-panneau-vide')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Aucune conversation' })).toBeInTheDocument();
      const ecrire = screen.getByRole('button', { name: 'Écrire à un client' });
      expect(ecrire).toHaveClass('h-controle');
      expect(ecrire).not.toHaveClass('h-controle-action');
      fireEvent.click(ecrire);
      expect(onNouvelle).toHaveBeenCalledTimes(1);

      const lien = screen.getByRole('link', { name: 'voir les demandes de contact' });
      expect(lien).toHaveAttribute('href', '/app/leads');
      expect(lien.parentElement).toHaveTextContent(/^ou voir les demandes de contact$/);
      // Posé dans le bas de l'état vide (maquette `-mt-6`), pas 48 px plus loin.
      expect(lien.parentElement).toHaveClass('-mt-6');
    },
  );

  it('le client : « Parcourir les annonces », sans les demandes de contact', () => {
    roles = ['customer'];
    render(withIntl(<EtatVideDeLaMessagerie bureau onNouvelle={() => {}} />));
    expect(screen.getByRole('link', { name: 'Parcourir les annonces' })).toHaveAttribute('href', '/properties');
    expect(screen.queryByRole('link', { name: 'voir les demandes de contact' })).not.toBeInTheDocument();
  });

  it.each([['service_provider'], ['owner']])('le %s : une phrase, ni bouton ni lien', (role) => {
    roles = ['customer', role];
    render(withIntl(<EtatVideDeLaMessagerie bureau onNouvelle={() => {}} />));
    expect(screen.getByText(/naissent des interventions et des baux/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('au téléphone, pas de lien vers les demandes : la barre d’onglets y mène déjà', () => {
    render(withIntl(<EtatVideDeLaMessagerie onNouvelle={() => {}} />));
    expect(screen.queryByTestId('messagerie-panneau-vide')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'voir les demandes de contact' })).not.toBeInTheDocument();
  });
});
