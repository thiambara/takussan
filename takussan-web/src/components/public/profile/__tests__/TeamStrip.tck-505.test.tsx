import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import { TeamStrip, type TeamAgent } from '../TeamStrip';

const AGENTS: ReadonlyArray<TeamAgent> = [
  { id: 1, slug: 'awa-ndiaye', full_name: 'Awa Ndiaye', avatar_url: null, specialty: 'Location', portfolio_count: 12 },
  { id: 2, slug: null, full_name: 'Moussa Sarr', avatar_url: null },
  { id: 3, slug: 'fatou-diop', full_name: 'Fatou Diop', avatar_url: null, portfolio_count: 3 },
];

function monte() {
  render(withIntl(
    <TeamStrip
      agents={AGENTS}
      eyebrow="Notre équipe"
      heading="3 agents"
      headingId="team-heading"
    />,
  ));
  return {
    precedent: screen.getByRole('button', { name: 'Voir les agents précédents' }),
    suivant: screen.getByRole('button', { name: 'Voir les agents suivants' }),
    liste: screen.getByRole('list'),
  };
}

/**
 * TCK-505, défaut #10 — les deux flèches étaient posées en `absolute left-full` / `right-full`,
 * c'est-à-dire EN DEHORS du conteneur `max-w-[1200px]` de la page. Dès que le viewport n'a pas
 * 52 px de marge de chaque côté (< 1304 px), la flèche « suivants » sort du viewport et le
 * document déborde : +4 px mesurés à 768 et 1024 sur `/fr/agencies/dakar-immo` (2026-09-02).
 *
 * Le correctif reprend le motif des rangées de l'accueil (`PropertyRow`) : les flèches vivent
 * dans l'en-tête de la section, à droite du titre, dans le flux — donc dans le conteneur.
 * L'ablation : remettre `absolute` et `left-full`/`right-full` sur une flèche rougit ; retirer
 * `snap-x` de la liste rougit aussi (le défilement par accroche est conservé, pas remplacé).
 */
describe('<TeamStrip> — les flèches vivent dans l’en-tête, pas hors du conteneur (TCK-505 #10)', () => {
  it('aucune flèche n’est positionnée hors du flux', () => {
    const { precedent, suivant } = monte();
    for (const fleche of [precedent, suivant]) {
      const classes = fleche.className.split(/\s+/);
      expect(classes).not.toContain('absolute');
      expect(classes).not.toContain('left-full');
      expect(classes).not.toContain('right-full');
    }
  });

  it('les flèches précèdent la liste et partagent l’en-tête du titre', () => {
    const { precedent, suivant, liste } = monte();
    const titre = screen.getByRole('heading', { level: 2, name: '3 agents' });
    expect(titre.id).toBe('team-heading');
    expect(screen.getByText('Notre équipe')).toBeInTheDocument();

    // Ordre du DOM : en-tête (titre + flèches) AVANT la liste — c'est ce qu'un lecteur d'écran
    // et la tabulation parcourent.
    for (const fleche of [precedent, suivant]) {
      expect(fleche.compareDocumentPosition(liste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Le plus petit ancêtre commun au titre et aux deux flèches est l'en-tête, et il ne contient
    // PAS la liste : les flèches sont à côté du titre, pas à côté (ni au-dessus) du défilement.
    let enTete: HTMLElement | null = titre.parentElement;
    while (enTete && !(enTete.contains(precedent) && enTete.contains(suivant))) {
      enTete = enTete.parentElement;
    }
    expect(enTete).not.toBeNull();
    expect(enTete!.contains(liste)).toBe(false);
  });

  it('garde le défilement par accroche et les libellés des flèches', () => {
    const { liste, precedent, suivant } = monte();
    expect(liste.className.split(/\s+/)).toEqual(expect.arrayContaining(['snap-x', 'overflow-x-auto']));
    expect(precedent).toHaveAttribute('aria-label', 'Voir les agents précédents');
    expect(suivant).toHaveAttribute('aria-label', 'Voir les agents suivants');
    // Trois agents, trois entrées — l'en-tête n'en ajoute pas.
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
