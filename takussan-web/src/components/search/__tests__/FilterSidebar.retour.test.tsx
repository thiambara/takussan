import { StrictMode, useEffect, useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';
import { countActiveFilters, filtersFromSearchParams, filtersToParams } from '@/hooks/useSearch';
import type { SearchFilters } from '@/types/search';

/**
 * TCK-556 — le tiroir de filtres mobile face au geste retour, à son compte et à la recherche libre.
 *
 * ## Pourquoi un banc qui écrit dans le VRAI historique de jsdom
 *
 * Le défaut est une propriété de l'historique, pas d'un appel : « deux puces, un retour, et le
 * tiroir est toujours là avec un filtre en moins ». Un `onFilterChange` moqué ne verrait jamais
 * cela — il n'y a pas d'historique derrière. Le banc reproduit donc ce que font
 * `PropertiesDiscoveryPage` + `useSearch` + le routeur de Next, et rien de plus :
 *
 * - les filtres affichés sont LUS dans `location.search` (comme `useSearchParams`) ;
 * - un commit discret EMPILE (`pushState`), un commit `continu` ÉCRASE (`replaceState`) —
 *   la taxonomie de TCK-335, étape 5 ;
 * - l'état d'historique est RECOPIÉ à chaque écriture, comme le fait le routeur App
 *   (`preserveCustomHistoryState`, cf. `app-router.js`) ;
 * - `popstate` relit l'URL, comme la traversée du routeur.
 *
 * L'écouteur `popstate` du banc est posé au montage, AVANT celui du tiroir — le même ordre que
 * celui du routeur de Next, monté bien avant qu'on ouvre un tiroir.
 */

function Banc({
  total,
  ouvertAuDepart = false,
}: {
  readonly total?: number | null;
  readonly ouvertAuDepart?: boolean;
}) {
  const [recherche, setRecherche] = useState(() => window.location.search);
  const [open, setOpen] = useState(ouvertAuDepart);

  useEffect(() => {
    const surRetour = () => setRecherche(window.location.search);
    window.addEventListener('popstate', surRetour);
    return () => window.removeEventListener('popstate', surRetour);
  }, []);

  const filters = filtersFromSearchParams(new URLSearchParams(recherche));

  const onFilterChange = (patch: Partial<SearchFilters>, options?: { continu?: boolean }) => {
    const qs = filtersToParams({ ...filters, ...patch, page: 1 }).toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    const etat = { ...((window.history.state as Record<string, unknown> | null) ?? {}) };
    if (options?.continu) window.history.replaceState(etat, '', url);
    else window.history.pushState(etat, '', url);
    setRecherche(window.location.search);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir les filtres
      </button>
      <FilterSidebar
        filters={filters}
        onFilterChange={onFilterChange}
        onReset={() => {
          // `resetFilters` de `useSearch` : retour à la page nue, EMPILÉ (TCK-335).
          window.history.pushState(
            { ...((window.history.state as Record<string, unknown> | null) ?? {}) },
            '',
            window.location.pathname,
          );
          setRecherche(window.location.search);
        }}
        activeCount={countActiveFilters(filters)}
        open={open}
        onClose={() => setOpen(false)}
        total={total}
        debounceMs={20}
      />
    </>
  );
}

const tiroir = () => screen.getByRole('dialog');
const ouvrir = () => fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les filtres' }));
const puceDuTiroir = (nom: string) => within(tiroir()).getByRole('button', { name: nom });
const types = () => new URLSearchParams(window.location.search).get('type');

/**
 * jsdom traverse l'historique dans une tâche ultérieure. Tiroir ouvert, un retour en déclenche
 * DEUX (le retour, puis l'avance que demande le tiroir) : attendre un seul `popstate` rendrait la
 * main au milieu. On laisse donc passer quelques tâches, puis les assertions attendent l'état
 * final par `waitFor`.
 */
async function retour() {
  window.history.back();
  await new Promise((r) => setTimeout(r, 30));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/properties');
});

describe('TCK-556 · AC1 — tiroir ouvert, le retour ferme le tiroir et garde les filtres', () => {
  it('deux puces puis retour : tiroir fermé, `type=villa,house` toujours dans l’URL', async () => {
    render(withIntl(<Banc />));
    ouvrir();
    fireEvent.click(puceDuTiroir('Villa'));
    fireEvent.click(puceDuTiroir('Maison'));
    expect(types()).toBe('villa,house');

    await retour();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(types()).toBe('villa,house'));
  });

  it('tient aussi sous StrictMode (effets montés, démontés, remontés)', async () => {
    window.history.pushState({}, '', '/properties?bedrooms=2');
    render(<StrictMode>{withIntl(<Banc />)}</StrictMode>);
    ouvrir();
    // Le double montage ne doit ni fermer le tiroir, ni laisser deux entrées sentinelles.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(puceDuTiroir('Villa'));

    await retour();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(types()).toBe('villa'));
    // Un seul retour de plus défait la séance du tiroir…
    await retour();
    await waitFor(() => expect(window.location.search).toBe('?bedrooms=2'));
    // … et le suivant défait le filtre d'AVANT le tiroir : aucune seconde sentinelle, posée par
    // le remontage, ne s'intercale comme un appui perdu.
    await retour();
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('les gestes posés tiroir ouvert n’empilent pas une entrée chacun', () => {
    // `history.length` ne sert pas de témoin ici : jsdom garde l'historique d'un test à l'autre,
    // et un `pushState` depuis une entrée du milieu TRONQUE l'avant — le compte peut stagner
    // alors qu'on empile. On compte donc les écritures elles-mêmes.
    render(withIntl(<Banc />));
    ouvrir();
    const empile = vi.spyOn(window.history, 'pushState');
    try {
      fireEvent.click(puceDuTiroir('Villa'));
      fireEvent.click(puceDuTiroir('Maison'));
      fireEvent.click(puceDuTiroir('Vente'));
      expect(empile).not.toHaveBeenCalled();
      expect(types()).toBe('villa,house');
    } finally {
      empile.mockRestore();
    }
  });

  it('après la fermeture par le retour, un retour de plus défait la séance du tiroir d’un coup', async () => {
    window.history.pushState({}, '', '/properties?bedrooms=2');
    render(withIntl(<Banc />));
    ouvrir();
    fireEvent.click(puceDuTiroir('Villa'));
    fireEvent.click(puceDuTiroir('Maison'));

    await retour();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(types()).toBe('villa,house'));

    await retour();
    await waitFor(() => expect(window.location.search).toBe('?bedrooms=2'));
  });

  it('fermé par son bouton SANS changement, le tiroir ne laisse aucune entrée fantôme', async () => {
    window.history.pushState({}, '', '/properties?bedrooms=2');
    render(withIntl(<Banc />));
    ouvrir();
    fireEvent.click(within(tiroir()).getByRole('button', { name: 'Fermer les filtres' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Le tiroir rend son entrée : attendre que ce retour-là ait eu lieu avant d'en jouer un autre.
    await new Promise((r) => setTimeout(r, 50));

    // Le retour suivant défait le filtre posé AVANT le tiroir — pas un appui perdu.
    await retour();
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('fermé par « Voir … » APRÈS changement, un retour défait la séance du tiroir', async () => {
    render(withIntl(<Banc total={48} />));
    ouvrir();
    fireEvent.click(puceDuTiroir('Villa'));
    fireEvent.click(within(tiroir()).getByRole('button', { name: 'Voir 48 biens' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(types()).toBe('villa');

    await retour();
    await waitFor(() => expect(types()).toBeNull());
  });
  it('le retour ne navigue pas : il revient en avant sur l’entrée de la séance', async () => {
    // Mesuré au navigateur sur la première version : le tiroir ré-inscrivait la séance par un
    // `push`, après que le routeur avait restauré l'entrée d'avant le tiroir — la liste affichait
    // l'état d'avant 270 à 510 ms (aller-retour RSC), et relançait deux recherches.
    window.history.pushState({}, '', '/properties?bedrooms=2');
    render(withIntl(<Banc />));
    ouvrir();
    fireEvent.click(puceDuTiroir('Villa'));
    const empile = vi.spyOn(window.history, 'pushState');
    try {
      await retour();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(types()).toBe('villa'));
      await new Promise((r) => setTimeout(r, 50));
      expect(types()).toBe('villa');
      expect(empile).not.toHaveBeenCalled();
    } finally {
      empile.mockRestore();
    }
  });

  it('un brouillon encore en attente d’anti-rebond est gardé, sur l’entrée de la séance', async () => {
    window.history.pushState({}, '', '/properties?bedrooms=2');
    render(withIntl(<Banc />));
    ouvrir();
    // Frappé, pas encore commité : l'anti-rebond (20 ms ici) n'a pas expiré au moment du retour.
    fireEvent.change(within(tiroir()).getByPlaceholderText('Ville (ex : Dakar, Mbour…)'), {
      target: { value: 'Saly' },
    });
    expect(new URLSearchParams(window.location.search).has('city')).toBe(false);

    await retour();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('city')).toBe('Saly'));
    // Commité sur l'entrée de la SÉANCE : l'entrée d'avant le tiroir est intacte, un retour y mène.
    await retour();
    await waitFor(() => expect(window.location.search).toBe('?bedrooms=2'));
  });

  it('« Tout effacer » tiroir ouvert, puis retour : tiroir fermé, les filtres restent effacés', async () => {
    // Relecture de la reprise : la réinitialisation passait par `onReset`, donc EMPILAIT
    // au-dessus de la sentinelle, et le retour ré-inscrivait l'état d'AVANT l'effacement —
    // le geste retour défaisait « Tout effacer » au lieu de seulement fermer le tiroir.
    window.history.pushState({}, '', '/properties?bedrooms=2');
    render(withIntl(<Banc />));
    ouvrir();
    fireEvent.click(puceDuTiroir('Villa'));
    fireEvent.click(within(tiroir()).getByRole('button', { name: /Tout effacer/ }));
    expect(types()).toBeNull();

    await retour();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 50));
    expect(types()).toBeNull();
    expect(new URLSearchParams(window.location.search).has('bedrooms')).toBe(false);
  });
});

describe('TCK-556 · AC2 — tiroir fermé, le comportement de TCK-335 est inchangé', () => {
  it('une puce du panneau empile, et le retour la défait', async () => {
    window.history.pushState({}, '', '/properties?bedrooms=2');
    render(withIntl(<Banc />));
    // Tiroir fermé : seul le panneau latéral (desktop) est monté.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Villa' }));
    expect(types()).toBe('villa');

    // Empilé : le retour revient à `bedrooms=2`. Écrasé, il serait allé jusqu'à `/properties`.
    await retour();
    await waitFor(() => expect(window.location.search).toBe('?bedrooms=2'));
  });
});

describe('TCK-556 · AC3 — le bouton de pied porte le compte', () => {
  it('annonce le total, au pluriel comme au singulier', () => {
    const { rerender } = render(withIntl(<Banc total={140} ouvertAuDepart />));
    expect(within(tiroir()).getByRole('button', { name: 'Voir 140 biens' })).toBeInTheDocument();
    rerender(withIntl(<Banc total={1} ouvertAuDepart />));
    expect(within(tiroir()).getByRole('button', { name: 'Voir 1 bien' })).toBeInTheDocument();
  });

  it('a un libellé propre au cas zéro', () => {
    render(withIntl(<Banc total={0} ouvertAuDepart />));
    expect(within(tiroir()).getByRole('button', { name: 'Aucun bien ne correspond' })).toBeInTheDocument();
  });

  it('retombe sur « Voir les résultats » quand le total n’est pas connu (chargement, erreur)', () => {
    render(withIntl(<Banc total={null} ouvertAuDepart />));
    expect(within(tiroir()).getByRole('button', { name: 'Voir les résultats' })).toBeInTheDocument();
  });
});

describe('TCK-556 · AC4 — la recherche libre est rappelée en tête du tiroir', () => {
  it('affiche « Dakar » avant la première section, et le retrait efface `q` sans toucher « Ville »', async () => {
    window.history.replaceState(null, '', '/properties?q=Dakar');
    render(withIntl(<Banc ouvertAuDepart />));

    const rappel = within(tiroir()).getByRole('button', { name: 'Retirer la recherche « Dakar »' });
    const premiereSection = within(tiroir()).getByRole('heading', { name: 'Type de transaction' });
    // En TÊTE : avant la première section du tiroir.
    expect(rappel.compareDocumentPosition(premiereSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(tiroir()).getByPlaceholderText('Ville (ex : Dakar, Mbour…)')).toHaveValue('');

    fireEvent.click(rappel);

    expect(new URLSearchParams(window.location.search).has('q')).toBe(false);
    await waitFor(() =>
      expect(within(tiroir()).queryByRole('button', { name: /Retirer la recherche/ })).not.toBeInTheDocument(),
    );
    expect(within(tiroir()).getByPlaceholderText('Ville (ex : Dakar, Mbour…)')).toHaveValue('');
  });

  it('n’affiche aucun rappel sans recherche libre', () => {
    render(withIntl(<Banc ouvertAuDepart />));
    expect(within(tiroir()).queryByRole('button', { name: /Retirer la recherche/ })).not.toBeInTheDocument();
  });
});
