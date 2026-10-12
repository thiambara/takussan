import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { PER_PAGE_PAR_DEFAUT } from '@/lib/recherche-publique';
import type { SearchFilters } from '@/types/search';
import { TailleDePage } from '../SearchToolbar';

/**
 * TCK-628 — la liste propose 40, 60 et 70 biens par page, et 40 par défaut.
 *
 * Le défaut affiché et le défaut DEMANDÉ à l'API sont désormais la même constante : le sélecteur
 * écrivait `30` en dur, `parametresDeRecherche` l'écrivait de son côté — deux écritures du même
 * nombre, qu'aucun test ne reliait.
 *
 * TCK-635 — le sélecteur est descendu à côté de la pagination (`TailleDePage`), rendu seulement
 * avec elle : `PropertiesDiscoveryPage.grille.test.tsx` garde cette condition.
 */
function monte(surcharge: { filters?: SearchFilters } = {}) {
  return render(withIntl(<TailleDePage filters={surcharge.filters ?? {}} onPerPageChange={vi.fn()} />));
}

const normalise = (s: string | null) => (s ?? '').replace(/[\s  ]+/g, ' ').trim();

async function optionsProposees(): Promise<string[]> {
  await userEvent.click(screen.getByRole('combobox', { name: /par page/i }));
  return (await screen.findAllByRole('option')).map((o) => normalise(o.textContent));
}

describe('TCK-628 — tailles de page de la recherche', () => {
  it('le défaut est 40, et c’est celui que la requête envoie', () => {
    expect(PER_PAGE_PAR_DEFAUT).toBe(40);
    monte();
    expect(normalise(screen.getByRole('combobox', { name: /par page/i }).textContent)).toMatch(/^40 \/ page/);
  });

  it('propose 40, 60 et 70 — et plus 30', async () => {
    monte();
    expect(await optionsProposees()).toEqual(['40 / page', '60 / page', '70 / page']);
  });

  it('un lien hérité en `per_page=30` affiche la taille qu’il sert réellement', async () => {
    monte({ filters: { per_page: 30 } });
    expect(normalise(screen.getByRole('combobox', { name: /par page/i }).textContent)).toMatch(/^30 \/ page/);
    expect(await optionsProposees()).toEqual(['30 / page', '40 / page', '60 / page', '70 / page']);
  });
});

describe('TCK-552 · AC4 — la taille de page n’est pas proposée sous lg', () => {
  it('son conteneur est `hidden lg:block`', () => {
    monte();
    const conteneur = screen.getByRole('combobox', { name: /par page/i }).closest('[data-controle="par-page"]');
    expect(conteneur).not.toBeNull();
    expect(conteneur!.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'lg:block']));
  });
});
