import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';
import type { SearchFilters } from '@/types/search';

/**
 * TCK-335, étape 3 — anti-rebond de saisie du panneau de filtres publics.
 *
 * ## Pourquoi ce test porte sur le COMPOSANT et non sur `PropertiesDiscoveryPage`
 *
 * Au niveau de la page, `useRouter` est moqué, donc `useSearchParams` ne change jamais, donc
 * l'effet de `useSearch` ne se rejoue jamais. Un test « 5 frappes → 1 appel » y serait **VERT
 * SANS LE CORRECTIF** : c'est le faux positif exact que ce dépôt s'interdit. Ici, la seule
 * frontière observée est `onFilterChange`, celle que le correctif déplace.
 *
 * ## Pourquoi des timers RÉELS
 *
 * `vi.useFakeTimers()` nu et `userEvent` se marchent dessus (user-event programme ses propres
 * délais). Le patron du dépôt est celui de `WizardReprenable.test.tsx` : injecter un délai court
 * (`debounceMs`) et piloter la saisie par `fireEvent.change`.
 */

const PLACEHOLDER_VILLE = 'Ville (ex : Dakar, Mbour…)';
const PLACEHOLDER_PRIX_MIN = 'Min';

function monte(filters: SearchFilters = {}) {
  const onFilterChange = vi.fn();
  const onReset = vi.fn();
  render(
    withIntl(
      <FilterSidebar
        filters={filters}
        onFilterChange={onFilterChange}
        onReset={onReset}
        activeCount={0}
        open={false}
        onClose={() => {}}
        debounceMs={20}
      />,
    ),
  );
  return { onFilterChange, onReset };
}

function frappe(input: HTMLElement, texte: string) {
  for (let i = 1; i <= texte.length; i += 1) {
    fireEvent.change(input, { target: { value: texte.slice(0, i) } });
  }
}

describe('<FilterSidebar> — anti-rebond de saisie (TCK-335)', () => {
  it("AC7a — cinq caractères dans « Ville » ne commitent qu'UNE fois, après le délai", async () => {
    const { onFilterChange } = monte();
    const ville = screen.getByPlaceholderText(PLACEHOLDER_VILLE);

    frappe(ville, 'Dakar');

    // Avant l'échéance : rien n'est parti. Sans le correctif, il y aurait déjà 5 appels — donc
    // 5 `router.replace` et 5 aller-retours RSC (mesuré le 2026-08-21).
    expect(onFilterChange).not.toHaveBeenCalled();

    await waitFor(() => expect(onFilterChange).toHaveBeenCalledTimes(1));
    // TCK-335 étape 5 — le second argument marque un commit de champ CONTINU : l'appelant
    // l'inscrit par `replace` plutôt que d'empiler une entrée d'historique par mot tapé.
    expect(onFilterChange).toHaveBeenCalledWith({ city: 'Dakar', page: 1 }, { continu: true });
  });

  it("AC7b — le caractère frappé reste À L'ÉCRAN pendant toute la saisie", () => {
    monte();
    const ville = screen.getByPlaceholderText(PLACEHOLDER_VILLE) as HTMLInputElement;

    // C'est la garde contre les deux emplacements INTERDITS : temporiser `useSearch` ou
    // `router.replace` laisse l'input contrôlé par l'URL, qui ne bouge pas — `filters.city`
    // reste `undefined` ici, et `restoreStateOfTarget` du react-dom remet la valeur à vide.
    const attendus = ['D', 'Da', 'Dak', 'Daka', 'Dakar'];
    for (const attendu of attendus) {
      fireEvent.change(ville, { target: { value: attendu } });
      expect(ville.value).toBe(attendu);
    }
  });

  it('AC7c — cliquer une puce pendant une saisie en attente CONSERVE LES DEUX', async () => {
    const { onFilterChange } = monte();
    const ville = screen.getByPlaceholderText(PLACEHOLDER_VILLE) as HTMLInputElement;

    frappe(ville, 'Dakar');
    expect(onFilterChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Vente' }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({
      city: 'Dakar',
      contract_type: 'sale',
      rent_period: undefined,
      page: 1,
    });
    // Le texte n'a pas été effacé de l'écran par le clic.
    expect(ville.value).toBe('Dakar');

    // …et le timer a bien été désarmé : pas de second commit qui doublerait la navigation.
    await new Promise((r) => setTimeout(r, 60));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it("AC7d — une borne numérique ne commite QU'au blur, jamais sur un timer", async () => {
    const { onFilterChange } = monte();
    const prixMin = screen.getByPlaceholderText(PLACEHOLDER_PRIX_MIN) as HTMLInputElement;

    frappe(prixMin, '150000');
    expect(prixMin.value).toBe('150000');

    // Un anti-rebond court suffirait à laisser passer `price_min=15` — qui rend LE CATALOGUE
    // ENTIER (29 374 octets par requête). On attend donc trois fois le délai des champs libres.
    await new Promise((r) => setTimeout(r, 60));
    expect(onFilterChange).not.toHaveBeenCalled();

    fireEvent.blur(prixMin);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({ price_min: 150000, page: 1 }, { continu: true });
  });

  it('AC7e — `flush()` au blur : ce qui est tapé est commité sans attendre le délai', () => {
    const { onFilterChange } = monte();
    const ville = screen.getByPlaceholderText(PLACEHOLDER_VILLE);

    frappe(ville, 'Saly');
    fireEvent.blur(ville);

    // Sans ce `flush`, `SaveSearchButton` — qui vit hors du panneau et lit l'URL — enregistrerait
    // la recherche d'AVANT la frappe.
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({ city: 'Saly', page: 1 }, { continu: true });
  });

  it("AC7g — le commit différé appelle la DERNIÈRE version de `onFilterChange`, pas celle de la frappe", async () => {
    const ancien = vi.fn();
    const props = (onFilterChange: (patch: Partial<SearchFilters>) => void) => (
      <FilterSidebar
        filters={{}}
        onFilterChange={onFilterChange}
        onReset={() => {}}
        activeCount={0}
        open={false}
        onClose={() => {}}
        debounceMs={20}
      />
    );
    const { rerender } = render(withIntl(props(ancien)));

    frappe(screen.getByPlaceholderText(PLACEHOLDER_VILLE), 'Dakar');

    // `PropertiesDiscoveryPage` reconstruit `handleFilterChange` à chaque rendu, en fermant sur
    // `filters`. Un `setTimeout(fn, delay)` naïf appellerait la version de l'instant de la frappe
    // — donc les `filters` d'AVANT — et un `contract_type` posé entre-temps serait effacé.
    const nouveau = vi.fn();
    rerender(withIntl(props(nouveau)));

    await waitFor(() => expect(nouveau).toHaveBeenCalledTimes(1));
    expect(nouveau).toHaveBeenCalledWith({ city: 'Dakar', page: 1 }, { continu: true });
    expect(ancien).not.toHaveBeenCalled();
  });

  it("AC7f — le brouillon se resynchronise quand `filters` change vraiment (retour arrière)", () => {
    const onFilterChange = vi.fn();
    const { rerender } = render(
      withIntl(
        <FilterSidebar
          filters={{ city: 'Dakar' }}
          onFilterChange={onFilterChange}
          onReset={() => {}}
          activeCount={1}
          open={false}
          onClose={() => {}}
          debounceMs={20}
        />,
      ),
    );
    const ville = screen.getByPlaceholderText(PLACEHOLDER_VILLE) as HTMLInputElement;
    expect(ville.value).toBe('Dakar');

    fireEvent.change(ville, { target: { value: 'Mbo' } });
    expect(ville.value).toBe('Mbo');

    rerender(
      withIntl(
        <FilterSidebar
          filters={{}}
          onFilterChange={onFilterChange}
          onReset={() => {}}
          activeCount={0}
          open={false}
          onClose={() => {}}
          debounceMs={20}
        />,
      ),
    );
    expect(ville.value).toBe('');
  });
});
