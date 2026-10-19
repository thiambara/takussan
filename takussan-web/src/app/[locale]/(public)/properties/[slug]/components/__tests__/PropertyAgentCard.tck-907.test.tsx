/**
 * TCK-907 (P31.07) — les deux liens de la carte de contact sont des cibles de 24 px au moins
 * (WCAG 2.5.8), et se distinguent du texte voisin sans dépendre du survol.
 *
 * Mesuré par axe à 1280 px (P31.07) : 82 × 17 px pour l'agent, 108 × 18 px pour l'agence, l'un
 * au-dessus de l'autre — `target-size` sur les deux ; seuls la graisse et `hover:underline` les
 * séparaient du texte. jsdom ne pose aucune feuille de style : on garde les utilitaires qui
 * donnent la hauteur (`min-h-6` sur une boîte qui la respecte, pas un `<a>` en ligne) et le
 * soulignement permanent.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { PropertyAgencyLite, PropertyOwnerLite } from '@/types/property';
import { PropertyAgentCard } from '../PropertyAgentCard';

vi.mock('@/components/contact/WhatsAppButton', () => ({ WhatsAppButton: () => null }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const CONTACT: PropertyOwnerLite = {
  id: 2,
  name: 'Awa Diop',
  slug: 'awa-diop',
  avatar_url: null,
  is_agent: true,
  member_since: null,
};

const AGENCE: PropertyAgencyLite = {
  id: 1,
  name: 'Agence de la Corniche',
  slug: 'agence-de-la-corniche',
  logo_url: null,
  verified: true,
  rating: null,
};

function classesDe(nom: string): string[] {
  render(
    withIntl(
      <PropertyAgentCard
        contact={CONTACT}
        agency={AGENCE}
        propertySlug="villa-a-ngor"
        propertyTitle="Villa à Ngor"
        onMessage={() => {}}
      />,
    ),
  );
  return screen.getByRole('link', { name: nom }).className.split(/\s+/);
}

describe('<PropertyAgentCard> — cibles des liens agent et agence (TCK-907, P31.07)', () => {
  it('le lien de l’agent : 24 px de haut au moins, sur une boîte qui les respecte, souligné', () => {
    const classes = classesDe(CONTACT.name);
    expect(classes).toContain('min-h-6');
    // `min-height` est sans effet sur un `<a>` en ligne : le lien doit être une boîte.
    expect(classes).toContain('inline-block');
    expect(classes).toContain('underline');
  });

  it('le lien de l’agence : 24 px de haut au moins, souligné', () => {
    // Enfant d'un `<p>` flex (TCK-505) : il est déjà une boîte, `min-h-6` s'y applique.
    const classes = classesDe(AGENCE.name);
    expect(classes).toContain('min-h-6');
    expect(classes).toContain('underline');
  });
});
