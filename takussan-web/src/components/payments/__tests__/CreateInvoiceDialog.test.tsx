import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * Des mocks à IDENTITÉ STABLE, comme les vrais hooks : un objet neuf à chaque appel casserait le
 * cache du React Compiler et rendrait un FAUX VERT sous compilation (mesuré, TCK-564 E-repair-1).
 */
const MUTATION = vi.hoisted(() => ({
  mutateAsync: vi.fn(async (_payload: unknown) => ({ data: { id: 1 } })),
}));
vi.mock('@/lib/queries/payments', () => ({
  useCreateInvoice: () => MUTATION,
}));

/** P133.01 / P133.03 — les réglages de l'agence de l'émetteur ; par défaut, aucune agence. */
const AGENCE = vi.hoisted(() => ({
  valeur: { taxRate: null as number | null, currency: null as string | null, ready: false } as {
    taxRate: number | null;
    currency?: string | null;
    ready: boolean;
  },
}));
vi.mock('@/hooks/useAgencyInvoiceDefaults', () => ({
  useAgencyInvoiceDefaults: () => AGENCE.valeur,
}));

import { CreateInvoiceDialog } from '../CreateInvoiceDialog';

/**
 * TCK-571 — les totaux de la facture SUIVENT les lignes, la TVA et la devise.
 *
 * Le dialogue lisait `form.watch('items')`, `watch('tax_rate')` et `watch('currency')` PENDANT LE
 * RENDU — le motif que le React Compiler (`reactCompiler: true`) fige ailleurs. Ici, le défaut
 * N'A PAS ÉTÉ REPRODUIT : le composant est bien compilé, mais la sortie laisse ces trois lectures
 * HORS de tout bloc mis en cache (`const items = form.watch("items")` sans `$[n]`), parce que le
 * `onSuccess` de la mutation capture `form` (`form.reset`). Ce fichier, rejoué sous le compilateur
 * sur la version `watch()`, était vert 3 sur 3. Le risque est latent, et mesuré : sans
 * `form.reset` dans `onSuccess`, le test de la ligne ajoutée rougit sous compilation. `useWatch`
 * retire cette dépendance à un accident de la sortie du compilateur.
 *
 * ⚠ Ce fichier est donc vert AVEC OU SANS le correctif tel que le code est écrit : il décrit le
 * comportement, la garde du motif est `src/test/__tests__/watch-pendant-le-rendu.test.ts`.
 */

function recap(intitule: string): string {
  const dt = screen.getAllByText(intitule).find((el) => el.tagName === 'DT');
  if (!dt) throw new Error(`intitulé de récapitulatif introuvable : ${intitule}`);
  return dt.nextElementSibling?.textContent ?? '';
}

const sansEspaces = (s: string) => s.replace(/[\s  ]/g, '');

async function saisir(champ: HTMLElement, valeur: string) {
  const user = userEvent.setup();
  await user.clear(champ);
  await user.type(champ, valeur);
}

describe('CreateInvoiceDialog — les totaux suivent la saisie (TCK-571)', () => {
  it('le sous-total et le total suivent la quantité et le prix unitaire, et le bouton s’active', async () => {
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));
    expect(screen.getByRole('button', { name: 'Créer la facture' })).toBeDisabled();

    await saisir(screen.getByPlaceholderText('Qté'), '3');
    await saisir(screen.getByPlaceholderText('Prix unitaire'), '10000');

    expect(sansEspaces(recap('Sous-total'))).toBe('30000FCFA');
    expect(sansEspaces(recap('Total'))).toBe('30000FCFA');
    expect(screen.getByRole('button', { name: 'Créer la facture' })).toBeEnabled();
  });

  it('une ligne ajoutée entre dans le total, et la TVA s’y ajoute', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    await saisir(screen.getByPlaceholderText('Prix unitaire'), '10000');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await saisir(screen.getAllByPlaceholderText('Prix unitaire')[1]!, '5000');
    await saisir(screen.getByLabelText('TVA (%)'), '18');

    expect(sansEspaces(recap('Sous-total'))).toBe('15000FCFA');
    expect(sansEspaces(recap('TVA'))).toBe('2700FCFA');
    expect(sansEspaces(recap('Total'))).toBe('17700FCFA');
  });

  it('la devise choisie s’applique aux totaux', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    await saisir(screen.getByPlaceholderText('Prix unitaire'), '1500');
    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'EUR (€)' }));

    expect(sansEspaces(recap('Total'))).toBe('1500,00€');
  });
});

/** La charge utile du dernier envoi. */
function envoye(): Record<string, unknown> {
  const appels = MUTATION.mutateAsync.mock.calls;
  expect(appels.length).toBeGreaterThan(0);
  return appels[appels.length - 1]![0] as Record<string, unknown>;
}

async function remplir(prix: string) {
  await saisir(screen.getByLabelText(/ID client/), '7');
  await saisir(screen.getByPlaceholderText('Description'), 'Frais de dossier');
  await saisir(screen.getByPlaceholderText('Prix unitaire'), prix);
}

async function envoyer() {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Créer la facture' }));
}

async function remplirEtEnvoyer(prix: string) {
  await remplir(prix);
  await envoyer();
}

describe('CreateInvoiceDialog — le taux de TVA affiché est celui qui part (P133.01, TCK-1413)', () => {
  beforeEach(() => {
    MUTATION.mutateAsync.mockClear();
    AGENCE.valeur = { taxRate: null, ready: false };
  });

  it('un taux affiché à 0 part à 0 : l’API n’y substitue plus celui de l’agence', async () => {
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));
    expect(sansEspaces(recap('TVA'))).toBe('0FCFA');

    await remplirEtEnvoyer('100000');

    expect(envoye()).toHaveProperty('tax_rate', 0);
  });

  it('le taux par défaut de l’agence pré-remplit le champ, l’aperçu et l’envoi', async () => {
    AGENCE.valeur = { taxRate: 18, ready: true };
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    expect(screen.getByLabelText('TVA (%)')).toHaveValue(18);
    await remplir('100000');
    expect(sansEspaces(recap('TVA'))).toBe('18000FCFA');
    expect(sansEspaces(recap('Total'))).toBe('118000FCFA');

    await envoyer();
    expect(envoye()).toHaveProperty('tax_rate', 18);
  });

  it('remis à 0 par la personne, le taux part à 0 même pour une agence à 18 %', async () => {
    AGENCE.valeur = { taxRate: 18, ready: true };
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    await saisir(screen.getByLabelText('TVA (%)'), '0');
    await remplirEtEnvoyer('100000');

    expect(envoye()).toHaveProperty('tax_rate', 0);
  });

  it('l’aperçu arrondit la TVA à l’unité de la devise, comme l’API (10,50 € à 18 % → 1,89 €)', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    await saisir(screen.getByPlaceholderText('Prix unitaire'), '10.5');
    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'EUR (€)' }));
    await saisir(screen.getByLabelText('TVA (%)'), '18');

    expect(sansEspaces(recap('TVA'))).toBe('1,89€');
    expect(sansEspaces(recap('Total'))).toBe('12,39€');
  });
});

describe('CreateInvoiceDialog — les lignes saisies partent à l’API (P133.02, TCK-1377)', () => {
  beforeEach(() => {
    MUTATION.mutateAsync.mockClear();
    AGENCE.valeur = { taxRate: null, ready: false };
  });

  it('envoie chaque ligne, et plus de sous-total : l’API le recompte', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    await saisir(screen.getByLabelText(/ID client/), '7');
    await saisir(screen.getByPlaceholderText('Description'), 'Frais de dossier');
    await saisir(screen.getByPlaceholderText('Prix unitaire'), '25000');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await saisir(screen.getAllByPlaceholderText('Description')[1]!, 'Visite');
    await saisir(screen.getAllByPlaceholderText('Qté')[1]!, '2');
    await saisir(screen.getAllByPlaceholderText('Prix unitaire')[1]!, '10000');
    await envoyer();

    const charge = envoye();
    expect(charge.items).toEqual([
      { description: 'Frais de dossier', quantity: 1, unit_price: 25000 },
      { description: 'Visite', quantity: 2, unit_price: 10000 },
    ]);
    expect(charge).not.toHaveProperty('subtotal');
  });

  it('l’aperçu arrondit chaque ligne à l’unité de la devise, comme l’API (3 × 1,5 × 333 → 1 500)', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    for (let i = 0; i < 3; i += 1) {
      if (i > 0) await user.click(screen.getByRole('button', { name: 'Ajouter' }));
      await saisir(screen.getAllByPlaceholderText('Qté')[i]!, '1.5');
      await saisir(screen.getAllByPlaceholderText('Prix unitaire')[i]!, '333');
    }

    expect(sansEspaces(recap('Sous-total'))).toBe('1500FCFA');
  });
});

describe('CreateInvoiceDialog — la devise de l’agence pré-remplit le sélecteur (P133.03, TCK-1379)', () => {
  beforeEach(() => {
    MUTATION.mutateAsync.mockClear();
  });

  it('une agence en EUR émet en EUR sans toucher au sélecteur, aperçu compris', async () => {
    AGENCE.valeur = { taxRate: null, currency: 'EUR', ready: true };
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    await remplir('1500');
    expect(sansEspaces(recap('Total'))).toBe('1500,00€');

    await envoyer();
    expect(envoye()).toHaveProperty('currency', 'EUR');
  });

  it('la devise reste modifiable : choisie en XOF, elle part en XOF', async () => {
    AGENCE.valeur = { taxRate: null, currency: 'EUR', ready: true };
    const user = userEvent.setup();
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    await remplir('1500');
    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: /XOF/ }));
    await envoyer();

    expect(envoye()).toHaveProperty('currency', 'XOF');
  });
});
