/**
 * D1 de TCK-461 — **les SEPT liens du pied de page, pas les deux qu'on avait éprouvés.**
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE `Footer.test.tsx` NE GARDAIT PAS, ET POURQUOI ÇA NE SE VOYAIT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'AC2 de TCK-437 dit « tout lien interne passe par `LienLocalise` ». C'était vrai, et ça l'est
 * resté — mais la vérification de ce lot (2026-08-28) a posé à la case la seule question qui
 * compte : *si le correctif était absent, cette case serait-elle cochable ?* Elle l'était. Les
 * deux tests de comportement de `Footer.test.tsx` cliquent sur **« Biens en vedette »** et sur
 * **« Comparateur »**. Un `<a href>` nu réintroduit sur l'un des **cinq autres** laissait la suite
 * entièrement verte, alors que c'est exactement le défaut que TCK-437 corrigeait.
 *
 * *Une chaîne dont les deux extrémités sont testées et dont le maillon central ne l'est pas est
 * plus dangereuse qu'une absence franche de test : le fichier existe, il est vert, et il porte le
 * bon nom.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * DEUX PROPRIÉTÉS INDÉPENDANTES, ET AUCUNE N'ÉNUMÈRE LES SEPT `href`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La forme naïve — écrire les sept `href` attendus — **reproduit le défaut qu'elle prétend
 * fermer** : le huitième lien ajouté demain ne serait pas vu. Les deux propriétés ci-dessous se
 * dérivent donc du DOM RENDU, et leur plancher de non-vacuité se dérive de `footerLinks` :
 *
 *  1. **La TRAVERSÉE** (`describe` n°2) — `LienLocalise` est remplacé par un double qui MARQUE
 *     l'ancre qu'il rend. Tout `<a>` du pied de page sans la marque n'est pas passé par lui.
 *     C'est la lettre de D1 : « refuse tout `<a>` dont le `href` n'a pas traversé `LienLocalise` ».
 *     Elle attrape même un `<a href="/fr/properties">` écrit à la main — la langue en dur est un
 *     autre défaut, et la propriété n°2 ne le verrait pas.
 *
 *  2. **L'IDEMPOTENCE** (`describe` n°1) — avec le VRAI `LienLocalise`, tout `href` rendu doit
 *     être un point fixe de `hrefLocalise` : `hrefLocalise('/properties', 'fr')` rend
 *     `/fr/properties`, donc un chemin public non préfixé se dénonce lui-même. Cette propriété-là
 *     ne dépend d'aucun double : elle rougirait aussi si `LienLocalise` cessait de localiser.
 *
 * Le plancher est le même des deux côtés et il est DÉRIVÉ : le nombre d'entrées des colonnes non
 * vides de `footerLinks`. Un sélecteur cassé rendrait zéro ancre et les deux règles seraient vertes
 * sans rien mesurer — c'est le mode de défaillance que ce plancher ferme.
 *
 * ⚠ **Ce que ce fichier ne garde pas** : le `href` de destination. C'est `Footer.test.tsx`
 * (AC4, `routeExiste`) qui vérifie que chaque entrée mène à une route existante, et
 * `src/data/__tests__/navigation.test.ts` qui refuse un `href: '#'`. Trois angles, trois fichiers,
 * aucun recouvrement.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { hrefLocalise } from '@/i18n/navigation';
import { footerLinks } from '@/data/navigation';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>
      {children}
    </a>
  ),
}));

/**
 * Le PLANCHER, dérivé de la source des colonnes — jamais un nombre écrit.
 *
 * Une colonne vide n'est pas rendue (`Footer.tsx`), d'où le filtre. Le jour où une huitième entrée
 * est ajoutée, ce nombre suit ; le jour où une ancre apparaît SANS entrée correspondante — c'est
 * la définition d'un `<a>` écrit à la main — il ne suit pas.
 */
const ENTREES_ATTENDUES = Object.values(footerLinks)
  .filter((colonne) => colonne.length > 0)
  .reduce((total, colonne) => total + colonne.length, 0);

function ancresDuPied(): HTMLAnchorElement[] {
  const zones = screen.getAllByRole('contentinfo');
  const zone = zones[zones.length - 1]!;
  return [...zone.querySelectorAll('a')];
}

describe('TCK-461 / D1 — tout href du pied de page est LOCALISÉ (idempotence)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('@/components/shared/LienLocalise');
  });

  it('la dérivation du plancher n’est pas vide (elle est la garde de la garde)', () => {
    expect(ENTREES_ATTENDUES).toBeGreaterThanOrEqual(5);
  });

  it('chaque ancre rendue est un point fixe de hrefLocalise, et il y en a autant que d’entrées', async () => {
    const { Footer } = await import('@/components/home/Footer');
    render(withIntl(<Footer />));

    const ancres = ancresDuPied();

    for (const ancre of ancres) {
      const href = ancre.getAttribute('href') ?? '';
      expect(href, 'une ancre sans href').not.toBe('');
      expect(
        hrefLocalise(href, 'fr'),
        `« ${href} » n'a pas traversé hrefLocalise : hrefLocalise le réécrirait en ` +
          `« ${hrefLocalise(href, 'fr')} ». Passe ce lien par <LienLocalise>.`,
      ).toBe(href);
    }

    // Le PLANCHER, joué en dernier : il ne dit pas la règle, il dit qu'elle a porté sur quelque
    // chose. Une ancre de PLUS que d'entrées déclarées est, par construction, une ancre écrite à
    // la main dans le JSX — et une de MOINS est un sélecteur cassé.
    expect(ancres).toHaveLength(ENTREES_ATTENDUES);
  });
});

describe('TCK-461 / D1 — tout href du pied de page a TRAVERSÉ LienLocalise', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('aucune ancre du pied de page n’échappe au composant', async () => {
    // Le double MARQUE ce qu'il rend. Il ne remplace pas la vérification du `href` (c'est le
    // `describe` ci-dessus qui la porte) : il répond à une question que le DOM seul ne peut pas
    // trancher — cette ancre-là est-elle sortie de `LienLocalise`, ou du JSX du pied de page ?
    vi.doMock('@/components/shared/LienLocalise', () => ({
      LienLocalise: ({
        href,
        children,
        ...reste
      }: React.ComponentProps<'a'> & { href: string }) => (
        <a href={hrefLocalise(href, 'fr')} data-via-lien-localise="" {...reste}>
          {children}
        </a>
      ),
    }));

    const { Footer } = await import('@/components/home/Footer');
    render(withIntl(<Footer />));

    const ancres = ancresDuPied();
    const nues = ancres
      .filter((a) => !a.hasAttribute('data-via-lien-localise'))
      .map((a) => a.getAttribute('href') ?? a.outerHTML);

    expect(
      nues,
      'ces ancres sont écrites en <a> nu dans Footer.tsx : elles rechargent le document, ' +
        `perdent l'état client et ne portent pas la langue — ${nues.join(', ')}`,
    ).toEqual([]);

    expect(ancres).toHaveLength(ENTREES_ATTENDUES);

    vi.doUnmock('@/components/shared/LienLocalise');
  });
});
