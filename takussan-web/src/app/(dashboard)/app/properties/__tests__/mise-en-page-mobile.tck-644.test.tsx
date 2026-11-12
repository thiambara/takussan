import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/user';

/**
 * TCK-644 — le CÂBLAGE de la page « Mes biens » sur téléphone. Les composants éprouvent leur rendu ;
 * ce fichier éprouve ce que la page leur demande :
 *
 *  - AC4 : la page réserve en bas la place du lanceur de messagerie (`RESERVE_SOUS_LANCEUR`), sans
 *    quoi la dernière carte et la pagination finissent sous le bouton « Messagerie » ;
 *  - l'en-tête tient sur UNE rangée sous `lg` (titre à gauche, « Publier un bien » à droite) et
 *    laisse sa ligne de contexte à l'écran large : à 390 px elle coûtait deux lignes avant la
 *    première carte ;
 *  - les compteurs portent le nom de leur repère de navigation.
 */
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 1, roles: ['owner'], phone_verified_at: null }) as unknown as User,
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperties: async () => ({
    data: [],
    meta: { total: 0, current_page: 1, last_page: 1, per_page: 1 },
  }),
  countDashboardProperties: async () => 0,
  fetchPortfolioSummary: async () => ({
    total: 0, occupied: 0, vacant: 0, vacant_over_60_days: 0, notice: 0, rent_late: 0, rent_late_amount: 0, online: 0,
  }),
}));

const recu = vi.hoisted(() => ({
  entete: undefined as Record<string, unknown> | undefined,
  compteurs: undefined as Record<string, unknown> | undefined,
}));
vi.mock('@/components/console', () => ({
  PageHeader: (props: Record<string, unknown>) => {
    recu.entete = props;
    return null;
  },
}));
vi.mock('@/components/property-dashboard/PropertyKpiStrip', () => ({
  PropertyKpiStrip: (props: Record<string, unknown>) => {
    recu.compteurs = props;
    return null;
  },
}));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({ PropertyListFilters: () => null }));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
// TCK-2638 — la page a deux modes. Ces épingles portent sur « Annonces » (la vue d'avant) ; le dernier
// bloc rejoue en « Gestion » ce qui y garde un sens (la réserve du lanceur, le bas sous `md`).
const memoire = vi.hoisted(() => ({ mode: 'annonces' as string }));
vi.mock('@/lib/biens/mode-memorise', () => ({ modeMemoriseDesBiens: async () => memoire.mode }));
vi.mock('@/components/property-dashboard/ModesDeLaListe', () => ({
  SelecteurDeMode: () => null,
  PastillesGestion: () => null,
  TuilesGestion: () => null,
}));

async function rendre(): Promise<string> {
  const { default: Page } = await import('../(liste)/page');
  const arbre = await Page({ searchParams: Promise.resolve({}) });
  const { renderToStaticMarkup } = await import('react-dom/server');
  return renderToStaticMarkup(arbre);
}

function classesRacine(html: string): string[] {
  // En Gestion, la racine est `<PagePleineLargeur>`, qui pose `data-pleine-largeur` avant `class`.
  const m = /^<div[^>]*?\bclass="([^"]*)"/.exec(html);
  return (m?.[1] ?? '').split(/\s+/);
}

describe('/app/properties — mise en page mobile (TCK-644)', () => {
  beforeEach(() => {
    memoire.mode = 'annonces';
  });

  it('AC4 — la page réserve en bas la place du lanceur de messagerie', async () => {
    const { RESERVE_SOUS_LANCEUR } = await import('@/components/chat-widget/reserve');
    const classes = classesRacine(await rendre());
    expect(classes).toEqual(expect.arrayContaining(RESERVE_SOUS_LANCEUR.split(' ')));
  });

  it('TCK-2481 (revue, M2) — sous md, aucun rembourrage bas : la barre d’onglets remplace le bouton flottant', async () => {
    const classes = classesRacine(await rendre());
    expect(classes.filter((c) => /^pb-/.test(c))).toEqual([]);
  });

  it('l’en-tête tient sur une rangée sous lg, et sa ligne de contexte attend sm', async () => {
    await rendre();
    const entete = recu.entete ?? {};
    expect(String(entete.className).split(/\s+/)).toEqual(
      expect.arrayContaining(['flex-row', 'items-center', 'justify-between']),
    );
    const { renderToStaticMarkup } = await import('react-dom/server');
    const contexte = renderToStaticMarkup(<>{entete.description as React.ReactNode}</>);
    expect(contexte).toContain('subtitle');
    expect(contexte).toMatch(/class="[^"]*\bhidden\b[^"]*\bsm:inline\b/);
    const action = renderToStaticMarkup(<>{entete.actions as React.ReactNode}</>);
    expect(action).toContain('href="/app/properties/new"');
    expect(action).toContain('publish');
  });

  it('les compteurs portent le nom de leur repère', async () => {
    await rendre();
    expect(recu.compteurs?.label).toBe('countersAria');
  });
});

describe('/app/properties — mise en page mobile, mode « Gestion » (TCK-2638)', () => {
  beforeEach(() => {
    memoire.mode = 'gestion';
  });

  it('AC4 — la page réserve en bas la place du lanceur de messagerie', async () => {
    const { RESERVE_SOUS_LANCEUR } = await import('@/components/chat-widget/reserve');
    const classes = classesRacine(await rendre());
    expect(classes).toEqual(expect.arrayContaining(RESERVE_SOUS_LANCEUR.split(' ')));
  });

  it('TCK-2481 (M2) — aucun rembourrage bas hors de `max-md:` : sous md, les 24 px que l’enveloppe pleine largeur ne pose plus', async () => {
    const classes = classesRacine(await rendre());
    expect(classes.filter((c) => /^pb-/.test(c))).toEqual([]);
    expect(classes).toContain('max-md:pb-6');
  });
});
