/**
 * TCK-505 (défaut #12) — la ligne « agence » de la carte de contact ne fixe pas la largeur de la page.
 *
 * Mesuré le 2026-09-02 à 360 px sur `/fr/properties/appartement-a-liberte-4-Qeqg34` : le viewport
 * s'élargissait à 369 px (`innerWidth` 369, `scrollWidth` 369) — ce que `scrollWidth − innerWidth`
 * ne voit pas, puisque les deux grandissent ensemble. Retirer un élément à la fois jusqu'à ce que
 * la page retombe à 360 a désigné le `<p class="flex … truncate">` de l'agence : `truncate` y pose
 * `white-space: nowrap`, hérité par le lien, et un lien en `nowrap` qui est un enfant flex garde
 * pour largeur minimale celle de son texte. `overflow: hidden` sur le `<p>` clippe l'affichage
 * mais ne réduit pas la largeur intrinsèque que la colonne de grille (`auto`) doit accueillir.
 *
 * La forme qui coupe vraiment : le lien lui-même est l'élément tronqué (`min-w-0 truncate`, comme
 * enfant flex), le `<p>` ne porte plus que `min-w-0`. La pastille « vérifiée » reste visible.
 *
 * Et l'`<aside>` de la fiche reçoit `min-w-0`, comme la colonne principale l'a déjà : sans lui, un
 * enfant de grille garde `min-width: auto` et tout contenu plus large que la colonne l'élargit.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { PropertyAgencyLite, PropertyOwnerLite } from '@/types/property';
import { PropertyAgentCard } from '../PropertyAgentCard';

vi.mock('@/components/contact/WhatsAppButton', () => ({
  WhatsAppButton: () => null,
}));

const CONTACT: PropertyOwnerLite = {
  id: 2,
  name: 'Mouhamadoul Amine Thiam',
  slug: 'mouhamadoul-amine-thiam',
  avatar_url: null,
  is_agent: true,
  member_since: null,
};

const AGENCE: PropertyAgencyLite = {
  id: 1,
  name: 'Espace de Mouhamadoul Amine Thiam',
  slug: 'espace-de-mouhamadoul-amine-thiam',
  logo_url: null,
  verified: true,
  rating: null,
};

describe('<PropertyAgentCard> — TCK-505 #12, la ligne agence ne fixe pas la largeur de la page', () => {
  it('tronque le LIEN de l’agence (min-w-0 truncate), pas le paragraphe qui le contient', () => {
    render(
      withIntl(
        <PropertyAgentCard
          contact={CONTACT}
          agency={AGENCE}
          propertySlug="appartement-a-liberte-4"
          propertyTitle="Appartement à Liberté 4"
          onMessage={() => {}}
        />,
      ),
    );
    const lien = screen.getByRole('link', { name: AGENCE.name });
    expect(lien.className).toMatch(/\btruncate\b/);
    expect(lien.className).toMatch(/\bmin-w-0\b/);

    const paragraphe = lien.parentElement as HTMLElement;
    expect(paragraphe.tagName).toBe('P');
    expect(paragraphe.className).not.toMatch(/\btruncate\b/);
    expect(paragraphe.className).toMatch(/\bmin-w-0\b/);
  });

  it('garde la pastille « vérifiée » à côté du lien, hors de la troncature', () => {
    render(
      withIntl(
        <PropertyAgentCard
          contact={CONTACT}
          agency={AGENCE}
          propertySlug="appartement-a-liberte-4"
          propertyTitle="Appartement à Liberté 4"
          onMessage={() => {}}
        />,
      ),
    );
    const lien = screen.getByRole('link', { name: AGENCE.name });
    const pastille = lien.parentElement!.querySelector('svg');
    expect(pastille).not.toBeNull();
    expect(lien.contains(pastille)).toBe(false);
  });

  it('borne l’<aside> de la fiche (min-w-0), comme la colonne principale', () => {
    const source = readFileSync(join(__dirname, '../../PropertyDetailContent.tsx'), 'utf8');
    const aside = source.match(/<aside className="([^"]+)"/);
    expect(aside).not.toBeNull();
    expect(aside![1].split(/\s+/)).toContain('min-w-0');
  });
});
