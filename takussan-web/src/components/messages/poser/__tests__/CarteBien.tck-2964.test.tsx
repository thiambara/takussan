/**
 * TCK-2964 — la carte du bien partagé rend son geste selon `object.abilities` :
 *
 * · `request_visit` vrai (le client, qui lit le bien parce qu'il est publié) → « Demander une visite »,
 *   vers la fiche publique localisée, où vit le parcours de demande de visite ;
 * · faux (l'agent, qui gère le bien) → aucun geste, un lien vers la fiche de gestion ;
 * · le prix est le chiffre clé, avec la période d'une location.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withIntl } from '@/test/intl';

import { CarteBien, type ProjectionBien } from '../CarteBien';

const BIEN: ProjectionBien = {
  id: 12,
  slug: 'appartement-mermoz',
  title: 'Appartement 3 chambres lumineux',
  price: 650000,
  currency: 'XOF',
  contract_type: 'rent',
  rent_period: 'monthly',
  area: 140,
  location: { quarter: 'Mermoz', city: 'Dakar' },
  main_photo_url: null,
};

describe('CarteBien', () => {
  it('le client qui peut demander une visite reçoit le geste, vers la fiche publique', () => {
    render(withIntl(<CarteBien objet={{ ...BIEN, abilities: { request_visit: true, transfer_owner: false } }} />));

    const geste = screen.getByRole('link', { name: 'Demander une visite' });
    expect(geste).toHaveAttribute('href', '/fr/properties/appartement-mermoz');
    expect(screen.queryByRole('link', { name: 'Voir le bien' })).toBeNull();
    expect(screen.getByText('Bien · Mermoz, Dakar · 140 m²')).toBeInTheDocument();
    expect(screen.getByText('par mois')).toBeInTheDocument();
    expect(screen.getByText('Appartement 3 chambres lumineux')).toBeInTheDocument();
    expect(screen.getByText(/650[\s  ,.]?000/)).toBeInTheDocument();
  });

  it('l’agent qui gère le bien n’a pas de geste, seulement sa fiche de gestion', () => {
    render(withIntl(<CarteBien objet={{ ...BIEN, abilities: { request_visit: false, transfer_owner: true } }} />));

    expect(screen.queryByRole('link', { name: 'Demander une visite' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Voir le bien' })).toHaveAttribute('href', '/app/properties/12');
  });

  it('sans abilities, aucun geste n’est supposé', () => {
    render(withIntl(<CarteBien objet={{ id: 12, slug: 'x' }} />));

    expect(screen.queryByRole('link', { name: 'Demander une visite' })).toBeNull();
    expect(screen.getByText('Bien partagé')).toBeInTheDocument();
  });
});
