/**
 * La recherche et le filtre par ville des index de profils — TCK-436.
 *
 * Ce que ce fichier éprouve tient en une phrase : **le composant écrit dans l'URL, il ne filtre
 * rien.** C'est la règle du dépôt (filtrer côté serveur, jamais côté client sur une liste déjà
 * récupérée), et elle n'est observable que là — le composant ne reçoit aucune liste de profils, et
 * la seule chose qu'il puisse faire est de naviguer.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

const push = vi.fn();
let parametres = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => parametres,
  usePathname: () => '/fr/agencies',
}));

const { ProfileFilters } = await import('../ProfileFilters');

function monter(query = '') {
  parametres = new URLSearchParams(query);
  return render(
    withIntl(
      <ProfileFilters base="/agencies" villes={['Dakar', 'Thiès']} placeholderRecherche="Nom d’une agence" />,
    ),
  );
}

beforeEach(() => {
  push.mockReset();
});

describe('la recherche', () => {
  it('est un vrai formulaire — `Entrée` soumet, sans bouton (soumission implicite, TCK-2521)', async () => {
    // Le motif du formulaire de newsletter INERTE que TCK-437 vient de retirer du pied de page :
    // un champ sans `<form>` laisse le visiteur croire qu'il a cherché.
    const user = userEvent.setup();
    monter();

    expect(screen.getByRole('search')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'sahel{Enter}');

    expect(push).toHaveBeenCalledWith('/fr/agencies?q=sahel');
  });

  it('n’écrit pas une recherche vide dans l’URL', async () => {
    const user = userEvent.setup();
    monter('q=sahel');

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), '{Enter}');

    expect(push).toHaveBeenCalledWith('/fr/agencies');
  });

  it('rogne les espaces — « sahel » et «  sahel  » ne sont pas deux URL', async () => {
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByRole('searchbox'), '  sahel  {Enter}');

    expect(push).toHaveBeenCalledWith('/fr/agencies?q=sahel');
  });
});

describe('le filtre par ville', () => {
  it('rend la facette REÇUE, plus « toutes les villes » — aucune liste composée ici', async () => {
    monter();
    for (const libelle of ['Toutes', 'Dakar', 'Thiès']) {
      expect(screen.getByRole('button', { name: libelle })).toBeInTheDocument();
    }
  });

  it('ne rend RIEN quand la facette est vide — un filtre sans option est un décor', () => {
    parametres = new URLSearchParams();
    render(
      withIntl(<ProfileFilters base="/agencies" villes={[]} placeholderRecherche="x" />),
    );
    expect(screen.queryByRole('group', { name: 'Filtrer par ville' })).toBeNull();
  });

  it('écrit `city` et annonce l’état sélectionné', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: 'Dakar' }));
    expect(push).toHaveBeenCalledWith('/fr/agencies?city=Dakar');
  });

  it('un second clic sur la ville active la RETIRE', async () => {
    const user = userEvent.setup();
    monter('city=Dakar');

    expect(screen.getByRole('button', { name: 'Dakar' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Dakar' }));
    expect(push).toHaveBeenCalledWith('/fr/agencies');
  });
});

describe('la page est TOUJOURS remise à zéro', () => {
  it.each([
    ['une ville', 'Dakar', '/fr/agencies?city=Dakar'],
    ['toutes les villes', 'Toutes', '/fr/agencies'],
  ])('changer %s retire `page`', async (_cas, bouton, attendu) => {
    // Rester sur `?page=4` en changeant de critère donne une page vide sur un jeu de résultats
    // qui, lui, n'est pas vide — un « aucun résultat » faux.
    const user = userEvent.setup();
    monter('city=Thiès&page=4');

    await user.click(screen.getByRole('button', { name: bouton }));
    expect(push).toHaveBeenCalledWith(attendu);
  });

  it('chercher retire `page` aussi', async () => {
    const user = userEvent.setup();
    monter('page=7');

    await user.type(screen.getByRole('searchbox'), 'awa{Enter}');
    expect(push).toHaveBeenCalledWith('/fr/agencies?q=awa');
  });
});

describe('le retour en arrière', () => {
  // TCK-2521 (décision du 2026-11-09) — « effacer » ne paraît que sur une recherche par nom ; une
  // ville seule se défait par la puce « Toutes ». L'intention de TCK-436 tient : quel que soit le
  // filtre posé, une issue ramène à la liste entière.
  it('« effacer » n’apparaît que si une recherche par nom est posée, et il retire TOUS les critères', async () => {
    const { unmount } = monter();
    expect(screen.queryByRole('button', { name: /Effacer/ })).toBeNull();
    unmount();

    const user = userEvent.setup();
    monter('city=Dakar&q=awa&page=2');
    await user.click(screen.getByRole('button', { name: /Effacer/ }));

    expect(push).toHaveBeenCalledWith('/fr/agencies');
  });

  it('une ville seule : pas d’« effacer », et « Toutes » ramène à la liste entière', async () => {
    const user = userEvent.setup();
    monter('city=Dakar&page=3');

    expect(screen.queryByRole('button', { name: /Effacer/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Toutes' }));
    expect(push).toHaveBeenCalledWith('/fr/agencies');
  });
});

describe('les paramètres inconnus survivent à une navigation', () => {
  it('un paramètre de campagne n’est pas effacé par un changement de ville', async () => {
    const user = userEvent.setup();
    monter('utm_source=lettre');

    await user.click(screen.getByRole('button', { name: 'Thiès' }));
    expect(push).toHaveBeenCalledWith('/fr/agencies?utm_source=lettre&city=Thi%C3%A8s');
  });
});

/**
 * TCK-573 — l'annuaire à 320 px. Mesuré au navigateur avant correctif (CDP, 320 × 740, touch) : puces
 * de villes et « Effacer les filtres » à 36 px de haut ; champ de 168 px à côté de « Rechercher » en
 * toutes lettres (110 px), texte d'exemple coupé (« Nom d'un ager » : 178 px de texte pour 168).
 *
 * ⚠ jsdom ne calcule aucune mise en page : ces tests gardent le CONTRAT de classes. La mesure qui
 * dit qu'il produit 44 px et un texte entier est au navigateur, dans TCK-573.
 */
describe('TCK-573 — cibles tactiles et champ lisible à 320 px', () => {
  it('chaque puce de ville et « effacer » font 44 px au doigt, 36 à la souris', () => {
    monter('city=Dakar&q=awa');

    const cibles = [
      ...screen.getAllByRole('button', { pressed: true }),
      ...screen.getAllByRole('button', { pressed: false }),
      screen.getByRole('button', { name: 'Effacer les filtres' }),
    ];
    expect(cibles).toHaveLength(4);
    for (const cible of cibles) {
      expect(cible.className).toMatch(/(^|\s)min-h-11(\s|$)/);
      expect(cible.className).toMatch(/(^|\s)pointer-fine:min-h-9(\s|$)/);
      // Un `min-h-9` nu reprendrait le dessus sur le doigt.
      expect(cible.className).not.toMatch(/(^|\s)min-h-9(\s|$)/);
    }
  });

  // TCK-2521 (maquette D) — le bouton loupe est retiré : le champ prend toute la largeur (le texte
  // d'exemple coupé à 320 px venait du bouton à côté), garde son nom, et le clavier du téléphone
  // affiche « Rechercher » sur sa touche d'envoi.
  it('le champ seul tient la rangée : nommé, touche d’envoi « Rechercher », aucun bouton à côté', () => {
    monter();

    const champ = screen.getByRole('searchbox', { name: 'Nom d’une agence' });
    expect(champ).toHaveAttribute('enterkeyhint', 'search');
    const formulaire = screen.getByRole('search');
    expect(formulaire.querySelector('button')).toBeNull();
    expect(champ.parentElement!.className.split(/\s+/)).toContain('flex-1');
  });

  // Mesuré à 768 et 1024 px en émulation tactile : `md:h-10` seul ramenait champ et bouton à 40 px
  // sur une tablette. Les 40 px du bureau ne valent qu'à la souris.
  it('au-delà de `md`, le champ reste à 44 px, sans descendre à 40 px', () => {
    monter();

    const champ = screen.getByRole('searchbox');
    // TCK-2460 — le champ tient ses 44 px de la portée de densité, souris comprise.
    expect(champ.closest('[data-field-density="comfortable"]')).not.toBeNull();
    const classes = champ.className.split(/\s+/);
    expect(classes).not.toContain('md:pointer-fine:h-10');
    expect(classes).not.toContain('md:h-10');
  });
});

describe('TCK-2521 — la ville de l’URL allume sa puce, quelle que soit sa casse', () => {
  it('`?city=dakar` (AC3) allume « Dakar », et « Toutes les villes » s’éteint', () => {
    monter('city=dakar');
    expect(screen.getByRole('button', { name: 'Dakar' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Thiès' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('un second clic sur la puce allumée retire le filtre', async () => {
    const user = userEvent.setup();
    monter('city=dakar');
    await user.click(screen.getByRole('button', { name: 'Dakar' }));
    expect(push).toHaveBeenCalledWith('/fr/agencies');
  });
});

describe('TCK-2521 (revue) — la puce de la ville active est ramenée dans la rangée qui défile', () => {
  // jsdom ne calcule aucune mise en page : on pose les boîtes que le navigateur mesurait (390 px,
  // « Kaolack » à 940 px), et l'on regarde ce que le composant écrit dans `scrollLeft`.
  function boite(left: number, width: number) {
    return { left, right: left + width, width, top: 0, bottom: 44, height: 44, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
  }

  it('une ville hors de la vue : la rangée défile jusqu’à elle, centrée', () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.getAttribute('role') === 'group') return boite(0, 390);
      if (this.getAttribute('aria-pressed') === 'true') return boite(940, 80);
      return boite(0, 0);
    };
    try {
      monter('city=Thiès');
      const rangee = screen.getByRole('group', { name: 'Filtrer par ville' });
      // 940 − (390 − 80) / 2 = 785 : la puce au milieu de la rangée.
      expect(rangee.scrollLeft).toBe(785);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });

  it('une ville déjà visible : la rangée ne bouge pas', () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.getAttribute('role') === 'group') return boite(0, 390);
      // Visible (200 → 280 dans 0 → 390) — et pourtant décentrée : sans la garde, la rangée
      // défilerait de 45 px, déplaçant sous le doigt une puce qu'on voyait déjà.
      if (this.getAttribute('aria-pressed') === 'true') return boite(200, 80);
      return boite(0, 0);
    };
    try {
      monter('city=Dakar');
      expect(screen.getByRole('group', { name: 'Filtrer par ville' }).scrollLeft).toBe(0);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });
});

describe('TCK-2521 (revue) — les encres de la maquette D', () => {
  it('la puce active en encre foncée, les autres en encre du texte sur la carte', () => {
    monter('city=Dakar');
    const active = screen.getByRole('button', { name: 'Dakar' }).className.split(/\s+/);
    expect(active).toEqual(expect.arrayContaining(['bg-foreground', 'text-background', 'border-foreground']));
    expect(active).not.toContain('bg-primary');
    const autre = screen.getByRole('button', { name: 'Thiès' }).className.split(/\s+/);
    expect(autre).toEqual(expect.arrayContaining(['bg-card', 'text-foreground']));
    expect(autre).not.toContain('text-muted-foreground');
  });
});

describe('TCK-2521 (contre-vérification) — en bureau, la rangée coupée se signale', () => {
  it('fondu sur le bord droit dès `lg`, et une marge pour que la dernière puce en sorte ; rien au téléphone', () => {
    monter();
    const classes = screen.getByRole('group', { name: 'Filtrer par ville' }).className.split(/\s+/);

    expect(classes).toContain('lg:[mask-image:linear-gradient(to_right,#000_calc(100%-var(--spacing)*24),transparent)]');
    expect(classes).toContain('lg:pr-24');
    // Le fondu n'existe qu'en bureau : aucune classe de masque sans préfixe `lg:`.
    expect(classes.filter((c) => c.includes('mask-image') && !c.startsWith('lg:'))).toEqual([]);
    // Le téléphone garde sa rangée qui sort du cadre.
    expect(classes).toEqual(expect.arrayContaining(['-mx-4', 'px-4', 'overflow-x-auto']));
  });
});
