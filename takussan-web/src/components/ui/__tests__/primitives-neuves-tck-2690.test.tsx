/**
 * TCK-2690 — LES QUATRE PRIMITIVES NEUVES de la partie connectée : feuille du bas, case à cocher,
 * interrupteur, jauge. Comportement (clavier, `aria-*`, verrou de défilement) et contraste des
 * contrôles non textuels (WCAG 1.4.11, 3:1), dans les deux thèmes.
 *
 * Les couleurs sont LUES sur le composant rendu (`litUtilitaireDeCouleur`), puis résolues par le
 * harnais `contraste-wcag.ts` : aucun ratio n'est recopié. Le rendu au navigateur (tailles, rayons,
 * position du titre, clic sur le libellé) est mesuré sur la vitrine — cf. le ticket.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Progress, ProgressSegments, type TonDeJauge } from '@/components/ui/progress';
import { SheetContent, Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ATTRIBUT_POSITION_VERROUILLEE } from '@/hooks/useVerrouDeDefilement';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_NON_TEXTUEL,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versRvb,
} from '@/test/contraste-wcag';
import { withIntl } from '@/test/intl';
import { cn } from '@/lib/utils';

const classes = (el: Element) => Array.from(el.classList);

/** La couleur NUE (sans variante) d'un préfixe sur l'élément : `bg-controle-vide` → `controle-vide`. */
function couleurNue(el: Element, prefixe: 'bg' | 'border'): { jeton: string; alpha: number } {
  const lus = classes(el)
    .map((c) => litUtilitaireDeCouleur(c, prefixe))
    .filter((u): u is NonNullable<typeof u> => u !== null && u.variante === '');
  expect(lus, `${prefixe} nu sur ${el.className}`).toHaveLength(1);
  return lus[0]!;
}

const THEMES = [
  { nom: 'clair', jetons: JETONS_CLAIR },
  { nom: 'sombre', jetons: JETONS_SOMBRE },
] as const;

type Jetons = Readonly<Record<string, string>>;
const rvb = (j: string, jetons: Jetons) => versRvb(resoudreCouleur(j, jetons));

/** Les surfaces où ces contrôles se posent : carte, fond de page, aplat `muted`. */
const SURFACES = ['card', 'background', 'muted'] as const;

/**
 * Un écran simulé : `large` (≥ 48rem) et `grossier` (pointeur tactile). La requête est ÉVALUÉE comme
 * le ferait le navigateur pour les deux formes possibles — largeur seule, ou largeur ET pointeur non
 * grossier : une tablette tactile ne doit tomber dans le régime du bureau que par la première.
 */
function avecMatchMedia(large: boolean, grossier = false) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: /48rem/.test(query) && large && (/not \(pointer: coarse\)/.test(query) ? !grossier : true),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe('<FeuilleDuBas> (TCK-2690)', () => {
  let restaurer: (() => void) | null = null;
  afterEach(() => {
    restaurer?.();
    restaurer = null;
    document.body.removeAttribute('style');
  });

  function monter(props: { pied?: boolean; titre?: string } = {}) {
    return render(
      withIntl(
        <FeuilleDuBas
          titre={props.titre ?? 'Mon compte'}
          declencheur={<Button>Ouvrir</Button>}
          pied={props.pied ? <Button>Envoyer</Button> : undefined}
        >
          <p>Corps</p>
        </FeuilleDuBas>,
      ),
    );
  }

  it('s’ouvre en dialogue nommé par son titre, avec un « Fermer » nommé et la poignée cachée à l’assistance', async () => {
    restaurer = avecMatchMedia(false);
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const dialogue = await screen.findByRole('dialog', { name: 'Mon compte' });
    // Le ✕ de la maquette est à l'encre principale : un `ghost` sous la portée prendrait l'encre
    // discrète (`rgb(76, 70, 65)`, relevé par la comparaison d'AC2).
    expect(classes(screen.getByRole('button', { name: 'Fermer' }))).toContain('text-foreground');
    // 44 px au téléphone, sous la portée `/app` ET hors d'elle (`/publish`, le fil public) : `size-controle` n'y vaut que 40.
    expect(classes(screen.getByRole('button', { name: 'Fermer' }))).toContain('max-md:size-11');
    const poignee = dialogue.querySelector('[data-slot="feuille-du-bas-poignee"]')!;
    expect(poignee.getAttribute('aria-hidden')).toBe('true');
    expect(classes(poignee)).toEqual(expect.arrayContaining(['h-1', 'w-8', 'mt-2', 'rounded-full', 'bg-border', 'md:hidden']));
    expect(classes(dialogue)).toEqual(
      expect.arrayContaining(['rounded-t-2xl', 'shadow-feuille', 'max-h-[90dvh]', 'bg-card', 'bottom-0', 'inset-x-0']),
    );
    const titre = dialogue.querySelector('[data-slot="sheet-title"]')!;
    expect(classes(titre)).toEqual(expect.arrayContaining(['truncate', 'text-titre-court', 'font-semibold']));
    expect(classes(titre)).not.toContain('text-base');
    // Le voile de la maquette : brun à 35 %, pas le noir à 30 % de `Sheet`.
    const voile = document.querySelector('[data-slot="sheet-overlay"]')!;
    expect(classes(voile)).toContain('bg-foreground/35');
    expect(classes(voile)).not.toContain('bg-scrim/30');
  });

  it('sous md, verrouille le document (`position: fixed`) tant qu’elle est ouverte, et rend la main à la fermeture', async () => {
    restaurer = avecMatchMedia(false);
    const user = userEvent.setup();
    monter();
    expect(document.body.style.position).toBe('');
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByRole('dialog');
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.hasAttribute(ATTRIBUT_POSITION_VERROUILLEE)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.style.position).toBe('');
    expect(document.body.hasAttribute(ATTRIBUT_POSITION_VERROUILLEE)).toBe(false);
  });

  it('tablette tactile ≥ md : le verrou TCK-551 aussi (celui de base-ui, `overflow: hidden`, laissait passer `scrollBy` à 1024 px)', async () => {
    restaurer = avecMatchMedia(true, true);
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByRole('dialog');
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.hasAttribute(ATTRIBUT_POSITION_VERROUILLEE)).toBe(true);
  });

  it('au régime du bureau (≥ md, pointeur fin), laisse le verrou à base-ui : le document n’est pas sorti du flux', async () => {
    restaurer = avecMatchMedia(true);
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await screen.findByRole('dialog');
    expect(document.body.style.position).not.toBe('fixed');
    expect(document.body.hasAttribute(ATTRIBUT_POSITION_VERROUILLEE)).toBe(false);
  });

  it('Échap la ferme et rend le focus au déclencheur', async () => {
    restaurer = avecMatchMedia(false);
    const user = userEvent.setup();
    monter();
    const declencheur = screen.getByRole('button', { name: 'Ouvrir' });
    await user.click(declencheur);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(declencheur));
  });

  it('la zone sûre du bas va au pied s’il existe, au corps sinon — jamais aux deux', async () => {
    restaurer = avecMatchMedia(false);
    const user = userEvent.setup();
    const zone = (el: Element | null) => (el ? classes(el).some((c) => c.includes('safe-area-inset-bottom')) : false);

    const { unmount } = monter({ pied: true });
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    let dialogue = await screen.findByRole('dialog');
    expect(zone(dialogue.querySelector('[data-slot="feuille-du-bas-pied"]'))).toBe(true);
    expect(zone(dialogue.querySelector('[data-slot="feuille-du-bas-corps"]'))).toBe(false);
    unmount();

    monter();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    dialogue = await screen.findByRole('dialog');
    expect(dialogue.querySelector('[data-slot="feuille-du-bas-pied"]')).toBeNull();
    expect(zone(dialogue.querySelector('[data-slot="feuille-du-bas-corps"]'))).toBe(true);
  });

  it('`open` contrôlé : la feuille suit son parent et lui signale la fermeture', async () => {
    restaurer = avecMatchMedia(false);
    const surChangement = vi.fn();
    const { rerender } = render(
      withIntl(
        <FeuilleDuBas open titre="Contrôlée" onOpenChange={surChangement}>
          <p>Corps</p>
        </FeuilleDuBas>,
      ),
    );
    await screen.findByRole('dialog', { name: 'Contrôlée' });
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(surChangement).toHaveBeenCalledWith(false, expect.anything());
    rerender(
      withIntl(
        <FeuilleDuBas open={false} titre="Contrôlée" onOpenChange={surChangement}>
          <p>Corps</p>
        </FeuilleDuBas>,
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('AC6 — `SheetContent side="bottom"` garde ses classes d’avant au caractère près (les huit feuilles existantes)', () => {
    render(
      <Sheet open>
        <SheetContent side="bottom" data-testid="ancienne" />
      </Sheet>,
    );
    expect(screen.getByTestId('ancienne').className).toBe(
      'fixed z-50 flex flex-col bg-card shadow-[0_0_40px_0_color-mix(in_srgb,var(--foreground)_4%,transparent)] outline-none duration-200 data-open:animate-in motion-reduce:data-open:animate-none data-closed:animate-out motion-reduce:data-closed:animate-none inset-x-0 w-full max-h-[90dvh] bottom-0 data-open:slide-in-from-bottom data-closed:slide-out-to-bottom',
    );
    expect(document.querySelector('[data-slot="sheet-overlay"]')!.className).toContain('bg-scrim/30');
  });
});

describe('<Checkbox> (TCK-2690)', () => {
  it('18 px au rayon de 5 px, en jetons fixes ; vide au bord `controle-vide`, cochée et mixte en `--primary`', () => {
    render(<Checkbox aria-label="Choisir" data-testid="c" />);
    const c = classes(screen.getByTestId('c'));
    expect(c).toEqual(
      expect.arrayContaining([
        'size-icone',
        'rounded-case',
        'border',
        'border-controle-vide',
        'bg-card',
        'data-checked:border-primary',
        'data-checked:bg-primary',
        'data-indeterminate:border-primary',
        'data-indeterminate:bg-primary',
      ]),
    );
    expect(c).not.toContain('size-[18px]');
  });

  it('un clic sur le libellé de sa ligne la coche ; `Espace` la bascule', async () => {
    const user = userEvent.setup();
    render(
      <label>
        <Checkbox data-testid="c" />
        Awa Ndiaye
      </label>,
    );
    const caseACocher = screen.getByRole('checkbox', { name: 'Awa Ndiaye' });
    expect(caseACocher).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByText('Awa Ndiaye'));
    expect(caseACocher).toHaveAttribute('aria-checked', 'true');
    caseACocher.focus();
    await user.keyboard(' ');
    expect(caseACocher).toHaveAttribute('aria-checked', 'false');
  });

  it('mixte : `aria-checked="mixed"`, la barre de 10 × 2 de la maquette (et non la coche)', () => {
    render(<Checkbox aria-label="Tout sélectionner" indeterminate data-testid="c" />);
    const c = screen.getByRole('checkbox', { name: 'Tout sélectionner' });
    expect(c).toHaveAttribute('aria-checked', 'mixed');
    expect(c).toHaveAttribute('data-indeterminate');
    const barre = c.querySelector('span[aria-hidden="true"]:not(svg)')!;
    expect(classes(barre)).toEqual(expect.arrayContaining(['h-0.5', 'w-2.5', 'in-data-indeterminate:block', 'hidden']));
    expect(classes(c.querySelector('svg')!)).toContain('in-data-indeterminate:hidden');
  });

  it('désactivée et en erreur : `aria-disabled` / `data-disabled`, `aria-invalid` peint le bord en `--destructive`', () => {
    render(
      <>
        <Checkbox aria-label="Off" disabled data-testid="d" />
        <Checkbox aria-label="Erreur" aria-invalid data-testid="e" />
      </>,
    );
    expect(screen.getByTestId('d')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('e')).toHaveAttribute('aria-invalid', 'true');
    expect(classes(screen.getByTestId('e'))).toContain('aria-invalid:border-destructive');
  });
});

describe('<Switch> (TCK-2690)', () => {
  it('piste 24 × 40 (`h-6 w-10 p-0.5`), pouce `size-5 bg-card` ; allumé `--primary`, éteint `controle-vide`', () => {
    render(<Switch aria-label="Rappels" data-testid="s" />);
    const s = screen.getByTestId('s');
    expect(classes(s)).toEqual(expect.arrayContaining(['h-6', 'w-10', 'p-0.5', 'rounded-full', 'bg-controle-vide', 'data-checked:bg-primary']));
    const pouce = s.querySelector('[data-slot="switch-thumb"]')!;
    expect(classes(pouce)).toEqual(expect.arrayContaining(['size-5', 'bg-card', 'rounded-full', 'data-checked:translate-x-4']));
  });

  it('`role="switch"` ; `Espace` le bascule et `aria-checked` suit ; le libellé de sa ligne aussi', async () => {
    const user = userEvent.setup();
    render(
      <label>
        Synchroniser l’agenda
        <Switch />
      </label>,
    );
    const s = screen.getByRole('switch', { name: 'Synchroniser l’agenda' });
    expect(s).toHaveAttribute('aria-checked', 'false');
    s.focus();
    await user.keyboard(' ');
    expect(s).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByText('Synchroniser l’agenda'));
    expect(s).toHaveAttribute('aria-checked', 'false');
  });
});

describe('<Progress> et <ProgressSegments> (TCK-2690)', () => {
  it('`role="progressbar"` avec valeur, bornes, nom, et le texte formaté dans la langue de la page', () => {
    render(withIntl(<Progress aria-label="Crédits utilisés" value={60} />));
    const j = screen.getByRole('progressbar', { name: 'Crédits utilisés' });
    expect(j).toHaveAttribute('aria-valuenow', '60');
    expect(j).toHaveAttribute('aria-valuemin', '0');
    expect(j).toHaveAttribute('aria-valuemax', '100');
    expect(j.getAttribute('aria-valuetext')).toMatch(/^60\s?%$/);
  });

  it('rail `h-1.5 bg-muted rounded-full` (`h-2` en grand), remplissage `rounded-full` au ton demandé', () => {
    render(
      withIntl(
        <>
          <Progress aria-label="a" value={10} data-testid="d" />
          <Progress aria-label="b" value={10} taille="grand" ton="warning" data-testid="g" />
        </>,
      ),
    );
    const rail = (id: string) => screen.getByTestId(id).querySelector('[data-slot="progress-track"]')!;
    const rempli = (id: string) => screen.getByTestId(id).querySelector('[data-slot="progress-indicator"]')!;
    expect(classes(rail('d'))).toEqual(expect.arrayContaining(['h-1.5', 'bg-muted', 'rounded-full', 'overflow-hidden']));
    expect(classes(rail('g'))).toContain('h-2');
    expect(classes(rempli('d'))).toEqual(expect.arrayContaining(['bg-primary', 'rounded-full']));
    expect(classes(rempli('g'))).toContain('bg-warning');
  });

  it('segments : `total` barres `h-1`, les `value` premières remplies ; `aria-valuetext` de l’appelant', () => {
    render(withIntl(<ProgressSegments aria-label="Étapes" aria-valuetext="Étape 2 sur 4" value={2} total={4} />));
    const j = screen.getByRole('progressbar', { name: 'Étapes' });
    expect(j).toHaveAttribute('aria-valuenow', '2');
    expect(j).toHaveAttribute('aria-valuemax', '4');
    expect(j).toHaveAttribute('aria-valuetext', 'Étape 2 sur 4');
    const segments = j.querySelectorAll('[data-slot="progress-segment"]');
    expect(segments).toHaveLength(4);
    expect(Array.from(segments).map((s) => s.hasAttribute('data-rempli'))).toEqual([true, true, false, false]);
    expect(classes(segments[0]!)).toEqual(expect.arrayContaining(['h-1', 'bg-primary']));
    expect(classes(segments[3]!)).toContain('bg-muted');
    expect(classes(j)).toContain('gap-1.5');
  });

  it('un nom accessible est exigé par le type', () => {
    // @ts-expect-error — sans `aria-label` ni `aria-labelledby`, une jauge ne compile pas.
    const sansNom = <Progress value={1} />;
    expect(sansNom).toBeTruthy();
  });
});

describe('Contraste des contrôles non textuels (WCAG 1.4.11, 3:1) — TCK-2690', () => {
  it.each(THEMES)('bord de la case vide et piste éteinte ≥ 3:1 sur carte, fond et `muted` — thème $nom', ({ jetons }) => {
    render(
      <>
        <Checkbox aria-label="c" data-testid="c" />
        <Switch aria-label="s" data-testid="s" />
      </>,
    );
    const bord = couleurNue(screen.getByTestId('c'), 'border');
    const piste = couleurNue(screen.getByTestId('s'), 'bg');
    const echecs: string[] = [];
    for (const surface of SURFACES) {
      const fond = rvb(surface, jetons);
      for (const [nom, u] of [['bord de case', bord], ['piste éteinte', piste]] as const) {
        const r = contraste(composer(rvb(u.jeton, jetons), fond, u.alpha), fond);
        if (r < SEUIL_NON_TEXTUEL) echecs.push(`${nom} (${u.jeton}) sur ${surface} : ${fmt(r)}`);
      }
    }
    expect(echecs, echecs.join('\n')).toEqual([]);
  });

  it.each(THEMES)('cochée, allumée : `--primary` ≥ 3:1 sur carte et fond ; le pouce `--card` ≥ 3:1 sur ses deux pistes — thème $nom', ({ jetons }) => {
    const primaire = rvb('primary', jetons);
    for (const surface of ['card', 'background'] as const) {
      expect(contraste(primaire, rvb(surface, jetons))).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
    }
    expect(contraste(rvb('card', jetons), primaire)).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
    expect(contraste(rvb('card', jetons), rvb('controle-vide', jetons))).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
  });

  it.each(THEMES)('chaque ton de remplissage ≥ 3:1 contre le rail `--muted` (alpha composé sur le rail) — thème $nom', ({ jetons }) => {
    const tons: TonDeJauge[] = ['primary', 'success', 'warning', 'neutral'];
    render(withIntl(<>{tons.map((t) => <Progress key={t} aria-label={t} value={50} ton={t} data-testid={t} />)}</>));
    const echecs: string[] = [];
    for (const t of tons) {
      const racine = screen.getByTestId(t);
      const rail = couleurNue(racine.querySelector('[data-slot="progress-track"]')!, 'bg');
      const rempli = couleurNue(racine.querySelector('[data-slot="progress-indicator"]')!, 'bg');
      expect(rail.jeton).toBe('muted');
      const fondRail = rvb(rail.jeton, jetons);
      const r = contraste(composer(rvb(rempli.jeton, jetons), fondRail, rempli.alpha), fondRail);
      if (r < SEUIL_NON_TEXTUEL) echecs.push(`${t} (${rempli.jeton}/${rempli.alpha}) : ${fmt(r)}`);
    }
    expect(echecs, echecs.join('\n')).toEqual([]);
  });
});

describe('Les jetons de TCK-2690 dans `globals.css` — et le harnais qui les lit', () => {
  const css = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf8');
  const debut = css.indexOf('TCK-2690 — LES PRIMITIVES NEUVES');
  const fin = css.indexOf('/* primitives-de-l-app:fin */');
  const partie = css.slice(debut, fin);

  it('la sous-partie existe dans le bloc `primitives-de-l-app`, et pose le rayon et le jeton du contrôle vide', () => {
    expect(debut).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(debut);
    const theme = partie.match(/@theme \{([\s\S]*?)\n\}/)![1]!;
    expect(theme).toMatch(/--radius-case:\s*0\.3125rem;/);
    expect(theme).toMatch(/--color-controle-vide:\s*var\(--input\);/);
  });

  it('le thème sombre REDÉCLARE le jeton sur `.dark` (`--input` sombre rendrait 1,44:1 sur `--card`)', () => {
    const sombre = partie.match(/\.dark \{([\s\S]*?)\}/)![1]!;
    expect(sombre).toMatch(/--color-controle-vide:\s*var\(--muted-foreground\);/);
  });

  it('les alias du harnais de contraste sont ceux que la feuille déclare (sinon le test de contraste mesure autre chose)', () => {
    expect(JETONS_CLAIR['controle-vide']).toBe(JETONS_CLAIR.input);
    expect(JETONS_SOMBRE['controle-vide']).toBe(JETONS_SOMBRE['muted-foreground']);
  });

  it('`cn` connaît les deux jetons : la classe d’un appelant les remplace', () => {
    expect(cn('border-controle-vide', 'border-destructive')).toBe('border-destructive');
    expect(cn('bg-controle-vide', 'bg-primary')).toBe('bg-primary');
    expect(cn('rounded-case', 'rounded-lg')).toBe('rounded-lg');
  });
});
