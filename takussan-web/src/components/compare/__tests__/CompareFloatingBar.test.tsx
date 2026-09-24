import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { CompareFloatingBar } from '../CompareFloatingBar';
import { CompareProvider, useCompare } from '@/context/CompareContext';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { COMPARE_STORAGE_KEY, type ComparePreview } from '@/lib/compare';
import messages from '@/messages/fr.json';

/**
 * ⚠ Le substitut RÉÉMET TOUTES ses props, et ce n'est pas de la commodité. La version
 * précédente en énumérait quatre : `tabIndex` n'en faisait pas partie, et une assertion sur
 * le retrait du parcours de tabulation lisait `null` sur un composant qui posait bien
 * l'attribut. *Un substitut qui filtre les props mesure le substitut.*
 */
/** Le chemin courant — la barre se comporte autrement sur `/compare` et sur la liste. */
let cheminCourant = '/fr';
vi.mock('next/navigation', () => ({
  usePathname: () => cheminCourant,
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * `next/image` demande une configuration de chargeur que jsdom n'a pas. Le substitut rend
 * un `<img>` NU — ce qui suffit : ce fichier garde ce que la barre AFFICHE, pas ce que
 * l'optimiseur de Next en fait.
 */
vi.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- c'est le SUBSTITUT de next/image.
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const APERCU: Record<number, ComparePreview> = {
  10: { title: 'Villa à Ngor', slug: 'villa-ngor', photo: 'https://placehold.co/80' },
  20: { title: 'Duplex aux Almadies', slug: 'duplex-almadies', photo: null },
};

/**
 * La sélection est SEMÉE DANS LE STOCKAGE, jamais par des `add()` successifs : `add` se
 * referme sur les ids de son rendu, si bien qu'une boucle dans un seul effet n'en ajoute
 * qu'un. Semer par le stockage exerce en prime le chemin de lecture réel — celui d'un
 * visiteur qui change de page avec une sélection en cours.
 */
function semer(ids: readonly number[], previews?: Record<number, ComparePreview>) {
  localStorage.setItem(
    COMPARE_STORAGE_KEY,
    JSON.stringify({
      ids: [...ids],
      previews: Object.fromEntries(ids.filter((id) => previews?.[id]).map((id) => [id, previews![id]])),
      updated_at: Date.now(),
    }),
  );
}

function wrap(ids: readonly number[], previews?: Record<number, ComparePreview>) {
  semer(ids, previews);
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      {/* Comme dans le layout public : la barre émet un toast (« Annuler » après « Vider »). */}
      <ToastProvider>
        <CompareProvider>
          <CompareFloatingBar />
        </CompareProvider>
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

describe('<CompareFloatingBar>', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    cheminCourant = '/fr';
  });

  it('is hidden when the selection is empty', () => {
    render(wrap([]));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('renders the count and CTA once ids are selected', async () => {
    render(wrap([1, 2]));
    await screen.findByRole('complementary');
    expect(screen.getByText(/Comparer \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 biens sélectionnés sur 4/)).toBeInTheDocument();
  });

  it('links to /compare?ids=... when 2+ ids are selected', async () => {
    render(wrap([3, 4]));
    const link = (await screen.findByText(/Comparer \(2\)/)).closest('a');
    // TCK-434 : le lien porte la langue. `LienLocalise` la pose depuis le contexte next-intl —
    // la chaîne de requête traverse intacte, ce qui est le point que ce test garde vraiment.
    expect(link).toHaveAttribute('href', '/fr/compare?ids=3,4');
  });

  /**
   * Le bouton grisé DIT ce qui manque au lieu d'être une impasse silencieuse — et il ne
   * doit pas être atteignable au clavier, sans quoi la tabulation s'arrête sur un lien
   * qui ne mène nulle part.
   */
  it('annonce la condition manquante — et se retire du parcours — sous 2 biens', async () => {
    render(wrap([5]));
    const cta = (await screen.findByText('Ajoutez un 2ᵉ bien')).closest('a')!;
    expect(cta).toHaveAttribute('aria-disabled', 'true');
    expect(cta).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByText(/Comparer \(1\)/)).not.toBeInTheDocument();
  });

  /**
   * LE POINT DE CE LOT : la barre montrait `#183`, l'identifiant de base. Elle montre
   * désormais la photo et le titre, et le nom accessible du bouton de retrait NOMME le bien.
   */
  it('montre la photo et le titre du bien, pas son identifiant de base', async () => {
    render(wrap([10, 20], APERCU));
    await screen.findByRole('complementary');

    const villa = screen.getByRole('button', { name: 'Retirer « Villa à Ngor » du comparateur' });
    expect(villa).toHaveAttribute('title', 'Villa à Ngor');
    expect(villa.querySelector('img')).toHaveAttribute('src', 'https://placehold.co/80');

    // Sans photo, le repli est l'INITIALE du titre — jamais un identifiant.
    const duplex = screen.getByRole('button', { name: 'Retirer « Duplex aux Almadies » du comparateur' });
    expect(duplex).toHaveTextContent('D');

    expect(screen.queryByText('#10')).not.toBeInTheDocument();
    expect(screen.queryByText('#20')).not.toBeInTheDocument();
  });

  /**
   * Le repli par identifiant reste EXERCÉ : une sélection venue d'une URL partagée n'a
   * aucun aperçu, et quatre boutons homonymes seraient indistinguables à la voix.
   */
  it('retombe sur l’identifiant quand aucun aperçu n’a été gardé', async () => {
    render(wrap([7, 8]));
    await screen.findByRole('complementary');
    expect(
      screen.getByRole('button', { name: /Retirer le bien #7 du comparateur/i }),
    ).toBeInTheDocument();
  });

  it('removes a bien when clicking its thumbnail', async () => {
    const user = userEvent.setup();
    render(wrap([10, 20], APERCU));
    await screen.findByRole('complementary');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Retirer « Villa à Ngor » du comparateur' }));
    });

    expect(
      screen.queryByRole('button', { name: 'Retirer « Villa à Ngor » du comparateur' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retirer « Duplex aux Almadies » du comparateur' }),
    ).toBeInTheDocument();
  });

  it('clears the whole comparator via the clear button', async () => {
    const user = userEvent.setup();
    render(wrap([1, 2, 3]));
    await screen.findByRole('complementary');

    const clearBtn = screen.getByRole('button', { name: /Vider le comparateur/i });
    await act(async () => {
      await user.click(clearBtn);
    });

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});

/** Les ids en stockage — ce que la sélection EST, indépendamment de ce que la barre affiche. */
function idsEnStockage(): number[] {
  const brut = localStorage.getItem(COMPARE_STORAGE_KEY);
  return brut ? (JSON.parse(brut) as { ids: number[] }).ids : [];
}

/**
 * TCK-561 — retour testeur du 2026-09-23 : « le modal de comparaison est têtu : il est toujours
 * là, et quand tu le fermes il efface tout » (M6), et « il y a des “+” mais quand tu cliques ça ne
 * fait aucune action » (M5).
 */
describe('<CompareFloatingBar> — réduire n’est pas vider (TCK-561)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    cheminCourant = '/fr';
  });

  it('le bouton de l’en-tête RÉDUIT la barre sans toucher à la sélection, et la rouvre', async () => {
    const user = userEvent.setup();
    render(wrap([10, 20], APERCU));
    await screen.findByRole('complementary');

    const reduire = screen.getByRole('button', { name: 'Réduire le comparateur' });
    expect(reduire).toHaveAttribute('aria-expanded', 'true');
    await act(async () => {
      await user.click(reduire);
    });

    // La sélection est INTACTE — c'était tout le défaut.
    expect(idsEnStockage()).toEqual([10, 20]);
    // La barre est rangée : plus de vignettes ni d'appel à l'action, une pastille qui la rouvre.
    expect(screen.queryByRole('button', { name: /Retirer « Villa à Ngor »/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Comparer \(2\)/)).not.toBeInTheDocument();
    const deplier = screen.getByRole('button', { name: /Afficher le comparateur — 2 biens sélectionnés/ });
    expect(deplier).toHaveAttribute('aria-expanded', 'false');
    // Le focus suit : le bouton activé a disparu, le clavier ne retombe pas sur <body>.
    expect(deplier).toHaveFocus();

    await act(async () => {
      await user.click(deplier);
    });
    expect(screen.getByText(/Comparer \(2\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réduire le comparateur' })).toHaveFocus();
  });

  it('l’état réduit suit le visiteur d’une page à l’autre (remontage)', async () => {
    const user = userEvent.setup();
    const { unmount } = render(wrap([10, 20], APERCU));
    await act(async () => {
      await user.click(await screen.findByRole('button', { name: 'Réduire le comparateur' }));
    });
    unmount();

    render(wrap([10, 20], APERCU));
    expect(
      await screen.findByRole('button', { name: /Afficher le comparateur/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Comparer \(2\)/)).not.toBeInTheDocument();
  });

  it('vider est une action DISTINCTE, libellée — et réversible par « Annuler »', async () => {
    const user = userEvent.setup();
    render(wrap([10, 20], APERCU));
    await screen.findByRole('complementary');

    const vider = screen.getByRole('button', { name: 'Vider le comparateur' });
    // Libellée en toutes lettres, pas une croix muette.
    expect(vider).toHaveTextContent('Vider');
    expect(vider).not.toBe(screen.getByRole('button', { name: 'Réduire le comparateur' }));

    await act(async () => {
      await user.click(vider);
    });
    expect(idsEnStockage()).toEqual([]);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    await screen.findByText('Comparateur vidé');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Annuler' }));
    });

    // La sélection revient, APERÇUS compris : la vignette nomme toujours le bien.
    expect(idsEnStockage()).toEqual([10, 20]);
    expect(
      await screen.findByRole('button', { name: 'Retirer « Villa à Ngor » du comparateur' }),
    ).toBeInTheDocument();
  });

  it('le premier emplacement libre est une ACTION : ouvrir la liste (hors de la liste)', async () => {
    render(wrap([10, 20], APERCU));
    await screen.findByRole('complementary');

    const ajouter = screen.getByRole('link', { name: 'Ajouter un bien : voir les annonces' });
    expect(ajouter).toHaveAttribute('href', '/fr/properties');
    // Un seul « + » actionnable : les autres emplacements ne promettent plus rien.
    expect(screen.getAllByRole('link', { name: /Ajouter un bien/ })).toHaveLength(1);
  });

  it('sur la liste, l’emplacement libre RANGE la barre — les biens sont derrière elle', async () => {
    cheminCourant = '/fr/properties';
    const user = userEvent.setup();
    render(wrap([10, 20], APERCU));
    await screen.findByRole('complementary');

    await act(async () => {
      await user.click(
        screen.getByRole('button', { name: 'Ajouter un bien : choisissez-le dans la liste' }),
      );
    });
    expect(screen.getByRole('button', { name: /Afficher le comparateur/ })).toBeInTheDocument();
    expect(idsEnStockage()).toEqual([10, 20]);
  });
});

/**
 * Un bouton hors de la barre qui ajoute un bien AVEC son aperçu — comme une carte de la liste.
 * Il lit `add` du rendu courant : c'est un geste du visiteur entre « Vider » et « Annuler ».
 */
function Ajouteur({ id, apercu }: { readonly id: number; readonly apercu: ComparePreview }) {
  const { add } = useCompare();
  return (
    <button type="button" onClick={() => add(id, apercu)}>
      {`ajouter-${id}`}
    </button>
  );
}

function wrapAvecAjouts(
  ids: readonly number[],
  previews: Record<number, ComparePreview>,
  ajouts: readonly (readonly [number, ComparePreview])[],
) {
  semer(ids, previews);
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      <ToastProvider>
        <CompareProvider>
          <main>
            {ajouts.map(([id, apercu]) => (
              <Ajouteur key={id} id={id} apercu={apercu} />
            ))}
          </main>
          <CompareFloatingBar />
        </CompareProvider>
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

const FANN: ComparePreview = { title: 'Studio à Fann', slug: 'studio-fann', photo: null };
const MERMOZ: ComparePreview = { title: 'Loft à Mermoz', slug: 'loft-mermoz', photo: null };

/**
 * TCK-561, restes de la vérification : « Annuler » restaurait un INSTANTANÉ par `replace()` — un
 * bien ajouté entre « Vider » et « Annuler » était écrasé sans un mot ; et après « Vider » la barre
 * disparaissait avec le bouton qui avait le focus : le clavier retombait sur `<body>`.
 */
describe('<CompareFloatingBar> — « Annuler » rétablit sans écraser, et le focus a un lieu (TCK-561)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    cheminCourant = '/fr';
  });

  it('un bien ajouté entre « Vider » et « Annuler » est GARDÉ, aperçu compris', async () => {
    const user = userEvent.setup();
    render(wrapAvecAjouts([10, 20], APERCU, [[30, FANN]]));
    await screen.findByRole('complementary');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Vider le comparateur' }));
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'ajouter-30' }));
    });
    expect(idsEnStockage()).toEqual([30]);

    await act(async () => {
      await user.click(await screen.findByRole('button', { name: 'Annuler' }));
    });

    expect(idsEnStockage()).toEqual([10, 20, 30]);
    // Les aperçus des DEUX origines : l'instantané (Ngor) et l'ajout (Fann).
    expect(
      await screen.findByRole('button', { name: 'Retirer « Villa à Ngor » du comparateur' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer « Studio à Fann » du comparateur' })).toBeInTheDocument();
  });

  it('au-delà de quatre, l’ajout récent gagne — et ce qui n’a pas pu revenir est DIT', async () => {
    const user = userEvent.setup();
    const trois = { ...APERCU, 40: { title: 'Terrain à Diamniadio', slug: 'terrain-diamniadio', photo: null } };
    render(wrapAvecAjouts([10, 20, 40], trois, [[30, FANN], [50, MERMOZ]]));
    await screen.findByRole('complementary');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Vider le comparateur' }));
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'ajouter-30' }));
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'ajouter-50' }));
    });
    await act(async () => {
      await user.click(await screen.findByRole('button', { name: 'Annuler' }));
    });

    // Les deux choix récents restent ; l'instantané revient dans la place qui reste, dans son ordre.
    expect(idsEnStockage()).toEqual([10, 20, 30, 50]);
    expect(await screen.findByText(/1 bien n’a pas pu être rétabli/)).toBeInTheDocument();
  });

  it('après « Vider », le focus passe à « Annuler » — pas à <body>', async () => {
    const user = userEvent.setup();
    render(wrapAvecAjouts([10, 20], APERCU, []));
    await screen.findByRole('complementary');

    screen.getByRole('button', { name: 'Vider le comparateur' }).focus();
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    expect(idsEnStockage()).toEqual([]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus());
  });

  it('« Annuler » rend le focus à la barre revenue, sur « Vider »', async () => {
    const user = userEvent.setup();
    render(wrapAvecAjouts([10, 20], APERCU, []));
    await screen.findByRole('complementary');

    screen.getByRole('button', { name: 'Vider le comparateur' }).focus();
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus());
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    expect(idsEnStockage()).toEqual([10, 20]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Vider le comparateur' })).toHaveFocus(),
    );
  });

  it('le toast fermé SANS annuler, le focus va au contenu principal — pas à <body>', async () => {
    const user = userEvent.setup();
    render(wrapAvecAjouts([10, 20], APERCU, []));
    await screen.findByRole('complementary');

    screen.getByRole('button', { name: 'Vider le comparateur' }).focus();
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus());
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Fermer la notification' }));
    });
    await waitFor(() => expect(document.querySelector('main')).toHaveFocus());
    expect(idsEnStockage()).toEqual([]);
  });
});

/** Le nom de l'élément qui a le focus — `BODY` quand le clavier n'a plus de lieu. */
function focusCourant(): string {
  const el = document.activeElement;
  if (!el || el === document.body) return 'BODY';
  return el.getAttribute('aria-label') ?? el.textContent ?? el.tagName;
}

/** « Vider » au clavier, puis attendre que le focus soit passé à « Annuler ». */
async function viderAuClavier(user: ReturnType<typeof userEvent.setup>) {
  screen.getByRole('button', { name: 'Vider le comparateur' }).focus();
  await act(async () => {
    await user.keyboard('{Enter}');
  });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus());
}

/** Un geste du clavier sur un bouton nommé — le focus y passe d'abord, comme au Tab. */
async function activerAuClavier(user: ReturnType<typeof userEvent.setup>, nom: string) {
  screen.getByRole('button', { name: nom }).focus();
  await act(async () => {
    await user.keyboard('{Enter}');
  });
}

/**
 * TCK-561, vérification adverse de la réparation : le retour du focus sur « Vider » était porté
 * par un DRAPEAU consommé par un effet sur `[isVisible]` — qui ne s'exécute que sur un CHANGEMENT.
 * Un bien ajouté entre « Vider » et « Annuler » rend la barre visible AVANT le clic : l'effet ne
 * repart pas, le focus tombe (sur `<body>`, ou sur un autre toast qui part à son tour), et le
 * drapeau reste levé — la prochaine fois que la barre réapparaît (retour depuis `/compare`), elle
 * VOLE le focus. Un Entrée de plus, et la sélection est vidée.
 */
describe('<CompareFloatingBar> — le focus après « Annuler » ne dépend pas de l’histoire de la barre (TCK-561)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    cheminCourant = '/fr';
  });

  it('un bien ajouté entre « Vider » et « Annuler » : le focus revient quand même sur « Vider »', async () => {
    const user = userEvent.setup();
    render(wrapAvecAjouts([10, 20], APERCU, [[30, FANN]]));
    await screen.findByRole('complementary');

    await viderAuClavier(user);
    // La barre REVIENT avant « Annuler » : c'est ce qui court-circuitait l'effet sur `[isVisible]`.
    await activerAuClavier(user, 'ajouter-30');
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    await activerAuClavier(user, 'Annuler');

    expect(idsEnStockage()).toEqual([10, 20, 30]);
    await waitFor(() => expect(focusCourant()).toBe('Vider le comparateur'));
  });

  it('aucun vol de focus ensuite : la barre qui réapparaît (retour de /compare) laisse le focus où il est', async () => {
    const user = userEvent.setup();
    const arbre = () => wrapAvecAjouts([10, 20], APERCU, [[30, FANN]]);
    const { rerender } = render(arbre());
    await screen.findByRole('complementary');

    await viderAuClavier(user);
    await activerAuClavier(user, 'ajouter-30');
    await activerAuClavier(user, 'Annuler');
    expect(idsEnStockage()).toEqual([10, 20, 30]);

    // Le visiteur va ailleurs, puis sur `/compare` (la barre s'y cache) et revient.
    screen.getByRole('button', { name: 'ajouter-30' }).focus();
    cheminCourant = '/fr/compare';
    rerender(arbre());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    cheminCourant = '/fr/properties';
    rerender(arbre());
    await screen.findByRole('complementary');
    // Laisser passer effets et minuteurs : un vol de focus arriverait là.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(focusCourant()).toBe('ajouter-30');
    // Et donc un Entrée ne vide rien.
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    expect(idsEnStockage()).toEqual([10, 20, 30]);
  });

  it('la barre réduite entre-temps : « Annuler » rend le focus à la pastille, seul bouton qui reste', async () => {
    const user = userEvent.setup();
    render(wrapAvecAjouts([10, 20], APERCU, [[30, FANN]]));
    await screen.findByRole('complementary');

    await viderAuClavier(user);
    await activerAuClavier(user, 'ajouter-30');
    await activerAuClavier(user, 'Réduire le comparateur');
    await activerAuClavier(user, 'Annuler');

    expect(idsEnStockage()).toEqual([10, 20, 30]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Afficher le comparateur — 3 biens sélectionnés/ })).toHaveFocus(),
    );
  });

  it('« Annuler » quand la barre ne peut pas revenir (sur /compare) : le focus va au contenu principal', async () => {
    const user = userEvent.setup();
    const arbre = () => wrapAvecAjouts([10, 20], APERCU, []);
    const { rerender } = render(arbre());
    await screen.findByRole('complementary');

    await viderAuClavier(user);
    // Le visiteur ouvre le comparatif, le toast encore là : la barre n'y est jamais montrée.
    cheminCourant = '/fr/compare';
    rerender(arbre());
    await activerAuClavier(user, 'Annuler');

    expect(idsEnStockage()).toEqual([10, 20]);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('main')).toHaveFocus());
  });

  it('pendant « Annuler », le focus ne transite PAS par le contenu principal (un saut annoncé pour rien)', async () => {
    const user = userEvent.setup();
    render(wrapAvecAjouts([10, 20], APERCU, []));
    await screen.findByRole('complementary');

    await viderAuClavier(user);
    const principal = document.querySelector('main')!;
    const passages: string[] = [];
    principal.addEventListener('focus', () => passages.push('main'));
    await activerAuClavier(user, 'Annuler');

    await waitFor(() => expect(focusCourant()).toBe('Vider le comparateur'));
    // `closeToast` appelle `onClose` DANS le clic : sans la garde « annulé », il focaliserait
    // <main> — un lecteur d'écran l'annonce — avant que le focus ne reparte sur « Vider ».
    expect(passages).toEqual([]);
  });
});
