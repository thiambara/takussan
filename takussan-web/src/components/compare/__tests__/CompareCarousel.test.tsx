import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';

import { CompareCarousel } from '../CompareCarousel';
import type { CompareColumn } from '../CompareTable';
import messages from '@/messages/fr.json';
import { RACINE, SOMBRE, declaration, opacite } from '@/test/__tests__/couleur-compilee';
import { boite, cibleTactile, decalage, modele } from './boite-compilee';
import { makeProperty } from './bien-de-test';

/**
 * TCK-577 — le comparateur MOBILE se lit sans défiler de côté, et chaque valeur dit à quel bien
 * elle appartient.
 *
 * Relevé du 2026-09-24 à 360 × 740, quatre biens : l'en-tête était une bande de cartes de 308 px
 * de haut qui défilait horizontalement (1 151 px de contenu pour 328 visibles), premier critère
 * à 525 px. Ce fichier garde les trois propriétés du correctif que jsdom peut voir — la mesure
 * de hauteur, elle, est au navigateur (cf. le ticket) :
 *
 * 1. une grille d'UNE colonne par bien, et aucun conteneur à défilement horizontal ;
 * 2. une rangée de titres COLLANTE, à la hauteur exacte de la barre de navigation mobile ;
 * 3. le MÊME numéro devant le titre d'un bien dans la rangée collante et devant chacune de ses
 *    valeurs — c'est lui qui relie la ligne lue à la colonne quand la photo a défilé.
 */

vi.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- doublure de `next/image` dans un test.
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}

const QUATRE: CompareColumn[] = [
  { id: 11, property: makeProperty({ id: 11, title: 'Parking couvert à Pikine', slug: 'parking-pikine' }) },
  { id: 12, property: makeProperty({ id: 12, title: 'Villa luxueuse à Sicap', slug: 'villa-sicap', price: 2_090_000 }) },
  { id: 13, property: makeProperty({ id: 13, title: 'Villa moderne à Ouakam', slug: 'villa-ouakam', price: 1_840_000 }) },
  { id: 14, property: makeProperty({ id: 14, title: 'Maison familiale Ouest Foire', slug: 'maison-of', price: 1_910_000 }) },
];

describe('<CompareCarousel> — lisible sans défiler de côté (TCK-577)', () => {
  it('une colonne par bien, dans les deux rangées, et aucun défilement horizontal', () => {
    const { container } = render(wrap(<CompareCarousel columns={QUATRE} onRemove={() => undefined} />));

    for (const testId of ['compare-vignettes', 'compare-titres']) {
      const rangee = screen.getByTestId(testId);
      expect(rangee.style.gridTemplateColumns, testId).toBe('repeat(4, minmax(0, 1fr))');
      expect(rangee.children, testId).toHaveLength(4);
    }
    // L'ancienne bande de cartes : `overflow-x-auto` + accrochage horizontal.
    const defilants = [...container.querySelectorAll<HTMLElement>('*')].filter((el) =>
      /(^|\s)(overflow-x-(auto|scroll)|snap-x)(\s|$)/.test(el.className),
    );
    expect(defilants.map((el) => el.className)).toEqual([]);
  });

  it('deux biens : deux colonnes, pas quatre', () => {
    render(wrap(<CompareCarousel columns={QUATRE.slice(0, 2)} onRemove={() => undefined} />));
    expect(screen.getByTestId('compare-titres').style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
  });

  it('la rangée des titres colle sous la barre de navigation, à la hauteur de sa cale', () => {
    render(wrap(<CompareCarousel columns={QUATRE} onRemove={() => undefined} />));
    // La cale de la `Navbar` fixe (`NavbarSpacer`) déclare sa hauteur SOUS `lg` en premier ; le
    // comparateur mobile n'existe que sous `md`. Les deux valeurs doivent rester égales.
    const cale = fs.readFileSync(
      path.join(process.cwd(), 'src/components/home/NavbarSpacer.tsx'),
      'utf8',
    );
    const hauteur = cale.match(/className="h-\[(\d+)px\]/)?.[1];
    expect(hauteur, 'hauteur mobile de la cale introuvable').toBeTruthy();

    const classes = screen.getByTestId('compare-titres').className.split(/\s+/);
    expect(classes).toContain('sticky');
    // Assemblée par morceaux : Tailwind lit aussi les tests, et un gabarit entier y serait une classe.
    expect(classes).toContain(['top-[', hauteur, 'px]'].join(''));
  });

  /**
   * Vérification adverse : ce test lisait seulement « une classe commence par `bg-` » — un
   * `bg-transparent` le laissait vert, et les critères auraient défilé À TRAVERS les titres. La
   * valeur est désormais COMPILÉE et évaluée contre `globals.css`, dans les deux thèmes.
   */
  it('la rangée collante a un fond OPAQUE, en clair comme en sombre', async () => {
    render(wrap(<CompareCarousel columns={QUATRE} onRemove={() => undefined} />));
    const fonds = screen
      .getByTestId('compare-titres')
      .className.split(/\s+/)
      .filter((c) => c.startsWith('bg-'));
    const valeurs = (
      await Promise.all(fonds.map((c) => declaration(c, 'background-color')))
    ).filter((d): d is NonNullable<typeof d> => d !== null);
    expect(valeurs, 'aucune couleur de fond compilée').not.toHaveLength(0);
    for (const { valeur } of valeurs) {
      expect(opacite(valeur, RACINE), `clair : ${valeur}`).toBe(1);
      expect(opacite(valeur, SOMBRE), `sombre : ${valeur}`).toBe(1);
    }
  });

  /**
   * L'EXIGENCE du ticket — le premier critère dans le premier écran — se mesure au navigateur ;
   * jsdom ne pose aucune boîte. Ce test garde ce qui la rend vraie : un en-tête de HAUTEUR FIXE,
   * indépendante de la largeur et du nombre de biens (une photo 4:3 ferait 272 px de haut à
   * 2 biens sur 767 px), et dont la somme tient dans le budget relevé.
   *
   * Le budget vient de la mesure la plus serrée, 320 × 640 (cf. TCK-577) : l'en-tête de page occupe
   * 221 px au-dessus des vignettes et le premier critère 158 px ; il reste 640 − 221 − 158 = 261 px
   * pour les vignettes, les titres et les marges. Le modèle rend 129 px — et 57 px pour la rangée
   * des titres, exactement la hauteur relevée au navigateur.
   *
   * Reprise du 2026-09-24 : ce test lisait UNE classe par propriété (« la classe `h-…` du
   * cadre ») — `h-14 min-h-64` sur le cadre le laissait vert, la vignette faisant alors 256 px.
   * Le décalage est désormais calculé par `boite-compilee.ts` sur TOUTES les classes compilées de
   * chaque élément traversé, et toute propriété qu'il ne sait pas mesurer le fait lever.
   */
  it('l’en-tête des biens a une hauteur FIXE, dans le budget du premier écran à 320 × 640', async () => {
    const decalages = new Set<number>();
    const jeux: CompareColumn[][] = [QUATRE.slice(0, 2), QUATRE, [QUATRE[0], { id: 99, property: null }]];
    for (const biens of jeux) {
      const { unmount } = render(wrap(<CompareCarousel columns={biens} onRemove={() => undefined} />));
      const groupe = screen.getByRole('group');
      const cadre = screen.getByTestId('compare-vignettes').querySelector('li > div')!;
      const titres = screen.getByTestId('compare-titres');
      const premierCritere = document.querySelector('section[data-divergent]')!;

      for (const largeur of [320, 767]) {
        const contexte = `${biens.length} biens à ${largeur} px`;
        // Le cadre DÉCLARE sa hauteur : il ne la tient pas de la photo qu'il contient.
        expect((await modele(cadre, largeur)).hauteur, `${contexte} : le cadre doit fixer sa hauteur`).toBeDefined();
        expect((await boite(titres, largeur)).hauteur, `${contexte} : rangée des titres, relevée à 57 px au navigateur`).toBe(57);

        const y = await decalage(groupe, premierCritere, largeur);
        expect(y, `${contexte} : premier critère`).toBeLessThanOrEqual(261);
        decalages.add(y);
      }
      unmount();
    }
    expect([...decalages], 'le premier critère doit arriver au même endroit, quels que soient la largeur et le nombre de biens').toHaveLength(1);
    expect([...decalages][0]).toBe(129);
  });

  /**
   * Reprise du 2026-09-24 : aucun test ne gardait la cible de 44 px du bouton « Retirer » — 28 px
   * dessinés (`size-7`), le reste par un `::after` qui déborde de 8 px de chaque côté. Retirer
   * `after:absolute after:-inset-2 after:content-['']` laissait tout vert.
   *
   * Seconde reprise : `after:hidden`, `after:pointer-events-none` et `overflow-hidden` sur la liste
   * des vignettes le laissaient encore vert (28 × 28, 28 × 28 et 40 × 40 au navigateur). Une part
   * de zone non affichée ou sans `pointer-events` ne compte plus, et le rognage se cherche jusqu'à
   * la racine du rendu — la liste qui rognait était la borne où l'ancien parcours s'arrêtait.
   */
  it('chaque bouton « Retirer » offre 44 × 44 px d’appui, sans cadre qui les rogne', async () => {
    render(wrap(<CompareCarousel columns={QUATRE} onRemove={() => undefined} />));
    const vignettes = screen.getByTestId('compare-vignettes');
    const boutons = within(vignettes).getAllByRole('button');
    expect(boutons).toHaveLength(4);
    for (const bouton of boutons) {
      for (const largeur of [320, 767]) {
        const cible = await cibleTactile(bouton, largeur);
        const ou = `${bouton.getAttribute('aria-label')} à ${largeur} px`;
        expect(cible.exclusions, `${ou} : une part de la zone ne reçoit pas l’appui`).toEqual([]);
        expect(cible.largeur, ou).toBeGreaterThanOrEqual(44);
        expect(cible.hauteur, ou).toBeGreaterThanOrEqual(44);
        expect(cible.rognePar, `${ou} : un ancêtre à overflow non visible rognerait la zone d’appui`).toEqual([]);
      }
    }
  });

  it('chaque valeur porte le numéro de son bien — le même que dans la rangée des titres', () => {
    render(wrap(<CompareCarousel columns={QUATRE} onRemove={() => undefined} />));

    const titres = within(screen.getByTestId('compare-titres')).getAllByRole('listitem');
    titres.forEach((li, i) => {
      expect(li.querySelector('[data-numero]')?.textContent).toBe(String(i + 1));
      const lien = within(li).getByRole('link');
      expect(lien).toHaveTextContent(QUATRE[i].property!.title);
      expect(lien.getAttribute('href')).toContain(`/properties/${QUATRE[i].property!.slug}`);
    });

    const criteres = document.querySelectorAll('section[data-divergent]');
    expect(criteres.length).toBeGreaterThan(3);
    for (const critere of criteres) {
      const termes = critere.querySelectorAll('dt');
      expect(termes).toHaveLength(4);
      termes.forEach((dt, i) => {
        expect(dt.querySelector('[data-numero]')?.textContent, `« ${dt.textContent} »`).toBe(String(i + 1));
        expect(dt).toHaveTextContent(QUATRE[i].property!.title);
      });
    }
  });

  it('le numéro est un repère visuel : un lecteur d’écran entend le titre, pas « 1 »', () => {
    render(wrap(<CompareCarousel columns={QUATRE} onRemove={() => undefined} />));
    for (const numero of document.querySelectorAll('[data-numero]')) {
      expect(numero.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('chaque vignette retire SON bien, et le bouton le nomme', async () => {
    const onRemove = vi.fn();
    render(wrap(<CompareCarousel columns={QUATRE} onRemove={onRemove} />));
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Villa moderne à Ouakam' }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(13);
  });

  it('un bien indisponible reste une colonne, nommée, et retirable', async () => {
    const onRemove = vi.fn();
    render(
      wrap(
        <CompareCarousel
          columns={[QUATRE[0], { id: 99, property: null }]}
          onRemove={onRemove}
        />,
      ),
    );
    const titres = within(screen.getByTestId('compare-titres')).getAllByRole('listitem');
    expect(titres[1]).toHaveTextContent('Bien indisponible');
    expect(within(titres[1]).queryByRole('link')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Bien indisponible' }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(99);
  });
});
