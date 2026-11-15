/**
 * TCK-2791 (fiche TCK-2628, O2 et puces de période) — « Ce mois · Mois dernier » : sur la vue d'ensemble seule,
 * l'adresse porte la période en gardant la portée, la tête la dit, et une tuile d'état du jour dit « aujourd'hui ».
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const navigation = vi.hoisted(() => ({ chemin: '/app/reports', requete: '', pousses: [] as string[] }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.chemin,
  useSearchParams: () => new URLSearchParams(navigation.requete),
  useRouter: () => ({ push: (href: string) => navigation.pousses.push(href) }),
}));

const { ChoixDeLaPeriode, adresseAvecLaPeriode } = await import('../ChoixDeLaPeriode');
const { DescriptionDesRapports } = await import('../TeteDesRapports');
const { TuilesDuRapport } = await import('../TuilesDuRapport');

beforeEach(() => {
  navigation.chemin = '/app/reports';
  navigation.requete = '';
  navigation.pousses = [];
});

describe('TCK-2791 — le choix de la période', () => {
  it('au téléphone, deux puces ; « Mois dernier » mène à `?period=last_month` en gardant la portée', () => {
    navigation.requete = 'scope=agency';
    render(withIntl(<ChoixDeLaPeriode variante="puces" />));
    const groupe = screen.getByRole('group', { name: 'Période du rapport' });
    const puces = groupe.querySelectorAll('button');
    expect([...puces].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Ce mois', 'true'],
      ['Mois dernier', 'false'],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Mois dernier' }));
    expect(navigation.pousses).toEqual(['/app/reports?scope=agency&period=last_month']);
  });

  it('sous « Mois dernier », « Ce mois » retire la période et rien d’autre', () => {
    navigation.requete = 'period=last_month&scope=agency';
    render(withIntl(<ChoixDeLaPeriode variante="puces" />));
    expect(screen.getByRole('button', { name: 'Mois dernier' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Ce mois' }));
    expect(navigation.pousses).toEqual(['/app/reports?scope=agency']);
  });

  it('au bureau, le sélecteur « Ce mois ▾ » dit la période choisie', () => {
    navigation.requete = 'period=last_month';
    render(withIntl(<ChoixDeLaPeriode variante="menu" />));
    const bouton = screen.getByRole('button', { name: 'Période : Mois dernier' });
    expect(bouton.textContent).toBe('Mois dernier');
  });

  it('au bureau, choisir « Mois dernier » dans le menu garde la portée', async () => {
    navigation.requete = 'scope=agency';
    render(withIntl(<ChoixDeLaPeriode variante="menu" />));
    fireEvent.click(screen.getByRole('button', { name: 'Période : Ce mois' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mois dernier' }));
    expect(navigation.pousses).toEqual(['/app/reports?scope=agency&period=last_month']);
  });

  it('hors de la vue d’ensemble, rien : les autres onglets ne lisent pas les tableaux de bord', () => {
    for (const chemin of ['/app/reports/team', '/app/reports/commissions', '/app/reports/unpaid']) {
      navigation.chemin = chemin;
      const { container, unmount } = render(withIntl(<><ChoixDeLaPeriode variante="menu" /><ChoixDeLaPeriode variante="puces" /></>));
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('une période inconnue de l’adresse vaut « Ce mois », et n’est jamais recopiée', () => {
    expect(adresseAvecLaPeriode('/app/reports', new URLSearchParams('period=yesterday&scope=agency'), 'current_month')).toBe('/app/reports?scope=agency');
    navigation.requete = 'period=yesterday';
    render(withIntl(<ChoixDeLaPeriode variante="puces" />));
    expect(screen.getByRole('button', { name: 'Ce mois' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('TCK-2791 — la tête et les tuiles', () => {
  const tete = <DescriptionDesRapports nom="Dakar Immo" periode="du 1 au 30 novembre 2026" periodeMoisDernier="du 1 au 31 octobre 2026" />;

  it('la description dit octobre sous « Mois dernier », sur la vue d’ensemble seulement', () => {
    navigation.requete = 'period=last_month';
    const { container, unmount } = render(withIntl(tete));
    expect(container.textContent).toBe('Dakar Immo · du 1 au 31 octobre 2026');
    unmount();
    navigation.chemin = '/app/reports/team';
    const autre = render(withIntl(tete));
    expect(autre.container.textContent).toBe('Dakar Immo · du 1 au 30 novembre 2026');
  });

  it('un état du jour dit « aujourd’hui » après son contexte, ou seul ; le portefeuille aussi au téléphone', () => {
    render(
      withIntl(
        <TuilesDuRapport
          chiffres={[
            { cle: 'impayes', valeur: 100_000, forme: 'montant', contexte: { cle: 'echeances', n: 2 }, aujourdhui: true },
            { cle: 'bauxActifs', valeur: 4, forme: 'nombre', aujourdhui: true },
            { cle: 'encaisse', valeur: 400_000, forme: 'montant' },
            { cle: 'portefeuille', valeur: 10, forme: 'biens', contexte: { cle: 'portefeuille', loues: 4, libres: 5, autres: 1 }, aujourdhui: true },
          ]}
        />,
      ),
    );
    const tuile = (cle: string) => document.querySelector(`[data-chiffre="${cle}"]`)?.textContent ?? '';
    expect(tuile('impayes')).toMatch(/2 échéances en retard · aujourd’hui$/);
    expect(tuile('bauxActifs')).toMatch(/aujourd’hui$/);
    expect(tuile('encaisse')).not.toMatch(/aujourd’hui/);
    expect(tuile('portefeuille').match(/aujourd’hui/g)).toHaveLength(2);
  });
});
