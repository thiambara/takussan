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
 *  - TCK-2638 (lot B) — les deux modes partagent la même enveloppe pleine largeur ; les compteurs de la
 *    bande d'avant sont devenus les pastilles et les onglets du mode Annonces, qui portent leur nom
 *    (`ModesDeLaListe.tck-2638.test.tsx`).
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
  // Un bien à louer : le sélecteur est proposé, et la Gestion reste la Gestion (décision 4 a).
  fetchPortfolioSummary: async () => ({
    total: 1, occupied: 1, vacant: 0, for_sale: 0, vacant_over_60_days: 0, notice: 0, rent_late: 0, rent_late_amount: 0, online: 0,
    pending_validation: 0, drafts: 0, offline: 1, sold_or_rented: 0, archived: 0,
  }),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({ fetchListingQuotaAction: async () => null }));

const recu = vi.hoisted(() => ({
  entete: undefined as Record<string, unknown> | undefined,
}));
vi.mock('@/components/console', () => ({
  PageHeader: (props: Record<string, unknown>) => {
    recu.entete = props;
    return null;
  },
}));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
// TCK-2638 (lot B2) — la barre ENVELOPPE la liste et sa pagination : le double les rend en place.
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({
  PropertyListFilters: (props: { sousLaBarre?: React.ReactNode; children?: React.ReactNode; pied?: React.ReactNode }) => (
    <>
      {props.sousLaBarre}
      {props.children}
      {props.pied}
    </>
  ),
}));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
// TCK-2638 — la page a deux modes, et les épingles valent pour les deux.
const memoire = vi.hoisted(() => ({ mode: 'annonces' as string }));
vi.mock('@/lib/biens/mode-memorise', () => ({ modeMemoriseDesBiens: async () => memoire.mode }));
vi.mock('@/components/property-dashboard/ModesDeLaListe', () => ({
  SelecteurDeMode: () => null,
  PastillesGestion: () => null,
  TuilesGestion: () => null,
  PastillesAnnonces: () => null,
  OngletsAnnonces: () => null,
  JaugeDuQuota: () => null,
  AfficherLesSuivants: () => null,
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

for (const mode of ['annonces', 'gestion']) {
  describe(`/app/properties — mise en page mobile, mode « ${mode} » (TCK-644, TCK-2638)`, () => {
    beforeEach(() => {
      memoire.mode = mode;
      recu.entete = undefined;
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

    it('l’en-tête tient sur une rangée sous lg, et sa ligne de contexte attend sm', async () => {
      await rendre();
      const entete = recu.entete ?? {};
      expect(String(entete.className).split(/\s+/)).toEqual(
        expect.arrayContaining(['flex-row', 'items-center', 'justify-between']),
      );
      const { renderToStaticMarkup } = await import('react-dom/server');
      const contexte = renderToStaticMarkup(<>{entete.description as React.ReactNode}</>);
      // En Annonces, la ligne dit le portefeuille et ce qui en est en ligne (maquette a-1).
      expect(contexte).toContain(mode === 'annonces' ? 'sousTitre' : 'subtitle');
      expect(contexte).toMatch(/class="[^"]*\bhidden\b[^"]*\bsm:inline\b/);
      const action = renderToStaticMarkup(<>{entete.actions as React.ReactNode}</>);
      expect(action).toContain('href="/app/properties/new"');
    });
  });
}
