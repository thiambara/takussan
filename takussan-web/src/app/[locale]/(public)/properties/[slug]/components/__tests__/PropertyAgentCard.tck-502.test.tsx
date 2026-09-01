/**
 * TCK-502 — la carte de contact nomme **celui qui recevra le message**.
 *
 * Elle affichait `property.owner` — nom, avatar, lien vers le profil — pendant que le bouton
 * « Envoyer un message » posé juste dessous ouvrait un fil avec le collaborateur `agent` et que
 * « Appeler » composait le numéro d'un troisième. Relevé le 2026-08-31 sur
 * `terrain-viabilise-a-guediawaye-PVh69x` : la fiche montrait Pape Cissé, le fil naissait chez
 * Ousmane Ndiaye.
 *
 * ⚠️ Le serveur porte la règle (`App\Services\Property\PrimaryPropertyContact`) et l'émet dans
 * `primary_contact`. Ces tests gardent le seul maillon que le back ne peut pas garder : que la
 * carte lise bien cette clé-là, et non `owner`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { PropertyOwnerLite } from '@/types/property';
import { PropertyAgentCard } from '../PropertyAgentCard';

vi.mock('@/components/contact/WhatsAppButton', () => ({
  WhatsAppButton: () => null,
}));

const PROPRIETAIRE: PropertyOwnerLite = {
  id: 1,
  name: 'Pape Cissé',
  slug: 'pape-cisse',
  avatar_url: null,
  is_agent: false,
  member_since: null,
};

const AGENT: PropertyOwnerLite = {
  id: 2,
  name: 'Ousmane Ndiaye',
  slug: 'ousmane-ndiaye',
  avatar_url: null,
  is_agent: true,
  member_since: null,
};

function monter(contact: PropertyOwnerLite) {
  return render(
    withIntl(
      <PropertyAgentCard
        contact={contact}
        agency={null}
        propertySlug="terrain-guediawaye"
        propertyTitle="Terrain viabilisé à Guédiawaye"
        onMessage={() => {}}
      />,
    ),
  );
}

describe('<PropertyAgentCard> — TCK-502', () => {
  it('nomme le contact qu’on lui passe, et lie son profil', () => {
    monter(AGENT);

    expect(screen.getByText('Ousmane Ndiaye')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ousmane Ndiaye' })).toHaveAttribute(
      'href',
      expect.stringContaining('/agents/ousmane-ndiaye'),
    );
  });

  /**
   * L'ablation du ticket : repasser le propriétaire à la place du contact. La carte redevient
   * alors muette sur l'agent — c'est l'état qu'on corrige, et ce test le nomme pour qu'un retour
   * en arrière ne puisse pas rester silencieux.
   */
  it('ne montre PAS le propriétaire quand le contact est quelqu’un d’autre', () => {
    monter(AGENT);

    expect(screen.queryByText('Pape Cissé')).not.toBeInTheDocument();
  });

  it('montre le propriétaire quand c’est lui le contact', () => {
    monter(PROPRIETAIRE);

    expect(screen.getByText('Pape Cissé')).toBeInTheDocument();
  });
});

/**
 * Le maillon que le rendu ne peut pas garder : **ce que l'APPELANT passe.**
 *
 * `property.owner` et `property.primary_contact` ont le même type — `PropertyOwnerLite` — donc
 * remettre l'un à la place de l'autre reste vert au typage, vert au lint, et vert dans les trois
 * tests ci-dessus, qui ne voient que la prop reçue. C'est exactement la forme du défaut de
 * TCK-502 : deux sources interchangeables pour un même emplacement, dont une seule est juste.
 *
 * ⚠ Cette garde lit la SOURCE, pas le comportement — elle ne prouve donc rien du rendu, et elle
 * casserait sur une réécriture qui reste juste. Elle est là pour qu'un retour en arrière d'une
 * ligne ne puisse pas passer en silence, faute de pouvoir l'exprimer dans le typage.
 */
describe('le point d’appel de la carte (TCK-502)', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'PropertyDetailContent.tsx'),
    'utf8',
  );

  it('dérive le destinataire de primary_contact, pas d’owner seul', () => {
    expect(source).toContain('property.primary_contact ?? property.owner');
  });

  it('ne repasse pas property.owner à la carte de contact', () => {
    const carte = source.slice(
      source.indexOf('<PropertyAgentCard'),
      source.indexOf('/>', source.indexOf('<PropertyAgentCard')),
    );

    expect(carte).toContain('contact={destinataire}');
    expect(carte).not.toContain('property.owner');
  });
});
