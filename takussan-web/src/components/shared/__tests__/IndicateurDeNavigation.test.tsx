/**
 * La barre de chargement des navigations par lien — retour testeur du 2026-09-23 (TCK-568, W1).
 *
 * Le défaut : cliquer une carte de bien, une carte d'agent, une page de pagination ne changeait
 * RIEN à l'écran tant que la page suivante n'était pas servie (fiches sans `loading.tsx`, par
 * construction). Ces tests éprouvent les deux moitiés du contrat : la barre VIENT au clic d'un lien
 * qui navigue, et elle NE VIENT PAS quand le clic ne navigue pas — un faux « en cours » qui ne
 * s'arrête jamais serait pire que le silence d'avant.
 */
/* eslint-disable @next/next/no-html-link-for-pages -- ces `<a>` SONT ce que `<Link>` rend dans le
   DOM, `onClick` compris : l'indicateur écoute le DOM, pas le composant. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

let pathname = '/fr/properties';
let parametres = new URLSearchParams('type=office');

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => parametres,
}));

import {
  DELAI_AVANT_AFFICHAGE_MS,
  DUREE_MAXIMALE_MS,
  IndicateurDeNavigation,
} from '../IndicateurDeNavigation';

/** Ce que fait le `<Link>` de Next : il empêche la navigation native et navigue côté client. */
function empecherLaNavigationNative(evenement: React.MouseEvent) {
  evenement.preventDefault();
}

function Page() {
  return (
    <div>
      <IndicateurDeNavigation />
      <div className="relative">
        <a href="/fr/properties/villa-a-fann" onClick={empecherLaNavigationNative}>
          Villa à Fann
        </a>
        {/* Le favori d'une carte : frère du lien, il arrête l'événement (TCK-554). */}
        <button type="button" onClick={(e) => e.stopPropagation()}>
          Ajouter aux favoris
        </button>
      </div>
      <a href="/fr/properties/bureau" onClick={empecherLaNavigationNative}>
        <span>Bureau</span>
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          Comparer
        </button>
      </a>
      <a href="/fr/properties?type=office&page=2" onClick={empecherLaNavigationNative}>Page 2</a>
      <a href="/fr/properties?type=office" onClick={empecherLaNavigationNative}>Cette page</a>
      <a href="/properties?type=office" onClick={empecherLaNavigationNative}>Cette page sans langue</a>
      <a href="#photos">Photos</a>
      <a href="/fr/agents" target="_blank" rel="noreferrer" onClick={empecherLaNavigationNative}>Onglet</a>
      <a href="https://wa.me/221770000000" onClick={empecherLaNavigationNative}>WhatsApp</a>
      <a href="/fr/brochure.pdf" download onClick={empecherLaNavigationNative}>Brochure</a>
      {/* Ce que rendent `DataExportsPanel` et `LeaseDetail` : un `<Link>` SANS `download` vers un
          route handler qui répond en pièce jointe — l'URL ne change jamais. */}
      <a href="/api/data-exports/12/download" onClick={empecherLaNavigationNative}>Mon export</a>
      <a href="/api/booking-payments/7/receipt" onClick={empecherLaNavigationNative}>Reçu</a>
      <a href="/fr/plan-de-masse.PDF" onClick={empecherLaNavigationNative}>Plan de masse</a>
      {/* Un slug de bien peut porter un point (cfe92ba8) : ce n'est pas un fichier. */}
      <a href="/fr/agents/owner.agency4" onClick={empecherLaNavigationNative}>Agent à point</a>
      <a href="/apiculteurs" onClick={empecherLaNavigationNative}>Page en api-</a>
      {/* Ce que créent `AuditTrail`, `TotpEnrollment` et `InventoryPdfButton` : un `<a download>`
          vers une URL `blob:` de MÊME origine, sans extension ni `/api` — seul `download` dit que
          ce clic ne navigue pas (revue du 2026-09-23 : la garde n'était couverte par aucun cas). */}
      <a href="blob:http://localhost:3000/5f1c2e7a-9b1d-4c1e-8f2a-0d3b6c7e9a11" download="journal.csv" onClick={empecherLaNavigationNative}>
        Journal d’audit
      </a>
      <a href="/fr/agents" download onClick={empecherLaNavigationNative}>Annuaire à télécharger</a>
    </div>
  );
}

function monter() {
  return render(withIntl(<Page />));
}

beforeEach(() => {
  vi.useFakeTimers();
  pathname = '/fr/properties';
  parametres = new URLSearchParams('type=office');
  window.history.replaceState({}, '', '/fr/properties?type=office');
});

afterEach(() => {
  vi.useRealTimers();
});

function attendre(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('la barre vient au clic d’un lien qui navigue', () => {
  it('une carte de bien : la barre paraît dans le dixième de seconde, et part avec la page', () => {
    const vue = monter();
    fireEvent.click(screen.getByRole('link', { name: 'Villa à Fann' }));

    // Pas de clignotement pour une navigation déjà préchargée…
    attendre(DELAI_AVANT_AFFICHAGE_MS - 1);
    expect(screen.queryByText('Chargement…')).toBeNull();
    // … mais au-delà, le clic se voit.
    attendre(1);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');

    // La page suivante est servie : l'URL change, la barre s'en va — sans minuterie.
    pathname = '/fr/properties/villa-a-fann';
    parametres = new URLSearchParams();
    vue.rerender(withIntl(<Page />));
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  // La barre court au bord HAUT de la fenêtre, loin de la carte qu'on regarde : au bureau, le
  // pointeur est l'endroit où l'œil se trouve — il passe en « travail en cours » avec la barre.
  it('le pointeur passe en « progression » avec la barre, et revient avec la page', () => {
    const vue = monter();
    const curseur = () => getComputedStyle(document.documentElement).cursor;
    expect(curseur()).not.toBe('progress');

    fireEvent.click(screen.getByRole('link', { name: 'Villa à Fann' }));
    attendre(DELAI_AVANT_AFFICHAGE_MS);
    expect(curseur()).toBe('progress');

    pathname = '/fr/properties/villa-a-fann';
    parametres = new URLSearchParams();
    vue.rerender(withIntl(<Page />));
    expect(curseur()).not.toBe('progress');
  });

  it.each(['Agent à point', 'Page en api-'])(
    '« %s » est une page, pas une ressource : la barre vient',
    (nom) => {
      monter();
      fireEvent.click(screen.getByRole('link', { name: nom }));
      attendre(DELAI_AVANT_AFFICHAGE_MS);
      expect(screen.getByText('Chargement…')).toBeInTheDocument();
    },
  );

  it('une autre page de la même liste — seuls les paramètres changent', () => {
    monter();
    fireEvent.click(screen.getByRole('link', { name: 'Page 2' }));
    attendre(DELAI_AVANT_AFFICHAGE_MS);
    expect(screen.getByText('Chargement…')).toBeInTheDocument();
  });
});

describe('la barre ne vient PAS quand le clic ne navigue pas', () => {
  const cas: ReadonlyArray<[string, () => void]> = [
    ['un contrôle posé sur une carte, qui arrête l’événement', () =>
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }))],
    ['un contrôle À L’INTÉRIEUR d’un lien, qui arrête l’événement', () =>
      fireEvent.click(screen.getByRole('button', { name: 'Comparer' }))],
    ['un ⌘-clic (nouvel onglet)', () =>
      fireEvent.click(screen.getByRole('link', { name: 'Villa à Fann' }), { metaKey: true })],
    ['un clic molette', () =>
      fireEvent.click(screen.getByRole('link', { name: 'Villa à Fann' }), { button: 1 })],
    ['un lien vers la page courante', () =>
      fireEvent.click(screen.getByRole('link', { name: 'Cette page' }))],
    ['un lien vers la page courante, sans langue (le proxy y ramène)', () =>
      fireEvent.click(screen.getByRole('link', { name: 'Cette page sans langue' }))],
    ['une ancre de la page', () => fireEvent.click(screen.getByRole('link', { name: 'Photos' }))],
    ['un lien qui ouvre un onglet', () => fireEvent.click(screen.getByRole('link', { name: 'Onglet' }))],
    ['un lien externe', () => fireEvent.click(screen.getByRole('link', { name: 'WhatsApp' }))],
    ['un téléchargement', () => fireEvent.click(screen.getByRole('link', { name: 'Brochure' }))],
    ['un téléchargement d’une URL blob: de même origine (journal d’audit)', () =>
      fireEvent.click(screen.getByRole('link', { name: 'Journal d’audit' }))],
    ['un lien `download` vers un chemin qui serait une page', () =>
      fireEvent.click(screen.getByRole('link', { name: 'Annuaire à télécharger' }))],
    // Revue du 2026-09-23 : sans ces trois cas, la barre et le pointeur « progression » restaient
    // 15 s sur la page de confidentialité après avoir téléchargé son export.
    ['un route handler servi en pièce jointe (export de données)', () =>
      fireEvent.click(screen.getByRole('link', { name: 'Mon export' }))],
    ['un route handler (reçu de paiement)', () =>
      fireEvent.click(screen.getByRole('link', { name: 'Reçu' }))],
    ['un fichier servi tel quel, sans attribut download', () =>
      fireEvent.click(screen.getByRole('link', { name: 'Plan de masse' }))],
  ];

  it.each(cas)('%s', (_libelle, cliquer) => {
    monter();
    cliquer();
    attendre(DELAI_AVANT_AFFICHAGE_MS * 3);
    expect(screen.queryByText('Chargement…')).toBeNull();
  });
});

describe('elle ne court jamais indéfiniment', () => {
  it('une navigation qui ne change pas l’URL est abandonnée au plafond', () => {
    monter();
    fireEvent.click(screen.getByRole('link', { name: 'Villa à Fann' }));
    attendre(DELAI_AVANT_AFFICHAGE_MS);
    expect(screen.getByText('Chargement…')).toBeInTheDocument();

    attendre(DUREE_MAXIMALE_MS);
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  // Mesuré au navigateur le 2026-09-23 : carte → fiche → retour du navigateur, et la barre
  // REVENAIT sur la liste pour y courir jusqu'au plafond. L'état de la navigation finie restait
  // posé ; il redevenait « visible » dès que l'URL affichée redevenait celle du départ.
  it('la navigation finie ne renaît pas quand le retour du navigateur ramène l’URL de départ', () => {
    const vue = monter();
    fireEvent.click(screen.getByRole('link', { name: 'Villa à Fann' }));
    attendre(DELAI_AVANT_AFFICHAGE_MS);
    expect(screen.getByText('Chargement…')).toBeInTheDocument();

    pathname = '/fr/properties/villa-a-fann';
    parametres = new URLSearchParams();
    vue.rerender(withIntl(<Page />));
    expect(screen.queryByText('Chargement…')).toBeNull();

    // Le retour du navigateur : un `popstate`, aucun clic — rien n'est en cours.
    pathname = '/fr/properties';
    parametres = new URLSearchParams('type=office');
    vue.rerender(withIntl(<Page />));
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  it('une page restaurée depuis le cache arrière-avant repart sans barre', () => {
    monter();
    fireEvent.click(screen.getByRole('link', { name: 'Villa à Fann' }));
    attendre(DELAI_AVANT_AFFICHAGE_MS);
    expect(screen.getByText('Chargement…')).toBeInTheDocument();

    const retour = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(retour, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(retour);
    });
    expect(screen.queryByText('Chargement…')).toBeNull();
  });
});

describe('il est monté une fois, pour tout le produit', () => {
  // Le layout racine est un composant serveur (cookies, session, polices) que jsdom ne rend pas :
  // c'est son SOURCE qu'on lit. Sans cette ligne, tout ce qui précède resterait vert et aucun clic
  // du site ne montrerait rien — exactement le défaut rapporté.
  it('dans le layout racine, hors de toute frontière qui envelopperait les pages', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    expect(source).toMatch(/import \{ IndicateurDeNavigation \} from '@\/components\/shared\/IndicateurDeNavigation';/);
    expect(source.match(/<IndicateurDeNavigation \/>/g)).toHaveLength(1);
  });
});
