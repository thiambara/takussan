import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GraphiquesDuRapport } from '@/components/rapports/ensemble/GraphiquesDuRapport';
import { chiffresDeLAgence, type ChiffreDuRapport } from '@/lib/rapports/chiffres';
import { withIntl } from '@/test/intl';

import { TuilesDuRapport } from '../TuilesDuRapport';

/**
 * TCK-2799 — repris des cas de `charts/__tests__/palette-et-locale.test.tsx` qui montaient les tuiles et l'aperçu
 * des revenus de l'ancienne vue d'agence (TCK-374, TCK-292), retirés avec elle. Aucun test des Rapports ne rendait
 * une autre locale que `fr` : rétablir une locale écrite en dur dans `TuilesDuRapport` ou les graphiques laissait
 * la suite verte.
 */
const RESUME = {
  properties: { total: 12_345, published: 12_345 },
  leases: { active: 12_345 },
  finance: { revenue_month: 1_234_000, overdue_count: 0, overdue_amount: 0, unpaid_rate_percent: 0 },
  occupancy: { rate_percent: 60 },
};

function chiffre(cle: string): HTMLElement {
  return document.querySelector(`[data-chiffre="${cle}"]`) as HTMLElement;
}

/** Le nombre s'écrit en entier (le groupement des milliers se lit) ; le montant, lui, s'abrège (« 1,2 M F »). */
const ENTIERS: ChiffreDuRapport[] = [
  { cle: 'nombre', libelle: 'Nombre', valeur: 12_345, forme: 'nombre' },
  { cle: 'montant', libelle: 'Montant', valeur: 1_234_000, forme: 'montant' },
];

describe('TCK-2799 — les chiffres des Rapports suivent la locale ACTIVE (repris de TCK-374)', () => {
  it('en `en` : le groupement anglais, jamais le français', () => {
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME)} />, 'en'));
    expect(chiffre('bauxActifs').textContent).toContain('12,345');
    expect(chiffre('bauxActifs').textContent).not.toMatch(/12\s345/u);
  });

  it('⚠ en `wo` : UNE seule convention de nombre pour le nombre et le montant (D1 de TCK-374)', () => {
    // En `wo`, les données CLDR groupent par POINT ; `formatCurrency` atteint `fr-SN` (espace). La carte de
    // l'ancienne vue d'agence a rendu « 12.345 » à côté de « 1 234 000 F CFA » : les deux ensemble, dans un rendu.
    render(withIntl(<TuilesDuRapport chiffres={ENTIERS} />, 'wo'));
    const nombre = chiffre('nombre').textContent ?? '';
    const montant = chiffre('montant').textContent ?? '';
    expect(nombre).not.toContain('12.345');
    expect(montant).not.toMatch(/\d\.\d/);
    expect(nombre).toMatch(/12\s345/u);
  });

  it('en `fr`, le même nombre à la française', () => {
    render(withIntl(<TuilesDuRapport chiffres={ENTIERS} />, 'fr'));
    expect(chiffre('nombre').textContent).toMatch(/12\s345/u);
    expect(chiffre('nombre').textContent).not.toContain('12,345');
  });

  it('l’occupation : « — » sans bien éligible, « 0 % » quand tout est vacant (repris de `formatOccupancyRate`, TCK-1114)', () => {
    const { unmount } = render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence({ ...RESUME, occupancy: { rate_percent: null } })} />));
    expect(chiffre('occupation').textContent).toBe('Occupation—');
    unmount();
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence({ ...RESUME, occupancy: { rate_percent: 0 } })} />));
    expect(chiffre('occupation').textContent).toMatch(/^Occupation0\s%/u);
  });
});

describe('TCK-2799 — le total et l’axe des graphiques suivent la locale ACTIVE (repris de TCK-292)', () => {
  const ENCAISSE = { id: 'encaisse' as const, mois: ['2026-01', '2026-02'], valeurs: [1_000_000, 2_000_000] };

  it('en `en` : le total et les mois à l’anglaise', () => {
    render(withIntl(<GraphiquesDuRapport series={[ENCAISSE]} moisEnCours="2026-03" />, 'en'));
    const bloc = document.querySelector('[data-slot="bloc-graphique"]') as HTMLElement;
    // `en-GB` abrège « 3m » (Intl), le français « 3 M » : la forme anglaise, collée, jamais l'espace française.
    expect(bloc.querySelector('.font-display')?.textContent).toMatch(/^3m\sF$/iu);
    expect(bloc.textContent).toMatch(/Jan 2026/);
    expect(bloc.textContent).not.toMatch(/janv/i);
  });

  it('en `fr` : le même total à la française', () => {
    render(withIntl(<GraphiquesDuRapport series={[ENCAISSE]} moisEnCours="2026-03" />, 'fr'));
    const bloc = document.querySelector('[data-slot="bloc-graphique"]') as HTMLElement;
    expect(bloc.querySelector('.font-display')?.textContent).toMatch(/^3\sM\sF$/u);
    expect(screen.getByText(/^Janv\. 2026$/)).toBeTruthy();
    expect(bloc.textContent).not.toMatch(/Jan 2026/);
  });
});

describe('TCK-2799 — les tuiles de l’ancienne vue d’agence, tenues par les chiffres des Rapports', () => {
  it('sans échéance en retard, « Impayés » n’est pas en danger', () => {
    const impayes = chiffresDeLAgence(RESUME).find((c) => c.cle === 'impayes');
    expect(impayes?.ton).toBeUndefined();
    const enRetard = chiffresDeLAgence({ ...RESUME, finance: { ...RESUME.finance, overdue_count: 2, overdue_amount: 90_000 } });
    expect(enRetard.find((c) => c.cle === 'impayes')?.ton).toBe('danger');
  });

  it('un indicateur configuré sans valeur se rend « — », jamais 0 (TCK-2373)', () => {
    const kpis = [{ metric: 'unpaid_rate_percent', label: 'Impayés (taux)', format: 'percent' as const, value: null }];
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence({ ...RESUME, kpis })} />));
    expect(chiffre('kpi:unpaid_rate_percent').textContent).toBe('Impayés (taux)—');
  });
});

/**
 * Repris du test des destinations de l'ancienne « Activité récente » (TCK-375, TCK-649) : les quatre compteurs de l'ancienne
 * « Activité récente » sont devenus « En chiffres » d'`EnsembleAgence`, des liens écrits dans sa source. Chacun mène à
 * une page de `/app` qui existe, dérivée du système de fichiers (groupes de routes traversés).
 */
const RACINE_APP = join(process.cwd(), 'src', 'app', '(dashboard)', 'app');

function pageExiste(dossier: string, segments: readonly string[]): boolean {
  if (segments.length === 0) {
    if (existsSync(join(dossier, 'page.tsx'))) return true;
  } else if (existsSync(join(dossier, segments[0]))) {
    if (pageExiste(join(dossier, segments[0]), segments.slice(1))) return true;
  }
  if (!existsSync(dossier)) return false;
  return readdirSync(dossier, { withFileTypes: true }).some(
    (entree) => entree.isDirectory() && /^\(.+\)$/.test(entree.name) && pageExiste(join(dossier, entree.name), segments),
  );
}

describe('TCK-2799 — « En chiffres » de la vue d’ensemble mène à des pages qui existent (repris de TCK-375)', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'components', 'rapports', 'ensemble', 'EnsembleAgence.tsx'), 'utf8');
  const hrefs = [...source.matchAll(/href: '(\/app\/[^']+)'/g)].map((m) => m[1]);

  it('les quatre compteurs, l’équipe comprise, ont chacun leur page', () => {
    expect(hrefs).toEqual(expect.arrayContaining(['/app/bookings', '/app/maintenance', '/app/customers', '/app/agency/team']));
    for (const href of hrefs) {
      expect(pageExiste(RACINE_APP, href.slice('/app/'.length).split('?')[0].split('/')), `${href} n'a pas de page.tsx`).toBe(true);
    }
  });

  it('la résolution traverse les groupes de routes, et refuse une page qui n’existe pas', () => {
    expect(pageExiste(RACINE_APP, ['bookings'])).toBe(true);
    expect(pageExiste(RACINE_APP, ['team'])).toBe(false);
  });
});
