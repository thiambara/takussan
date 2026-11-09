/**
 * TCK-590 AC19 — pas de bouton qui mène à une erreur : sans numéro, ni « Appeler » ni WhatsApp ;
 * et aucune boîte d'alerte native dans les composants de contact de la fiche.
 *
 * TCK-2501 — ces règles vivaient dans `PropertyAgentCard.tck-590.test.tsx` : Appeler, WhatsApp et la
 * porte « message » ont quitté la carte de l'agent pour la carte de réservation (bureau). Mêmes
 * assertions, portées sur la surface qui tient désormais les canaux.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { PropertyDetail, PropertyOwnerLite } from '@/types/property';
import { PropertyBookingCard } from '../PropertyBookingCard';

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
      <PropertyBookingCard
        property={{ slug: 'villa', title: 'Villa des Almadies', price: 1, currency: 'XOF', contract_type: 'rent', rent_period: 'monthly', entry_cost: null } as unknown as PropertyDetail}
        contact={contact}
        onRequestVisit={() => {}}
        onRequestBooking={() => {}}
        onMessage={() => {}}
      />,
    ),
  );
}

describe('<PropertyBookingCard> — TCK-590 (règles venues de la carte de l’agent)', () => {
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

  it('has_phone et has_whatsapp vrais : les deux boutons', () => {
    monter({ ...AGENT, has_phone: true, has_whatsapp: true });
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
      'app/[locale]/(public)/properties/[slug]/components/PropertyBookingCard.tsx',
      'app/[locale]/(public)/properties/[slug]/components/PropertyMobileContact.tsx',
      'app/[locale]/(public)/properties/[slug]/components/useAppelDuBien.ts',
      'components/contact/WhatsAppButton.tsx',
      'components/public/AnonymousLeadDialog.tsx',
    ];
    for (const fichier of fichiers) {
      expect(readFileSync(join(racine, fichier), 'utf8'), fichier).not.toMatch(/\balert\(/);
    }
  });
});
