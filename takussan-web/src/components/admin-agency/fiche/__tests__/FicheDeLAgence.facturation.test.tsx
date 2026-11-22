import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', async () => (await import('./doublures')).navigation);
vi.mock('@/app/actions/admin-agency', async () => (await import('./doublures')).ACTIONS);
vi.mock('@/context/AuthContext', async () => (await import('./doublures')).auth);
vi.mock('@/hooks/useCan', async () => (await import('./doublures')).can);
vi.mock('@/lib/queries/kyc', async () => (await import('./doublures')).KYC);
vi.mock('@/lib/queries/admin-users', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).EQUIPE }));
vi.mock('@/lib/queries/agency-queues', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).fileDeModeration }));

import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';

import { ACTIONS, reinitialiserLesDoublures } from './doublures';
import { AGENCE, INDIVIDUELLE, champ, enregistrer, rendreLaFiche } from './outils';

/**
 * TCK-2670 — la section « Facturation et mentions légales » : la devise (TCK-571), les taux vides
 * (TCK-1729), les mentions légales (TCK-594) et la commission de la colonne (TCK-962) — portés de
 * `AgencyConfigForm`.
 */

const sansEspaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]/g, '');
const ouvrir = (agence: Agency) => rendreLaFiche(agence, { section: 'facturation' });

beforeEach(() => {
  reinitialiserLesDoublures();
  ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: AGENCE });
});

/**
 * TCK-571 — l'aperçu de la devise et l'avertissement SUIVENT le choix (`useWatch`, jamais `watch()`
 * pendant le rendu). ⚠ Sans le React Compiler, ce test est vert avec ou sans le correctif : la garde
 * du motif est `src/test/__tests__/watch-pendant-le-rendu.test.ts`.
 */
describe('la devise choisie se reflète tout de suite (TCK-571)', () => {
  it('l’aperçu passe à la devise choisie, l’avertissement apparaît, et la devise part seule', async () => {
    const user = userEvent.setup();
    ouvrir(AGENCE);
    const apercu = () => screen.getByText(/sera affiché/);
    expect(sansEspaces(apercu().textContent)).toBe('100000seraaffiché:100000FCFA');
    expect(screen.queryByText(/Le changement de devise/)).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'EUR (€)' }));

    expect(sansEspaces(apercu().textContent)).toBe('100000seraaffiché:100000,00€');
    expect(screen.getByText(/Le changement de devise/)).toBeInTheDocument();
    expect(await enregistrer(user)).toEqual({ currency: 'EUR' });
  });

  it('revenir à la devise d’origine retire l’avertissement, et la modification', async () => {
    const user = userEvent.setup();
    ouvrir(AGENCE);
    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'USD ($)' }));
    expect(screen.getByText(/Le changement de devise/)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'XOF (F CFA)' }));
    expect(screen.queryByText(/Le changement de devise/)).toBeNull();
    expect(document.querySelector('[data-slot="barre-de-la-fiche"]')).toBeNull();
  });
});

describe('taux laissés vides (TCK-1729)', () => {
  it('ni `5` ni `18` en exemple, et l’aide « vide : 0 % » sous chacun des deux champs', () => {
    ouvrir({ ...AGENCE, commission_rate: null } as unknown as Agency);
    expect(champ('commission_rate')).not.toHaveAttribute('placeholder', '5');
    expect(champ('default_tax_rate')).not.toHaveAttribute('placeholder', '18');
    expect(screen.getAllByText(fr.admin.agencyConfig.fields.emptyRateIsZero)).toHaveLength(2);
  });
});

/**
 * TCK-594 (ADR-0039 §4, §7) — les mentions légales ne sont jamais proposées à une agence
 * `individual` (le serveur les refuse). Ces tests gardent l'accord entre l'écran et le serveur.
 */
describe('mentions légales (TCK-594)', () => {
  it('une agence standard a ses mentions ; une individuelle n’en a aucune, et la section s’appelle « Facturation »', () => {
    const { unmount } = ouvrir(AGENCE);
    expect(champ('ninea')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: fr.admin.agencyConfig.fiche.facturation.titre })).toBeInTheDocument();
    unmount();

    ouvrir(INDIVIDUELLE);
    expect(document.getElementById('field-ninea')).toBeNull();
    expect(document.getElementById('field-legal_name')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: fr.admin.agencyConfig.fiche.facturation.titreIndividuelle })).toBeInTheDocument();
  });

  it('une individuelle n’envoie jamais de mentions légales', async () => {
    const user = userEvent.setup();
    ouvrir({ ...INDIVIDUELLE, ninea: '000111222' });
    await user.type(champ('default_tax_rate'), '18');
    expect(await enregistrer(user)).toEqual({ default_tax_rate: 18 });
  });

  it('l’aperçu de la facture dit ce qui manque', () => {
    ouvrir(AGENCE);
    expect(screen.getByText(fr.admin.agencyConfig.fiche.facturation.apercuAbsents)).toBeInTheDocument();
  });
});

/**
 * TCK-962 (P47.02) — la commission et la devise se lisent sur leurs colonnes. Le fuseau, que l'API
 * jette, n'a plus de champ ; les miroirs de `settings` ne sont ni lus ni renvoyés.
 */
describe('colonnes seules, sans fuseau (TCK-962)', () => {
  const ANCIENNE: Agency = {
    ...AGENCE,
    commission_rate: 5,
    currency: null as unknown as Agency['currency'],
    settings: { default_commission_rate: 12, currency: 'EUR', timezone: 'Africa/Dakar' } as Agency['settings'],
  };

  it('affiche la commission de la colonne, pas celle du miroir, et ne renvoie aucun miroir', async () => {
    const user = userEvent.setup();
    ouvrir(ANCIENNE);
    expect(champ('commission_rate')).toHaveValue('5');
    expect(screen.queryByLabelText('Fuseau horaire')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Devise' })).not.toHaveTextContent(/EUR/);

    await user.type(champ('default_tax_rate'), '18');
    expect(await enregistrer(user)).toEqual({ default_tax_rate: 18 });
  });
});
