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
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-478 — ce qui a été remesuré ici, et ce qui n'a PAS été touché
 *
 * Ce fichier figurait au relevé de TCK-478 pour ses deux `waitFor` sans borne locale. Ses
 * assertions négatives, elles, ne portent PAS le motif de TCK-451, et il faut le dire pour que
 * personne ne vienne les « corriger » : {@link frappe} enchaîne ses `fireEvent.change` dans une
 * seule et même tâche, sans un `await` entre eux. Aucune macro-tâche ne s'intercale, donc aucun
 * `setTimeout` ne peut échoir pendant la frappe — `expect(onFilterChange).not.toHaveBeenCalled()`
 * est vrai par construction, et non par marge. C'est précisément ce patron que TCK-478 a repris
 * pour les deux écrans qui, eux, frappaient par `await user.type`.
 *
 * Restaient les deux attentes réelles, sur le seul budget GLOBAL de 3000 ms
 * (`asyncUtilTimeout`, TCK-313) : elles portent désormais {@link BUDGET_DES_ATTENTES_REELLES}.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * La borne locale des deux attentes réelles de ce fichier (TCK-478).
 *
 * La fenêtre injectée ici vaut 20 ms — deux ordres de grandeur sous celle de la console. 2000 ms
 * lui laissent un facteur **100**, très au-dessus des facteurs de contention 11,6-16,7× mesurés
 * par TCK-312, et au-dessus du pire cas d'attente jamais relevé sur cette suite (4853 ms sous
 * `load average` 331 — mais sur une fenêtre de 300 ms, soit 16× celle-ci).
 *
 * Elle est DÉLIBÉRÉMENT plus serrée que le défaut global de 3000 ms : une borne locale ne sert à
 * rien si elle se contente de recopier le global. Ce qu'elle apporte est de rendre la marge
 * lisible à côté de la fenêtre qu'elle borne, et de ne plus dépendre d'un réglage qui vit dans
 * `vitest.setup.ts` et qu'un autre ticket peut resserrer sans voir ce fichier.
 */
const BUDGET_DES_ATTENTES_REELLES = 2_000;

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

    await waitFor(() => expect(onFilterChange).toHaveBeenCalledTimes(1), {
      timeout: BUDGET_DES_ATTENTES_REELLES,
    });
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

    await waitFor(() => expect(nouveau).toHaveBeenCalledTimes(1), {
      timeout: BUDGET_DES_ATTENTES_REELLES,
    });
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

/**
 * TCK-346 — le rayon est CÂBLÉ au panneau, pas seulement écrit à côté.
 *
 * Le composant `AutourDeMoi` a ses propres tests ; celui-ci ne garde qu'une chose, et c'est
 * celle qui manquerait le plus : que son `onChange` arrive bien sur `onFilterChange`, avec le
 * brouillon de saisie en cours FUSIONNÉ. Sans cette fusion, poser sa position pendant qu'on
 * tape « Dakar » efface la ville — le défaut que `set()` existe pour éviter, et qu'une
 * nouvelle section branchée à côté de lui réintroduirait.
 */
describe('<FilterSidebar> — la commande « Autour de moi » (TCK-346)', () => {
  function geolocalisationQuiRepond() {
    return {
      getCurrentPosition: vi.fn((ok: PositionCallback) =>
        ok({ coords: { latitude: 14.6928, longitude: -17.4467 }, timestamp: 0 } as unknown as GeolocationPosition)),
    };
  }

  function monteAvecGeo(filters: SearchFilters = {}) {
    const onFilterChange = vi.fn();
    render(
      withIntl(
        <FilterSidebar
          filters={filters}
          onFilterChange={onFilterChange}
          onReset={vi.fn()}
          activeCount={0}
          open={false}
          onClose={() => {}}
          debounceMs={20}
          geolocalisation={geolocalisationQuiRepond()}
        />,
      ),
    );
    return { onFilterChange };
  }

  it('transmet le point et le rayon à `onFilterChange`', () => {
    const { onFilterChange } = monteAvecGeo();

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser ma position' }));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 14.6928, lng: -17.4467, radius_km: 5 }),
    );
  });

  it('n’EFFACE PAS la ville en cours de frappe', () => {
    const { onFilterChange } = monteAvecGeo();
    frappe(screen.getByPlaceholderText(PLACEHOLDER_VILLE), 'Dakar');

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser ma position' }));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Dakar', lat: 14.6928 }),
    );
  });

  it('affiche le choix du rayon dès qu’un point existe', () => {
    monteAvecGeo({ lat: 14.6928, lng: -17.4467, radius_km: 10 });
    expect(screen.getByRole('button', { name: '10 km' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2 km' })).toHaveAttribute('aria-pressed', 'false');
  });
});

/**
 * Le panneau ne porte PLUS de champ de saisie pour `q` : la seule entrée est la barre de
 * navigation, qui écrit le paramètre d'URL. Le panneau ne fait que montrer le terme en vigueur et
 * permettre de le retirer. Un second champ pour le même paramètre était une duplication.
 */
describe('<FilterSidebar> — le mot-clé `q` se lit, il ne se saisit plus ici', () => {
  it('sans `q`, aucune section « Mots-clés » et aucun champ de saisie plein-texte', () => {
    monte({});
    expect(screen.queryByText('Mots-clés')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Mot-clé, référence/)).not.toBeInTheDocument();
  });

  it('avec `q`, affiche le terme tel quel et le retire en un clic, sans autre patch', () => {
    const { onFilterChange } = monte({ q: 'villa piscine' });
    expect(screen.getByText('Mots-clés')).toBeInTheDocument();
    expect(screen.getByText('villa piscine')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /mot-clé/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche « villa piscine »' }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({ q: undefined, page: 1 });
  });
});
