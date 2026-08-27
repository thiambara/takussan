import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withIntl } from '@/test/intl';
import { LISTES_PAR_SECTION, listePour } from '@/lib/navigation/app-sections';

/**
 * AC2 — l'introuvable du tableau de bord (TCK-382).
 *
 * ⚠ Ce que ce fichier NE peut PAS prouver, et qu'il ne faut donc pas lire dans son vert : que
 * l'écran est rendu **dans le shell**, barre latérale comprise. Cela dépend de l'endroit où Next
 * insère la frontière `not-found`, et aucun harnais jsdom ne monte le routeur de Next. La
 * question a été tranchée par MESURE, pas par déduction : sonde jetable sur `next dev` (Next
 * 16.3.1) le 2026-08-27, deux couches de layouts au-dessus d'un `notFound()` —
 *
 *     GET /sonde-404/nu  →  404  ·  le layout du segment portant not-found.tsx REND
 *                              ·  le layout PLUS PROFOND rend aussi
 *
 * — d'où le placement du fichier sous `app/`, dont `layout.tsx` monte `AppShell`. La sonde a été
 * supprimée ; le relevé vit dans le docblock de `not-found.tsx` et dans le rapport du ticket.
 */
const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

const usePathnameMock = vi.fn<() => string>();
vi.mock('next/navigation', () => ({ usePathname: () => usePathnameMock() }));

// Import dynamique : `vi.mock` doit être posé avant que le module ne lise `usePathname`.
const { default: AppNotFound } = await import('../not-found');

beforeEach(() => {
  usePathnameMock.mockReset();
});

describe('TCK-382 / AC2 — l’écran introuvable', () => {
  it('dit l’absence sans affirmer laquelle des deux causes, et n’offre AUCUNE reprise', () => {
    usePathnameMock.mockReturnValue('/app/leases/999');
    render(withIntl(<AppNotFound />));

    expect(screen.getByText('Introuvable')).toBeInTheDocument();
    // Les deux causes — objet absent, objet hors agence — sont couvertes, aucune n'est affirmée.
    expect(
      screen.getByText(/n'existe pas, ou il ne relève pas de votre agence/),
    ).toBeInTheDocument();
    // Un « réessayer » ferait de l'absence une panne. `error.tsx` en a un ; celui-ci n'en a pas.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/[Rr]éessayer/)).not.toBeInTheDocument();
  });

  it('ramène vers la LISTE dont l’objet manquant relève', () => {
    usePathnameMock.mockReturnValue('/app/leases/999');
    render(withIntl(<AppNotFound />));

    const versLaListe = screen.getByRole('link', { name: 'Revenir à la liste' });
    expect(versLaListe).toHaveAttribute('href', '/app/leases');
    expect(screen.getByRole('link', { name: 'Retour au tableau de bord' })).toHaveAttribute('href', '/app');
  });

  it('change de liste avec la section — le lien n’est pas figé', () => {
    // Non-vacuité du test précédent : un `href="/app/leases"` codé en dur le passerait aussi.
    usePathnameMock.mockReturnValue('/app/properties/42');
    render(withIntl(<AppNotFound />));
    expect(screen.getByRole('link', { name: 'Revenir à la liste' })).toHaveAttribute(
      'href',
      '/app/properties',
    );
  });

  it('n’invente pas de liste pour une section inconnue', () => {
    // Proposer `/app/<inconnu>` comme remède à un introuvable, c'est en offrir un second.
    usePathnameMock.mockReturnValue('/app/section-qui-nexiste-pas/7');
    render(withIntl(<AppNotFound />));
    expect(screen.queryByRole('link', { name: 'Revenir à la liste' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour au tableau de bord' })).toBeInTheDocument();
  });

  it('rend le libellé de la langue active', () => {
    usePathnameMock.mockReturnValue('/app/leases/999');
    render(withIntl(<AppNotFound />, 'en'));
    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the list' })).toBeInTheDocument();
  });
});

describe('TCK-382 — l’écran introuvable est rendu par le SERVEUR', () => {
  it('not-found.tsx n’est pas un module client', () => {
    // Mesuré le 2026-08-27 par sonde jetable, sur `next dev` ET sur `next build` + `next start` :
    // un `not-found.tsx` marqué `'use client'` n'apparaît PAS dans le HTML de la réponse 404 —
    // l'écran reste vide jusqu'à l'hydratation. Un composant SERVEUR y apparaît.
    //
    // Ce test lit une directive, pas un rendu : jsdom ne peut pas observer le HTML que Next
    // produit. C'est un cliquet sur la CAUSE, comme
    // `(public)/properties/[slug]/__tests__/pas-de-frontiere-de-suspension.test.ts`.
    const source = readFileSync(join(APP, 'not-found.tsx'), 'utf8');
    expect(source.split('\n').slice(0, 3).join('\n')).not.toMatch(/['"]use client['"]/);
  });

  it('le seul morceau client est le raccourci contextuel', () => {
    // Non-vacuité : si `RetourVersLaListe` cessait d'être client, `usePathname()` casserait —
    // et l'assertion ci-dessus resterait verte en ayant supprimé la fonctionnalité.
    const source = readFileSync(join(APP, 'RetourVersLaListe.tsx'), 'utf8');
    expect(source.split('\n')[0]).toMatch(/['"]use client['"]/);
    expect(source).toContain('usePathname');
  });
});

describe('TCK-382 — la table des listes ne peut pas se périmer', () => {
  // ⚠ Tout segment DYNAMIQUE, pas seulement `[id]`. La version d'origine testait le nom
  // littéral `[id]` : une route de détail nommée `[slug]` — convention déjà employée par
  // `(public)/properties/[slug]` — ou `[factureId]` passait au vert sans chemin de retour.
  const estDynamique = (nom: string) => /^\[.+\]$/.test(nom);
  const sectionsAvecDetail = readdirSync(APP, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '__tests__')
    .filter((e) =>
      readdirSync(join(APP, e.name), { withFileTypes: true })
        .some((enfant) => enfant.isDirectory() && estDynamique(enfant.name)))
    .map((e) => e.name)
    .sort();

  it('relève des sections à segment dynamique (non-vacuité)', () => {
    expect(sectionsAvecDetail.length).toBeGreaterThanOrEqual(6);
  });

  it('toute section portant un [id] a sa liste dans la table', () => {
    const absentes = sectionsAvecDetail.filter((s) => !(s in LISTES_PAR_SECTION));
    expect(absentes, `sections sans chemin de retour : ${absentes.join(', ')}`).toEqual([]);
  });

  it('toute destination de la table existe sur le disque', () => {
    const mortes = Object.entries(LISTES_PAR_SECTION)
      .filter(([, href]) => !existsSync(join(APP, href.replace('/app/', ''), 'page.tsx')))
      .map(([section, href]) => `${section} -> ${href}`);
    expect(mortes, `destinations inexistantes : ${mortes.join(', ')}`).toEqual([]);
  });

  it('listePour ignore ce qui n’est pas sous /app', () => {
    expect(listePour('/admin/properties/9')).toBeNull();
    expect(listePour('/app')).toBeNull();
    expect(listePour(null)).toBeNull();
  });
});
