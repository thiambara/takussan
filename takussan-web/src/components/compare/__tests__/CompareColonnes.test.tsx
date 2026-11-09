import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';

import { CompareColonnes, RESERVE_BARRE_PARTAGER, type CompareColumn } from '../CompareColonnes';
import messages from '@/messages/fr.json';
import { RACINE, SOMBRE, declaration, opacite } from '@/test/__tests__/couleur-compilee';
import { affichage, cibleTactile, nonVu } from './boite-compilee';
import { makeProperty } from './bien-de-test';
import type { PropertyDetail } from '@/types/property';

/**
 * TCK-2509 — le comparateur en colonnes alignées : une ligne par critère, les valeurs sous leur
 * bien, seulement ce qui diffère par défaut, le meilleur marqué là où il a un sens.
 */

vi.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- doublure de `next/image` dans un test.
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}

/** Trois locations au mois, à Dakar, en appartement : ville, type, contrat et période identiques. */
function location(id: number, o: Partial<PropertyDetail>): CompareColumn {
  return {
    id,
    property: makeProperty({
      id,
      slug: `bien-${id}`,
      title: `Bien ${id}`,
      contract_type: 'rent',
      contract_type_label: 'Location',
      rent_period: 'monthly',
      rent_period_label: 'Mensuel',
      type: 'apartment',
      type_label: 'Appartement',
      floor_number: id,
      year_built: 2020,
      parking_spaces: 1,
      bathrooms: 2,
      tags: [],
      ...o,
      location: { ...makeProperty().location, city: 'Dakar', quarter: `Quartier ${id}`, ...(o.location ?? {}) },
    }),
  };
}

const TROIS: CompareColumn[] = [
  location(1, { price: 650_000, area: 140, bedrooms: 3, furnished: false }),
  location(2, { price: 550_000, area: 95, bedrooms: 2, furnished: true }),
  location(3, { price: 380_000, area: 62, bedrooms: 1, furnished: false }),
];

function ligne(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[role="row"][data-ligne="${id}"]`);
}

function marques(id: string): number[] {
  const rangee = ligne(id);
  if (!rangee) throw new Error(`ligne ${id} absente`);
  return within(rangee)
    .getAllByRole('cell')
    .map((cellule, i) => (cellule.querySelector('[data-meilleur="true"]') ? i : -1))
    .filter((i) => i >= 0);
}

describe('<CompareColonnes> — seulement ce qui diffère (AC1)', () => {
  it('les critères identiques ne sont pas en ligne, et « Pareil pour les 3 » les nomme', () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));

    for (const id of ['city', 'type', 'contract_type', 'rent_period', 'year_built', 'parking_spaces', 'bathrooms']) {
      expect(ligne(id), `« ${id} » est pareil pour les trois`).toBeNull();
    }
    for (const id of ['price', 'area', 'bedrooms', 'floor_number', 'furnished', 'quarter', 'price_per_m2']) {
      expect(ligne(id), `« ${id} » diffère`).not.toBeNull();
    }

    const pareil = screen.getByTestId('compare-pareil');
    expect(pareil).toHaveTextContent('Pareil pour les 3');
    expect(pareil).toHaveTextContent('Ville : Dakar');
    expect(pareil).toHaveTextContent('Type de bien : Appartement');
  });

  it('« + N autres » déplie la phrase quand elle nomme plus de quatre critères', async () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));
    const pareil = screen.getByTestId('compare-pareil');
    // 7 critères pareils : contrat, type, période, ville, salles de bain, année, parking.
    expect(pareil).not.toHaveTextContent('Places de parking : 1');
    const bouton = within(pareil).getByRole('button', { name: '+ 3 autres' });
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(bouton);
    expect(pareil).toHaveTextContent('Places de parking : 1');
    expect(within(pareil).getByRole('button', { name: 'Voir moins' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('la bascule montre tout : les lignes identiques reviennent, la phrase s’efface', async () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));
    const bascule = screen.getByRole('switch', { name: 'Seulement ce qui diffère' });
    expect(bascule).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(bascule);
    expect(bascule).toHaveAttribute('aria-checked', 'false');
    expect(ligne('city')).not.toBeNull();
    expect(ligne('city')).toHaveAttribute('data-divergent', 'false');
    expect(screen.queryByTestId('compare-pareil')).toBeNull();
  });

  it('une ligne vide pour tous les biens ne s’affiche pas, même en « tout afficher » (TCK-491)', async () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));
    await userEvent.click(screen.getByRole('switch'));
    // Aucun des trois n'a de statut foncier ni de coût d'entrée.
    expect(ligne('title_type')).toBeNull();
    expect(ligne('entry_cost')).toBeNull();
    // `false` porte une valeur : « Meublé » reste.
    expect(ligne('furnished')).not.toBeNull();
  });
});

describe('<CompareColonnes> — le meilleur marqué, là où il a un sens (AC2)', () => {
  it('le moins cher porte la marque sur la ligne Prix ; aucune marque sur Étage ni Meublé', () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));
    expect(marques('price')).toEqual([2]);
    expect(marques('floor_number')).toEqual([]);
    expect(marques('furnished')).toEqual([]);
    expect(marques('quarter')).toEqual([]);
    expect(marques('bedrooms')).toEqual([]);
  });

  it('le plus grand sur Surface, le moins cher au m² sur « Loyer au m² »', () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));
    expect(marques('area')).toEqual([0]);
    // 650 000 / 140 = 4 643 ; 550 000 / 95 = 5 789 ; 380 000 / 62 = 6 129.
    expect(marques('price_per_m2')).toEqual([0]);
    const parM2 = ligne('price_per_m2')!;
    expect(within(parM2).getByRole('rowheader')).toHaveTextContent('Loyer au m²');
    expect(within(parM2).getAllByRole('cell')[0].textContent).toMatch(/4\s?643/);
  });

  it('le coût d’entrée le plus bas est marqué', () => {
    const avecEntree = TROIS.map((c, i) => ({
      ...c,
      property: {
        ...c.property,
        entry_cost: { deposit_months: 2, advance_months: 1, agency_fee_months: 1, monthly_charges: null, total: [3_900_000, 1_520_000, 2_750_000][i] },
      },
    }));
    render(wrap(<CompareColonnes columns={avecEntree} onRemove={() => undefined} />));
    expect(marques('entry_cost')).toEqual([1]);
  });

  it('la marque est annoncée, pas seulement peinte', () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));
    const marquee = within(ligne('price')!).getAllByRole('cell')[2];
    expect(marquee).toHaveTextContent('(le moins cher)');
    const plusGrand = within(ligne('area')!).getAllByRole('cell')[0];
    expect(plusGrand).toHaveTextContent('(le plus grand)');
  });

  it('aucune marque d’argent entre une vente et une location, ni entre deux devises, ni entre deux périodes', () => {
    const melanges: [string, CompareColumn[]][] = [
      ['vente et location', [TROIS[0], location(9, { price: 90_000_000, area: 300, contract_type: 'sale', rent_period: null })]],
      ['deux devises', [TROIS[0], location(9, { price: 500, area: 300, currency: 'EUR' })]],
      ['nuit et mois', [TROIS[0], location(9, { price: 40_000, area: 300, rent_period: 'daily' })]],
    ];
    for (const [cas, colonnes] of melanges) {
      const { unmount } = render(wrap(<CompareColonnes columns={colonnes} onRemove={() => undefined} />));
      expect(marques('price'), `${cas} : prix`).toEqual([]);
      expect(marques('price_per_m2'), `${cas} : au m²`).toEqual([]);
      // La surface, elle, se compare toujours.
      expect(marques('area'), `${cas} : surface`).toEqual([1]);
      unmount();
    }
  });

  it('une location sans période déclarée se compare à une location au mois', () => {
    const colonnes = [TROIS[0], location(9, { price: 300_000, area: 140, rent_period: null })];
    render(wrap(<CompareColonnes columns={colonnes} onRemove={() => undefined} />));
    expect(marques('price')).toEqual([1]);
  });

  it('les ex æquo sont tous marqués ; des valeurs toutes égales n’ont pas de meilleur', async () => {
    const colonnes = [
      location(1, { price: 400_000, area: 100 }),
      location(2, { price: 400_000, area: 100 }),
      location(3, { price: 500_000, area: 100 }),
    ];
    render(wrap(<CompareColonnes columns={colonnes} onRemove={() => undefined} />));
    expect(marques('price')).toEqual([0, 1]);
    await userEvent.click(screen.getByRole('switch'));
    expect(marques('area')).toEqual([]);
  });

  it('« Prix au m² » dès qu’un bien n’est pas une location', () => {
    const colonnes = [TROIS[0], location(9, { price: 90_000_000, area: 300, contract_type: 'sale', rent_period: null })];
    render(wrap(<CompareColonnes columns={colonnes} onRemove={() => undefined} />));
    expect(within(ligne('price_per_m2')!).getByRole('rowheader')).toHaveTextContent('Prix au m²');
  });

  /**
   * Revue adverse : à DEUX biens, une valeur absente ne laisse qu'une valeur, et rien ne se marque
   * de toute façon ; une absence comptée 0 (`?? 0`) passait verte. À trois biens, un bien sans
   * valeur ne prend pas la marque et n'en prive pas le vrai meilleur.
   */
  it('à trois biens, un bien sans valeur ne prend pas la marque et n’en prive pas le vrai meilleur', () => {
    const colonnes = [
      location(1, { price: 400_000, area: null }),
      location(2, { price: 500_000, area: 100 }),
      location(3, { price: 600_000, area: 100 }),
    ];
    render(wrap(<CompareColonnes columns={colonnes} onRemove={() => undefined} />));
    // Au m² : 5 000 (bien 2) contre 6 000 (bien 3) ; le bien 1, sans surface, n'a pas de valeur.
    expect(within(ligne('price_per_m2')!).getAllByRole('cell')[0]).toHaveTextContent('—');
    expect(marques('price_per_m2')).toEqual([1]);
    expect(marques('price')).toEqual([0]);
  });

  /**
   * Contre-vérification : l'API accepte un prix de 0 (`'price' => ['required','numeric','min:0']`,
   * StorePropertyRequest) — un prix « sur demande », pas un bien gratuit. Il n'est pas le moins cher.
   */
  it('un bien à prix 0 ne prend pas la marque du moins cher', () => {
    const colonnes = [
      location(1, { price: 0, area: 100 }),
      location(2, { price: 500_000, area: 100 }),
      location(3, { price: 600_000, area: 100 }),
    ];
    render(wrap(<CompareColonnes columns={colonnes} onRemove={() => undefined} />));
    expect(marques('price')).toEqual([1]);
    expect(marques('price_per_m2')).toEqual([1]);
  });

  it('à trois biens, un coût d’entrée inconnu n’est pas le plus bas', () => {
    const avec = (c: CompareColumn, total: number | null): CompareColumn => ({
      ...c,
      property: {
        ...c.property,
        entry_cost: total === null ? null : { deposit_months: 2, advance_months: 1, agency_fee_months: 1, monthly_charges: null, total },
      },
    });
    render(wrap(<CompareColonnes columns={[avec(TROIS[0], null), avec(TROIS[1], 2_000_000), avec(TROIS[2], 1_500_000)]} onRemove={() => undefined} />));
    expect(marques('entry_cost')).toEqual([2]);
  });

  it('un seul bien valué parmi trois : pas de marque', () => {
    const colonnes = [
      location(1, { price: 400_000, area: 100 }),
      location(2, { price: 500_000, area: null }),
      location(3, { price: 600_000, area: null }),
    ];
    render(wrap(<CompareColonnes columns={colonnes} onRemove={() => undefined} />));
    expect(marques('price_per_m2')).toEqual([]);
  });

  it('sans surface, pas de prix au m² : la cellule reste vide', () => {
    const colonnes = [TROIS[0], location(9, { price: 300_000, area: null })];
    render(wrap(<CompareColonnes columns={colonnes} onRemove={() => undefined} />));
    const cellules = within(ligne('price_per_m2')!).getAllByRole('cell');
    expect(cellules[1]).toHaveTextContent('—');
    expect(marques('price_per_m2')).toEqual([]);
  });
});

describe('<CompareColonnes> — en-tête collant et colonnes (AC5)', () => {
  it('une colonne par bien, aucune largeur minimale, aucun défilement de côté', () => {
    const quatre = [...TROIS, location(4, { price: 700_000, area: 150 })];
    const { container } = render(wrap(<CompareColonnes columns={quatre} onRemove={() => undefined} />));
    const table = screen.getByRole('table');
    expect(table.style.getPropertyValue('--colonnes-mobile')).toBe('repeat(4, minmax(0, 1fr))');
    // Quatre biens : plus de place libre, plus de colonne « Ajouter ».
    expect(table.style.getPropertyValue('--colonnes-bureau')).toBe('minmax(8rem, 13rem) repeat(4, minmax(0, 1fr))');
    expect(within(screen.getByTestId('compare-en-tete')).getAllByRole('button')).toHaveLength(4);
    const defilants = [...container.querySelectorAll<HTMLElement>('*')].filter((el) =>
      /(^|\s)(overflow-x-(auto|scroll)|snap-x|min-w-\[)/.test(el.className),
    );
    expect(defilants.map((el) => el.className)).toEqual([]);
  });

  it('trois biens : la place libre est une colonne « Ajouter un bien » au bureau', () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));
    expect(screen.getByRole('table').style.getPropertyValue('--colonnes-bureau')).toBe(
      'minmax(8rem, 13rem) repeat(4, minmax(0, 1fr))',
    );
    const ajouts = screen.getAllByRole('link', { name: 'Ajouter un bien' });
    expect(ajouts.length).toBeGreaterThan(0);
    for (const a of ajouts) expect(a.getAttribute('href')).toContain('/properties');
  });

  it('l’en-tête colle sous l’en-tête de la page au téléphone, sous la barre du site en bureau', () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));
    const cale = fs.readFileSync(path.join(process.cwd(), 'src/components/home/NavbarSpacer.tsx'), 'utf8');
    const bureau = cale.match(/[\s'"]lg:h-\[(calc\([^\]]+\))\]/)?.[1];
    expect(bureau, 'hauteur de bureau (hors découverte) de la cale introuvable').toBeTruthy();
    // TCK-2568 — au téléphone, `/compare` n'a pas la barre du site : sa rangée collante est celle
    // d'`EnTeteDePage` (`sticky top-0 … h-<n>`), et l'en-tête des colonnes colle dessous.
    const enTete = fs.readFileSync(path.join(process.cwd(), 'src/components/navigation-publique/EnTeteDePage.tsx'), 'utf8');
    const mobile = enTete.match(/'sticky top-0 z-30 flex h-(\d+) /)?.[1];
    expect(mobile, 'hauteur de la rangée d’EnTeteDePage introuvable').toBeTruthy();

    const collant = screen.getByTestId('compare-en-tete').parentElement!;
    const classes = collant.className.split(/\s+/);
    expect(classes).toContain('sticky');
    // Assemblée par morceaux : Tailwind lit aussi les tests, et un gabarit entier y serait une classe.
    expect(classes).toContain(['top-', mobile].join(''));
    expect(classes).toContain(['lg:top-[', bureau, ']'].join(''));
  });

  it('l’en-tête collant a un fond OPAQUE, en clair comme en sombre', async () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));
    const fonds = screen
      .getByTestId('compare-en-tete')
      .parentElement!.className.split(/\s+/)
      .filter((c) => c.startsWith('bg-'));
    const valeurs = (await Promise.all(fonds.map((c) => declaration(c, 'background-color')))).filter(
      (d): d is NonNullable<typeof d> => d !== null,
    );
    expect(valeurs, 'aucune couleur de fond compilée').not.toHaveLength(0);
    for (const { valeur } of valeurs) {
      expect(opacite(valeur, RACINE), `clair : ${valeur}`).toBe(1);
      expect(opacite(valeur, SOMBRE), `sombre : ${valeur}`).toBe(1);
    }
  });

  it('chaque bouton « Retirer » retire SON bien, le nomme, et offre 44 × 44 px d’appui', async () => {
    const onRemove = vi.fn();
    render(wrap(<CompareColonnes columns={TROIS} onRemove={onRemove} />));
    const boutons = within(screen.getByTestId('compare-en-tete')).getAllByRole('button');
    expect(boutons).toHaveLength(3);
    for (const bouton of boutons) {
      for (const largeur of [320, 1366]) {
        const cible = await cibleTactile(bouton, largeur);
        const ou = `${bouton.getAttribute('aria-label')} à ${largeur} px`;
        expect(cible.exclusions, ou).toEqual([]);
        expect(Math.min(cible.largeur, cible.hauteur), ou).toBeGreaterThanOrEqual(44);
        expect(cible.rognePar, ou).toEqual([]);
      }
    }
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Bien 2' }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('chaque en-tête porte le prix, et mène à la fiche', () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} />));
    const entetes = within(screen.getByTestId('compare-en-tete')).getAllByRole('columnheader').filter((h) => h.textContent);
    expect(entetes[2].textContent).toMatch(/380\s?000/);
    expect(entetes[2].textContent).toContain('/mois');
    expect(within(entetes[2]).getByRole('link', { name: 'Bien 3' }).getAttribute('href')).toContain('/properties/bien-3');
    expect(within(entetes[2]).getByRole('link', { name: 'Voir le bien' })).toBeInTheDocument();
  });

  /**
   * Revue adverse (maquette A) : à quatre colonnes au téléphone, le prix et le titre n'y tenaient
   * que tronqués. Sous `md`, un nom court (le quartier, sinon la ville) et « N ch. · S m² » ; le prix
   * et le titre ne se montrent qu'au bureau, et le lien garde le titre entier comme nom.
   */
  it('au téléphone, un nom court et « N ch. · S m² » ; le prix et le titre, au bureau seulement', async () => {
    const sansQuartier = location(4, { price: 700_000, area: 150, bedrooms: 4 });
    sansQuartier.property.location = { ...sansQuartier.property.location, quarter: null, city: 'Thiès' };
    render(wrap(<CompareColonnes columns={[...TROIS, sansQuartier]} onRemove={() => undefined} />));
    const entetes = within(screen.getByTestId('compare-en-tete')).getAllByRole('columnheader').filter((h) => h.textContent);

    const lien = within(entetes[0]).getByRole('link', { name: 'Bien 1' });
    const [court, long] = [...lien.children] as HTMLElement[];
    expect(court).toHaveTextContent('Quartier 1');
    expect(long).toHaveTextContent('Bien 1');
    expect(entetes[0].querySelector('[data-reperes]')).toHaveTextContent('3 ch. · 140 m²');
    expect(within(entetes[3]).getByRole('link', { name: 'Bien 4' }).firstElementChild).toHaveTextContent('Thiès');

    const prix = [...entetes[0].querySelectorAll('p')].find((p) => /650\s?000/.test(p.textContent ?? ''))!;
    for (const largeur of [320, 767]) {
      expect(await affichage(prix, largeur), `prix à ${largeur} px`).toBe('none');
      expect(await affichage(long, largeur), `titre à ${largeur} px`).toBe('none');
      expect(await nonVu(court, largeur), `nom court à ${largeur} px`).toBeNull();
      expect(await nonVu(entetes[0].querySelector('[data-reperes]')!, largeur), `repères à ${largeur} px`).toBeNull();
    }
    for (const largeur of [768, 1366]) {
      expect(await nonVu(prix, largeur), `prix à ${largeur} px`).toBeNull();
      expect(await affichage(court, largeur), `nom court à ${largeur} px`).toBe('none');
    }
  });
});

/** Repris de `CompareTable.test.tsx` (TCK-491), sur la grille qui le remplace. */
/**
 * Maquette A (BarrePartager) : au téléphone, la barre d'onglets cède le bas de `/compare` à une barre
 * FIXÉE « Ajouter un bien · Partager » (ADR-0091 §4, une seule couche ; `barre-publique.ts` retire
 * l'onglet de `/compare`). Au bureau, rien ne change : « Partager » dans la barre d'outils, la place
 * libre en colonne.
 */
describe('<CompareColonnes> — la barre « Partager » du téléphone', () => {
  const partage = <button type="button">Partager</button>;

  it('fixée en bas sous md, absente au bureau ; la page réserve sa hauteur', async () => {
    render(wrap(<CompareColonnes columns={TROIS} onRemove={() => undefined} partage={partage} />));
    const barre = document.querySelector('[data-barre-partager]')!;
    expect(barre, 'barre « Partager » absente').toBeTruthy();
    expect(within(barre as HTMLElement).getByRole('link', { name: 'Ajouter un bien' }).getAttribute('href')).toContain('/properties');
    expect(within(barre as HTMLElement).getByRole('button', { name: 'Partager' })).toBeInTheDocument();
    // Fixée : `modele()` ne lit pas `max(1rem, env(…))` du remplissage bas ; les classes suffisent.
    for (const c of ['fixed', 'inset-x-0', 'bottom-0']) expect(barre.classList, c).toContain(c);
    // Aucun ancêtre ne la ferait défiler avec la page (`transform`, `filter` créent un bloc conteneur).
    for (let a = barre.parentElement; a; a = a.parentElement) {
      expect(a.className, 'un ancêtre transformé ou filtré').not.toMatch(/(^|\s)(transform|translate-|scale-|rotate-|filter|blur-|backdrop-)/);
    }
    expect(await affichage(barre, 390)).toBe('grid');
    // Deux gestes de même largeur : relevé au navigateur, en `flex-1` le remplissage du lien
    // donnait 192 px à « Ajouter un bien » et 158 à « Partager ».
    for (const c of ['grid-flow-col', 'auto-cols-fr']) expect(barre.classList, c).toContain(c);
    expect(barre.children).toHaveLength(2);
    expect(await affichage(barre, 1440)).toBe('none');

    // La page réserve sous son pied de page au moins la hauteur de la barre (77 px), zone sûre comprise.
    expect(RESERVE_BARRE_PARTAGER).toContain('env(safe-area-inset-bottom)');
    expect(RESERVE_BARRE_PARTAGER).toContain('md:pb-0');
    const rem = Number(RESERVE_BARRE_PARTAGER.match(/^pb-\[calc\((\d+(?:\.\d+)?)rem\+env/)![1]);
    expect(rem * 16).toBeGreaterThanOrEqual(77);

    // Au bureau, « Partager » reste dans la barre d'outils.
    const partages = screen.getAllByRole('button', { name: 'Partager' }).filter((b) => !barre.contains(b));
    expect(partages).toHaveLength(1);
    expect(await nonVu(partages[0], 1440)).toBeNull();
  });

  it('sans place libre, « Partager » seul prend toute la largeur', () => {
    const quatre = [...TROIS, location(4, { price: 700_000, area: 150 })];
    render(wrap(<CompareColonnes columns={quatre} onRemove={() => undefined} partage={partage} />));
    const barre = document.querySelector('[data-barre-partager]') as HTMLElement;
    expect(within(barre).queryByRole('link', { name: 'Ajouter un bien' })).toBeNull();
    // Une seule colonne de la grille : toute la largeur.
    expect(barre.children).toHaveLength(1);
    expect(within(barre).getByRole('button', { name: 'Partager' }).parentElement!.className).toContain('[&>*]:w-full');
  });
});

describe('<CompareColonnes> — statut foncier et lignes vides (TCK-491)', () => {
  const vente = (id: number, o: Partial<PropertyDetail> = {}): CompareColumn => ({
    id,
    property: makeProperty({ id, slug: `v-${id}`, title: `Vente ${id}`, ...o }),
  });
  async function toutAfficher() {
    await userEvent.click(screen.getByRole('switch'));
  }

  it('AC1 — deux statuts différents rendent la ligne, et elle est signalée divergente', () => {
    render(wrap(<CompareColonnes columns={[
      vente(1, { title_type: 'bail', title_type_label: 'Bail' }),
      vente(2, { title_type: 'titre_foncier', title_type_label: 'Titre foncier' }),
    ]} onRemove={() => undefined} />));
    const rangee = ligne('title_type')!;
    expect(within(rangee).getByRole('rowheader')).toHaveTextContent('Titre foncier');
    expect(rangee).toHaveAttribute('data-divergent', 'true');
    expect(rangee).toHaveTextContent('Bail');
  });

  it('AC2 — deux biens sans statut foncier n’affichent pas la ligne, ni dans « Pareil »', async () => {
    render(wrap(<CompareColonnes columns={[vente(1), vente(2)]} onRemove={() => undefined} />));
    expect(screen.getByTestId('compare-pareil')).not.toHaveTextContent('Titre foncier');
    await toutAfficher();
    expect(ligne('title_type')).toBeNull();
  });

  it('AC3 — la valeur affichée est le libellé émis par l’API, jamais un second vocabulaire', () => {
    render(wrap(<CompareColonnes columns={[
      vente(1, { title_type: 'deliberation', title_type_label: 'Délibération' }),
      vente(2, { title_type: null, title_type_label: null }),
    ]} onRemove={() => undefined} />));
    expect(screen.getByText('Délibération')).toBeInTheDocument();
  });

  it('deux ventes : la périodicité, nulle des deux côtés, n’est ni une ligne ni un « pareil »', async () => {
    render(wrap(<CompareColonnes columns={[vente(1), vente(2)]} onRemove={() => undefined} />));
    expect(screen.getByTestId('compare-pareil')).not.toHaveTextContent('Périodicité');
    await toutAfficher();
    expect(ligne('rent_period')).toBeNull();
    expect(ligne('price')).not.toBeNull();
  });

  it('`false` n’est pas une absence : « Meublé : Non » est un pareil, puis une ligne', async () => {
    render(wrap(<CompareColonnes columns={[vente(1, { furnished: false }), vente(2, { furnished: false })]} onRemove={() => undefined} />));
    await userEvent.click(within(screen.getByTestId('compare-pareil')).getByRole('button'));
    expect(screen.getByTestId('compare-pareil')).toHaveTextContent('Meublé : Non');
    await toutAfficher();
    expect(ligne('furnished')).not.toBeNull();
  });
});
