/**
 * TCK-2687 (ADR-0106) — LES PRIMITIVES EXISTANTES SOUS LA PORTÉE `/app`, ET RIEN AILLEURS.
 *
 * Le rendu (tailles, couleurs, trait, cible de 44 px) se mesure au navigateur sur la vitrine (notes
 * du ticket). Ce fichier garde ce que le navigateur ne peut pas prouver seul, faute de pouvoir
 * ouvrir `/super-admin` (double authentification exigée du compte de démo) :
 *
 *  1. HORS PORTÉE, RIEN NE BOUGE (AC6, preuve de structure). Rendue comme ses appelants la rendent
 *     aujourd'hui, chaque primitive porte EXACTEMENT les classes d'avant le ticket, une fois retirées
 *     les classes `portee-app:` et les variantes d'attributs que seuls les nouveaux props posent
 *     (`data-filet`, `size="28"`…). Les classes d'avant sont RECOPIÉES ci-dessous, depuis la version
 *     du 2026-11-11 : un test de non-dérive ne dérive pas sa référence du code qu'il garde.
 *  2. LA VARIANTE NE VIT QUE SOUS LA PORTÉE. Compilées par Tailwind avec `globals.css`, les règles de
 *     chaque classe `portee-app:` exigent `:root:has([data-portee-app])`, et viennent APRÈS la règle
 *     nue qu'elles remplacent (même spécificité : c'est l'ordre qui tranche).
 *  3. LES JETONS DU REPLI DE L'AVATAR valent hors portée les classes d'avant, et `cn` les connaît :
 *     la teinte d'un appelant les remplace (`MenuDuCompte`, `ProfileHeader`).
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { PageHeader, StatCard, StatusBadge, type StatusTone } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { badgeVariants } from '@/components/ui/badge';
import { Card, CardAction, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PRIMITIVES_DE_L_APP } from '@/lib/jetons-de-l-app';
import { cn } from '@/lib/utils';

/** Les classes d'AVANT TCK-2687, recopiées (cf. l'en-tête, point 1). */
const AVANT = {
  card: "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
  cardHeader: "@container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
  cardTitle: "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
  cardAction: "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
  avatar: "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
  avatarFallback: "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
  tabsList: "group/tabs-list inline-flex w-fit max-w-full items-center justify-center-safe rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 plancher-onglets-liste group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  tabsTrigger: "relative inline-flex h-[calc(100%-1px)] flex-1 plancher-onglets-declencheur items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/70 transition-[color,background-color,border-color,box-shadow] group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
  h1: "font-display text-2xl font-bold tracking-tight text-balance text-foreground",
  statShell: "@container/stat block rounded-xl bg-card p-4 ring-1 ring-border",
  emptyState: "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-10 text-center",
} as const;

const classes = (el: Element) => Array.from(el.classList);
const ensemble = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

/** Les classes neuves INERTES hors portée : variante `portee-app:`, ou attribut que seul un prop neuf pose. */
const INERTE =
  /^(portee-app:|has-data-filet:|in-data-filet:|data-filet:|data-\[size=(28|32|36|40|44|48)\]:|group-data-\[size=(28|32|36|40|44|48)\]\/avatar:)/;
const horsPortee = (el: Element) => new Set(classes(el).filter((c) => !INERTE.test(c)));

describe('TCK-2687 — hors de la portée `/app`, les primitives rendent les classes d’avant (AC6)', () => {
  it('Card, CardHeader, CardTitle, CardAction', () => {
    render(
      <Card data-testid="carte">
        <CardHeader data-testid="en-tete">
          <CardTitle data-testid="titre">T</CardTitle>
          <CardAction data-testid="action">A</CardAction>
        </CardHeader>
      </Card>,
    );
    expect(horsPortee(screen.getByTestId('carte'))).toEqual(ensemble(AVANT.card));
    expect(horsPortee(screen.getByTestId('en-tete'))).toEqual(ensemble(AVANT.cardHeader));
    expect(horsPortee(screen.getByTestId('titre'))).toEqual(ensemble(AVANT.cardTitle));
    expect(horsPortee(screen.getByTestId('action'))).toEqual(ensemble(AVANT.cardAction));
    expect(screen.getByTestId('en-tete').hasAttribute('data-filet')).toBe(false);
  });

  it('Avatar et son repli — les jetons du repli valent, hors portée, les classes d’avant', () => {
    render(
      <Avatar data-testid="avatar">
        <AvatarFallback data-testid="repli">AN</AvatarFallback>
      </Avatar>,
    );
    expect(horsPortee(screen.getByTestId('avatar'))).toEqual(ensemble(AVANT.avatar));
    const jetonVersClasse: Record<string, string> = {
      'bg-fond-avatar': 'bg-muted',
      'text-encre-avatar': 'text-muted-foreground',
    };
    const repli = new Set([...horsPortee(screen.getByTestId('repli'))].map((c) => jetonVersClasse[c] ?? c));
    expect(repli).toEqual(ensemble(AVANT.avatarFallback));
  });

  it('Tabs (`default` et `line`) — liste et onglet', () => {
    render(
      <>
        <Tabs defaultValue="a">
          <TabsList data-testid="liste-defaut">
            <TabsTrigger value="a" data-testid="onglet">A</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs defaultValue="a">
          <TabsList variant="line" data-testid="liste-ligne">
            <TabsTrigger value="a">A</TabsTrigger>
          </TabsList>
        </Tabs>
      </>,
    );
    expect(horsPortee(screen.getByTestId('liste-defaut'))).toEqual(ensemble(`${AVANT.tabsList} bg-muted overflow-x-auto`));
    expect(horsPortee(screen.getByTestId('liste-ligne'))).toEqual(ensemble(`${AVANT.tabsList} gap-1 bg-transparent`));
    expect(horsPortee(screen.getByTestId('onglet'))).toEqual(ensemble(AVANT.tabsTrigger));
  });

  it('l’onglet souligné inactif garde un survol sous la portée (sa couleur de portée battrait `hover:` nu)', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList variant="line">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b" data-testid="inactif">B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const c = classes(screen.getByTestId('inactif'));
    // Mesuré au navigateur (survol forcé par CDP) : sans la seconde classe, l'inactif reste
    // `rgb(110, 101, 90)` au survol ; avec elle, `rgb(31, 24, 18)`.
    expect(c).toContain('portee-app:group-data-[variant=line]/tabs-list:not-data-active:text-muted-foreground');
    expect(c).toContain('portee-app:group-data-[variant=line]/tabs-list:not-data-active:hover:text-foreground');
  });

  it('PageHeader sans emplacement neuf — même DOM (l’en-tête est la racine), même H1', () => {
    const { container } = render(<PageHeader title="Baux" description="d" className="mb-6" />);
    const racine = container.firstElementChild!;
    expect(racine.tagName).toBe('HEADER');
    expect(racine.classList.contains('mb-6')).toBe(true);
    expect(horsPortee(screen.getByRole('heading', { level: 1 }))).toEqual(ensemble(AVANT.h1));
    expect(container.querySelector('nav')).toBeNull();
  });

  it('StatCard (variante par défaut) et EmptyState (carte)', () => {
    const { container } = render(<StatCard label="L" value="1" />);
    expect(horsPortee(container.firstElementChild!)).toEqual(ensemble(AVANT.statShell));
    expect(container.querySelector('p')!.className).toBe(
      'text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground',
    );
    const vide = render(<EmptyState title="Rien" data-testid="vide" />);
    expect(horsPortee(vide.getByTestId('vide'))).toEqual(ensemble(AVANT.emptyState));
  });

  it.each(['neutral', 'success', 'attention', 'danger', 'info'] as StatusTone[])('StatusBadge `%s`', (tone) => {
    const TON_AVANT: Record<string, string> = {
      neutral: 'bg-muted text-muted-foreground',
      success: 'bg-success/10 text-success',
      attention: 'bg-warning/12 text-warning',
      danger: 'bg-destructive/10 text-destructive',
      info: 'bg-info/10 text-info',
    };
    render(<StatusBadge tone={tone} label="X" data-testid="p" />);
    const attendu = ensemble(
      cn(badgeVariants({ variant: 'outline' }), 'h-auto gap-1 border-transparent py-0.5', TON_AVANT[tone]),
    );
    expect(horsPortee(screen.getByTestId('p'))).toEqual(attendu);
  });
});

describe('TCK-2687 — les jetons du repli de l’avatar', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
  const i = css.indexOf('/* primitives-de-l-app:début');
  const j = css.indexOf('/* primitives-de-l-app:fin */');
  const bloc = css.slice(i, j);
  const theme = () => bloc.match(/@theme \{([\s\S]*?)\n\}/)![1]!;

  it('le bloc existe, et son `@theme` pose hors portée les valeurs d’avant', () => {
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(theme()).toMatch(/--color-fond-avatar:\s*var\(--muted\);/);
    expect(theme()).toMatch(/--color-encre-avatar:\s*var\(--muted-foreground\);/);
    // Sept tailles, en rem (jamais en px), et une police à 0,36 × la taille ARRONDIE au px, comme la
    // maquette (`Math.round(taille × 0,36)`) : 32 → 12 px, pas 11,52 (relevé de verif-commercial, TCK-2590).
    for (const n of [28, 32, 36, 40, 44, 48, 52]) {
      const taille = theme().match(new RegExp(`--spacing-avatar-${n}:\\s*([\\d.]+)rem;`));
      const police = theme().match(new RegExp(`--text-avatar-${n}:\\s*([\\d.]+)rem;`));
      expect(Number(taille![1]) * 16).toBe(n);
      expect(Number(police![1]) * 16).toBe(Math.round(0.36 * n));
    }
  });

  it('chaque jeton du `@theme` du bloc est connu de `cn` (la classe d’un appelant le remplace)', () => {
    const connus: Record<string, readonly string[]> = {
      spacing: PRIMITIVES_DE_L_APP.spacing,
      text: PRIMITIVES_DE_L_APP.text,
      color: PRIMITIVES_DE_L_APP.color,
    };
    const noms = [...theme().matchAll(/--([a-z]+)-([\w-]+)\s*:/g)].map((m) => [m[1]!, m[2]!] as const);
    // 7 tailles × (spacing + text) + 2 couleurs ; la 7ᵉ, 52, est la tête de la fiche client (TCK-2590).
    expect(noms.length).toBe(16);
    for (const [famille, nom] of noms) expect(connus[famille], `--${famille}-${nom}`).toContain(nom);
    expect(cn('bg-fond-avatar', 'bg-foreground')).toBe('bg-foreground');
    expect(cn('text-encre-avatar', 'text-background')).toBe('text-background');
    expect(cn('text-sm text-avatar-28', 'text-xs')).toBe('text-xs');
    expect(cn('size-avatar-28', 'size-9')).toBe('size-9');
    // Une TAILLE de texte ne chasse pas une COULEUR (et inversement).
    expect(cn('text-avatar-28', 'text-encre-avatar')).toBe('text-avatar-28 text-encre-avatar');
  });

  it('un appelant qui repeint le repli garde sa teinte (`MenuDuCompte`)', () => {
    render(
      <Avatar>
        <AvatarFallback data-testid="r" className="bg-foreground text-xs font-semibold text-background">
          AN
        </AvatarFallback>
      </Avatar>,
    );
    const c = classes(screen.getByTestId('r'));
    expect(c).toEqual(expect.arrayContaining(['bg-foreground', 'text-background', 'text-xs']));
    expect(c).not.toContain('bg-fond-avatar');
    expect(c).not.toContain('text-encre-avatar');
    // Une teinte de PORTÉE (`portee-app:bg-…`) viendrait après celle de l'appelant et la repeindrait
    // sous `/app` : le repli n'en porte aucune, ses teintes de portée passent par les jetons.
    expect(c.filter((x) => /^portee-app:(bg|text)-(?!avatar-)/.test(x))).toEqual([]);
  });
});

describe('TCK-2687 — compilées, les classes `portee-app:` ne valent que sous la portée, et après la règle nue', () => {
  /** [classe nue d'avant, classe de portée qui la remplace]. */
  const PAIRES: ReadonlyArray<readonly [string, string]> = [
    ['h-auto', 'portee-app:h-6'],
    ['font-bold', 'portee-app:font-semibold'],
    ['tracking-tight', 'portee-app:tracking-titre'],
    ['text-2xl', 'portee-app:max-md:text-xl'],
    ['ring-1', 'portee-app:ring-0'],
    ['font-heading', 'portee-app:font-sans'],
    ['text-base', 'portee-app:text-corps'],
    ['text-muted-foreground', 'portee-app:text-encre-douce'],
    ['bg-success/10', 'portee-app:bg-success/11'],
    ['bg-warning/12', 'portee-app:bg-warning/20'],
    ['text-warning', 'portee-app:text-foreground'],
    ['p-[3px]', 'portee-app:p-0'],
    ['gap-1', 'portee-app:gap-x-6'],
    ['w-fit', 'portee-app:w-full'],
  ];

  let sortie = '';
  let portees: string[] = [];
  const echapper = (c: string) => c.replace(/[^\w-]/g, (x) => `\\${x}`);

  beforeAll(async () => {
    const G = join(process.cwd(), 'src', 'app', 'globals.css');
    const css = readFileSync(G, 'utf8');
    const d = mkdtempSync(join(tmpdir(), 'takussan-tw-primitives-'));
    // Les classes `portee-app:` réellement RENDUES par les primitives, pas une liste écrite ici.
    const { container } = render(
      <div>
        <PageHeader title="T" />
        <StatusBadge tone="attention" label="A" />
        <StatusBadge tone="success" label="S" />
        <StatusBadge tone="neutral" label="N" />
        <Card>
          <CardHeader>
            <CardTitle>T</CardTitle>
            <CardAction>A</CardAction>
          </CardHeader>
        </Card>
        <Avatar>
          <AvatarFallback>AN</AvatarFallback>
        </Avatar>
        <Tabs defaultValue="a">
          <TabsList variant="line">
            <TabsTrigger value="a">A</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>,
    );
    const vues = new Set<string>();
    for (const el of container.querySelectorAll('*')) for (const c of el.classList) if (c.startsWith('portee-app:')) vues.add(c);
    portees = [...vues];
    const candidats = [...new Set([...PAIRES.flat(), ...portees])];
    writeFileSync(join(d, 'c.html'), candidats.map((c) => `<i class="${c}"></i>`).join('\n'));
    const source = [
      '@import "tailwindcss" source(none);',
      `@source "${join(d, 'c.html')}";`,
      css.split('\n').filter((l) => !/^@import\s+"tailwindcss"/.test(l)).join('\n'),
    ].join('\n');
    sortie = (await postcss([tailwind()]).process(source, { from: G })).css;
  }, 60_000);

  it('chaque classe `portee-app:` rendue n’émet de règle que sous `:root:has([data-portee-app])`', () => {
    expect(portees.length).toBeGreaterThan(20);
    for (const c of portees) {
      const i = sortie.indexOf(`.${echapper(c)}`);
      expect(i, `${c} n’est pas compilée`).toBeGreaterThan(-1);
      const regle = sortie.slice(i, sortie.indexOf('}', i));
      expect(regle, c).toContain(':root:has([data-portee-app])');
    }
  });

  it.each(PAIRES)('`%s` puis `%s` : la règle de portée vient après la règle nue', (nue, portee) => {
    const a = sortie.indexOf(`.${echapper(nue)}`);
    const b = sortie.indexOf(`.${echapper(portee)}`);
    expect(a, nue).toBeGreaterThan(-1);
    expect(b, portee).toBeGreaterThan(a);
  });
});
