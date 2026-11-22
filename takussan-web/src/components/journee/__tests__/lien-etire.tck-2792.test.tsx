/**
 * TCK-2792 — dans « Ma journée », le titre de la carte de visite est un lien ÉTIRÉ sur la tête de la carte :
 * « Visite », le titre, l'adresse et le visiteur. Itinéraire, Appeler et WhatsApp restent hors de la zone.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Moment } from '@/lib/journee/journee';
import { attendreLienEtire } from '@/test/lien-etire';
import { withIntl } from '@/test/intl';
import type { PropertyVisit } from '@/types/visit';

import { Chronologie } from '../Chronologie';

const VISITE = {
  id: 41,
  property_id: 51,
  status: 'confirmed',
  type: 'in_person',
  scheduled_at: '2026-11-13T10:30:00Z',
  duration_minutes: 30,
  agent_id: 3,
  property: { id: 51, title: 'Local commercial', slug: 'local-commercial', cover_url: null, address: { line: 'Rue 10', neighborhood: 'Plateau', latitude: 14.67, longitude: -17.43 } },
  visitor_display: { name: 'Mariama Fall', phone: '+221789429352', kind: 'customer', visits_on_property: 1 },
} as unknown as PropertyVisit;

const MOMENTS: readonly Moment[] = [{ genre: 'visite', instant: Date.parse(VISITE.scheduled_at as string), visite: VISITE }];
const GESTES = { onCocher: () => {}, onReporter: () => {}, onContacter: () => {}, enCours: null };

describe('TCK-2792 — Ma journée : le titre de la carte de visite, lien étiré sur la tête', () => {
  it('la zone est la tête (« Visite », titre, adresse, visiteur), sans Itinéraire, Appeler ni WhatsApp', () => {
    render(withIntl(<Chronologie moments={MOMENTS} maintenant={null} gestes={GESTES} onPlanifier={() => {}} />));
    const lien = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/app/visits/41') as HTMLElement;
    const carte = lien.closest<HTMLElement>('[data-slot="carte-visite"]') as HTMLElement;
    const gestes = [...carte.querySelectorAll<HTMLElement>('a[href], button')].filter((g) => g !== lien);
    expect(gestes.length).toBeGreaterThanOrEqual(2);
    attendreLienEtire(lien, { carte, temoins: [screen.getByText(/Rue 10/)], gestes });
  });
});
