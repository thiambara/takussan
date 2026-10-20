import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { AgencyCombobox } from '../AgencyCombobox';

/**
 * TCK-1085 (P68.06) — ouvrir la liste ne doit laisser AUCUN élément focusable du champ sous le
 * masquage que Base UI pose sur le reste de la page (`aria-hidden`, `inert`) quand la saisie est
 * hors du popup. Le `Combobox.Trigger` d'avant gardait le focus dans la zone masquée (axe :
 * `aria-hidden-focus`), et le `Combobox.Clear` y restait joignable à Tab.
 */

const AGENCES = [
  { id: 1, name: 'Agence Plateau' },
  { id: 63, name: 'Ziguinchor Habitat' },
];

function servirAgences() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const detail = /\/api\/super-admin\/agencies\/(\d+)$/.exec(url.pathname);
      if (detail) {
        const agence = AGENCES.find((a) => a.id === Number(detail[1]));
        return { ok: true, json: async () => ({ data: agence }) };
      }
      return {
        ok: true,
        json: async () => ({
          data: AGENCES,
          meta: { total: AGENCES.length, current_page: 1, last_page: 1, per_page: 20 },
        }),
      };
    }),
  );
}

function monter(value = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <AgencyCombobox value={value} onChange={vi.fn()} label="Agence" />
      </QueryClientProvider>,
    ),
  );
}

/** Vrai si l'élément ou un de ses ancêtres est masqué aux technologies d'assistance. */
function sousMasquage(element: Element | null): boolean {
  for (let noeud = element; noeud; noeud = noeud.parentElement) {
    if (noeud.getAttribute('aria-hidden') === 'true' || noeud.hasAttribute('inert')) return true;
  }
  return false;
}

/** Les éléments focusables hors du popup ouvert, dans le champ du sélecteur. */
function focusablesDuChamp(champ: HTMLElement) {
  const groupe = champ.parentElement as HTMLElement;
  return Array.from(
    groupe.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<AgencyCombobox> — ouverture sans contenu focusable masqué', () => {
  it("n'a plus de déclencheur séparé : la saisie ouvre la liste au clic", async () => {
    const user = userEvent.setup();
    servirAgences();
    monter();

    // Aucun bouton du champ hors de l'effacement (rendu seulement avec une valeur) : plus de `Combobox.Trigger` (« Ouvrir la liste
    // des agences »), qui gardait le focus sous le masquage une fois la liste ouverte.
    const groupe = screen.getByLabelText('Agence').parentElement as HTMLElement;
    expect(
      within(groupe)
        .queryAllByRole('button', { hidden: true })
        .map((bouton) => bouton.getAttribute('aria-label'))
        .filter((nom) => nom !== "Effacer l'agence sélectionnée"),
    ).toEqual([]);

    await user.click(screen.getByLabelText('Agence'));
    expect(await screen.findByRole('option', { name: 'Agence Plateau' })).toBeInTheDocument();
  });

  it('liste ouverte, aucun élément focusable du champ, focus compris, sous aria-hidden', async () => {
    const user = userEvent.setup();
    servirAgences();
    monter('63');

    const champ = screen.getByLabelText('Agence');
    await screen.findByDisplayValue('Ziguinchor Habitat');
    await user.click(champ);
    await screen.findByRole('option', { name: 'Agence Plateau' });

    expect(sousMasquage(document.activeElement)).toBe(false);
    const masques = focusablesDuChamp(champ).filter(sousMasquage);
    expect(masques.map((el) => el.getAttribute('aria-label') ?? el.tagName)).toEqual([]);
  });
});
