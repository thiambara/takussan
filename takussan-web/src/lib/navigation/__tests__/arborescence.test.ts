import { describe, expect, it } from 'vitest';
import { MOTIFS_DE_ROUTE } from '@/test/routes-publiques';
import { PAGES_ADMIN } from '@/lib/access/pages-admin';
import { CATALOGUE } from '../catalogue';
import { HORS_MENU } from './hors-menu';

/**
 * TCK-2477 (ADR-0089 §1) — chaque page de `/app` a une place, et chaque entrée a sa page.
 *
 * Une page est à sa place si elle est au menu (catalogue ou `PAGES_ADMIN`), si elle est la FILLE
 * d'une entrée du menu (`/app/leases/7` sous « Baux »), ou si `HORS_MENU` dit pourquoi elle n'en a
 * pas. *Une page qu'aucune entrée ne mène et qu'aucune raison ne justifie est une page perdue* —
 * c'est ainsi que « Mes tâches » (TCK-591) n'avait aucune entrée.
 */
const AU_MENU: readonly string[] = [...CATALOGUE.map((d) => d.href), ...PAGES_ADMIN.map((p) => p.chemin)];
const PARENTS = AU_MENU.filter((href) => href !== '/app');
const PAGES_DE_APP = MOTIFS_DE_ROUTE.filter((m) => m === '/app' || m.startsWith('/app/'));

function aSaPlace(motif: string): boolean {
  return (
    AU_MENU.includes(motif) ||
    HORS_MENU[motif] !== undefined ||
    PARENTS.some((parent) => motif.startsWith(`${parent}/`))
  );
}

describe('TCK-2477 — le menu et l’arborescence de /app', () => {
  it('chaque page de /app est au menu, fille d’une entrée, ou hors menu avec sa raison', () => {
    expect(PAGES_DE_APP.filter((motif) => !aSaPlace(motif))).toEqual([]);
  });

  it('chaque destination du catalogue a sa page', () => {
    expect(CATALOGUE.map((d) => d.href).filter((href) => !MOTIFS_DE_ROUTE.includes(href))).toEqual([]);
  });

  it('HORS_MENU ne garde ni une page disparue, ni une page déjà au menu', () => {
    for (const motif of Object.keys(HORS_MENU)) {
      expect(MOTIFS_DE_ROUTE, motif).toContain(motif);
      expect(AU_MENU, motif).not.toContain(motif);
    }
  });

  it('chaque page hors menu dit pourquoi', () => {
    for (const [motif, raison] of Object.entries(HORS_MENU)) {
      expect(raison.trim().length, motif).toBeGreaterThan(10);
    }
  });
});
