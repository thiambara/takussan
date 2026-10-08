/**
 * TCK-590 (passe 3, R2) — « Planifier une visite » sur la fiche bien, jugé sur la forme RÉELLE des
 * réponses de l'API. Les tests voisins passent `agencyId={3}` en dur : ils ne voyaient pas que
 * `PropertyResource` n'émet aucune clé `agency_id`, et que la fiche masquait le bouton à tout le
 * personnel.
 *
 * Les trois fixtures sont des réponses capturées sur l'API servie (base jetable, 2026-10-07) :
 * `GET /api/properties/1?fields[properties]=<DASHBOARD_PROPERTY_DETAIL_FIELDS>` lu par l'agent, et
 * `GET /api/me/profiles` de l'agent et du bailleur de la même agence. Aucun id n'est écrit ici.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { PlanifierUneVisite } from '../PlanifierUneVisite';
import { agenceDuBien } from '@/lib/visites/agence-du-bien';
import fiche from './fixtures/r2-fiche-bien.json';
import profilsAgent from './fixtures/r2-profils-agent.json';
import profilsBailleur from './fixtures/r2-profils-bailleur.json';

const profils = vi.hoisted(() => ({ courant: null as unknown }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: profils.courant }) }));
vi.mock('@/lib/queries/visits', () => ({ usePlanVisit: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => ({ data: { data: [] } }) }));

function ficheBien(): React.ReactElement {
  return (
    <PlanifierUneVisite
      property={{ id: fiche.data.id, libelle: fiche.data.title }}
      agencyId={agenceDuBien(fiche.data)}
    />
  );
}

describe('<PlanifierUneVisite> sur la fiche bien — forme réelle de l’API (passe 3, R2)', () => {
  it('l’agent actif de l’agence du bien a le bouton', () => {
    profils.courant = profilsAgent;
    render(withIntl(ficheBien()));
    expect(screen.getByRole('button', { name: 'Planifier une visite' })).toBeInTheDocument();
  });

  it('le bailleur de la même agence ne l’a pas', () => {
    profils.courant = profilsBailleur;
    render(withIntl(ficheBien()));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });
});
