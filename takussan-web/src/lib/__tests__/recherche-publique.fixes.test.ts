import { describe, expect, it } from 'vitest';

import { clefDeRecherche, parametresDepuisNext, requeteAvecFixes } from '../recherche-publique';

/**
 * TCK-2522 / TCK-2523 (revue du 2026-11-09) — un paramètre fixe de fiche (`agency`, `agent`)
 * écrase TOUTE forme du même nom venue de l'URL, tableau compris. Sans quoi `?agency[]=x` partait à
 * l'API à côté de `agency=<slug>` : PHP garde le tableau, l'API répond 422 « The agency field must
 * be a string », et le HTML servi de la fiche n'avait aucun bien.
 */
describe('requeteAvecFixes — le périmètre écrase toute forme du même nom', () => {
  const fixes = { agency: 'dakar-immo', placements: 'false' };

  it.each([
    ['agency=autre', 'forme simple'],
    ['agency=a&agency=b', 'répétée'],
    ['agency%5B%5D=saint-louis-habitat', 'tableau `agency[]`'],
    ['agency%5B0%5D=x&agency%5B1%5D=y', 'tableau indexé'],
    ['agency%5Bslug%5D=x', 'tableau à clé'],
  ])('%s (%s) → seul `agency=dakar-immo` part', (requete) => {
    const params = requeteAvecFixes(new URLSearchParams(requete), fixes);
    const noms = [...params.keys()].filter((k) => k.startsWith('agency'));
    expect(noms).toEqual(['agency']);
    expect(params.getAll('agency')).toEqual(['dakar-immo']);
  });

  it('depuis les `searchParams` de Next (rendu serveur) : même résultat, même clef que le navigateur', () => {
    const serveur = clefDeRecherche(requeteAvecFixes(parametresDepuisNext({ 'agency[]': 'x', contract_type: 'rent' }), fixes));
    const navigateur = clefDeRecherche(requeteAvecFixes(new URLSearchParams('agency%5B%5D=x&contract_type=rent'), fixes));
    expect(serveur).toBe(navigateur);
    expect(serveur).not.toMatch(/agency%5B|agency\[/);
    expect(serveur).toContain('contract_type=rent');
  });

  it('le contrôle : une clé voisine au nom proche n’est pas touchée', () => {
    const params = requeteAvecFixes(new URLSearchParams('agent=awa&agency_type=x'), fixes);
    expect(params.get('agent')).toBe('awa');
    expect(params.get('agency_type')).toBe('x');
  });
});
