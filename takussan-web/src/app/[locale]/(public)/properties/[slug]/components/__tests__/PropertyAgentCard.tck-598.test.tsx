/**
 * TCK-598 (V8, AC9) — le badge « Téléphone vérifié » suit `phone_verified` et rien d'autre ;
 * l'encadré de prudence est rendu hors de la carte.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { PropertyOwnerLite } from '@/types/property';
import { PropertyAgentCard } from '../PropertyAgentCard';
import { PropertySafetyNotice } from '../PropertySafetyNotice';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

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
        propertySlug="villa"
        propertyTitle="Villa des Almadies"
        onMessage={() => {}}
      />,
    ),
  );
}

describe('<PropertyAgentCard> — TCK-598', () => {
  it('phone_verified vrai : le badge', () => {
    monter({ ...AGENT, phone_verified: true });
    expect(screen.getByText('Téléphone vérifié')).toBeInTheDocument();
  });

  it.each([
    ['faux', { ...AGENT, phone_verified: false }],
    ['absent', AGENT],
  ])('phone_verified %s : pas de badge', (_cas, contact) => {
    monter(contact);
    expect(screen.queryByText('Téléphone vérifié')).not.toBeInTheDocument();
  });

  it('has_phone sans phone_verified : pas de badge (avoir un numéro n’est pas l’avoir vérifié)', () => {
    monter({ ...AGENT, has_phone: true });
    expect(screen.queryByText('Téléphone vérifié')).not.toBeInTheDocument();
  });
});

describe('<PropertySafetyNotice>', () => {
  it('dit de ne rien verser avant la visite, sans ton d’alerte', () => {
    render(withIntl(<PropertySafetyNotice />));
    const encadre = screen.getByRole('complementary', { name: 'Conseil de prudence' });
    expect(encadre).toHaveTextContent(/Ne versez jamais d'argent avant d'avoir visité le bien/);
    expect(encadre).not.toHaveAttribute('role', 'alert');
  });
});
