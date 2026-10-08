/**
 * TCK-590 AC19 — pas de bouton qui mène à une erreur : sans numéro, ni « Appeler » ni WhatsApp ;
 * et aucune boîte d'alerte native dans les composants de contact de la fiche.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { PropertyOwnerLite } from '@/types/property';
import { PropertyAgentCard } from '../PropertyAgentCard';

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

describe('<PropertyAgentCard> — TCK-590', () => {
  it('has_phone faux : ni Appeler, ni WhatsApp', () => {
    monter({ ...AGENT, has_phone: false });
    expect(screen.queryByRole('button', { name: /appeler/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /message/i })).toBeInTheDocument();
  });

  it('has_phone absent (repli sur le propriétaire) : même chose', () => {
    monter(AGENT);
    expect(screen.queryByRole('button', { name: /appeler/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument();
  });

  it('has_phone vrai : les deux boutons', () => {
    monter({ ...AGENT, has_phone: true });
    expect(screen.getByRole('button', { name: /appeler/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /whatsapp/i })).toBeInTheDocument();
  });

  it('aucune boîte d’alerte native dans les composants de contact de la fiche', () => {
    const racine = join(process.cwd(), 'src');
    const fichiers = [
      'app/[locale]/(public)/properties/[slug]/components/PropertyAgentCard.tsx',
      'app/[locale]/(public)/properties/[slug]/components/PropertyContactMessageDialog.tsx',
      'app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx',
      'app/[locale]/(public)/properties/[slug]/components/PropertyMobileBottomBar.tsx',
      'components/contact/WhatsAppButton.tsx',
      'components/public/AnonymousLeadDialog.tsx',
    ];
    for (const fichier of fichiers) {
      expect(readFileSync(join(racine, fichier), 'utf8'), fichier).not.toMatch(/\balert\(/);
    }
  });
});
