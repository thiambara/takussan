/**
 * TCK-2479 (ADR-0089 §5) — la bande « À traiter », éprouvée seule : rien sans pastille, une région
 * nommée, un nom accessible complet par pastille (qui COMMENCE par son texte visible, WCAG 2.5.3),
 * et « +N » en divulgation sur place. Son branchement dans la barre (ordre du persona, menu immobile,
 * compteur en échec) est éprouvé par `AppSidebar.test.tsx`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { withIntl } from '@/test/intl';
import type { PastilleATraiter } from '@/lib/navigation/a-traiter';
import { BandeATraiter } from '../BandeATraiter';

const P = (cle: PastilleATraiter['cle'], nombre: number, href: string): PastilleATraiter => ({ cle, nombre, href });

describe('<BandeATraiter> — TCK-2479', () => {
  it('sans pastille : aucun nœud', () => {
    const { container } = render(withIntl(<BandeATraiter visibles={[]} autres={[]} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('une région « À traiter » ; chaque pastille porte un nom complet qui commence par son texte', () => {
    render(
      withIntl(
        <BandeATraiter
          visibles={[P('unreadMessages', 3, '/app/messages'), P('pendingVisits', 2, '/app/visits?tab=requested')]}
          autres={[]}
        />,
      ),
    );
    const bande = screen.getByRole('region', { name: 'À traiter' });
    const liens = within(bande).getAllByRole('link');
    expect(liens.map((l) => [l.textContent, l.getAttribute('aria-label'), l.getAttribute('href')])).toEqual([
      ['3 messages', '3 messages non lus', '/app/messages'],
      ['2 visites', '2 visites en attente', '/app/visits?tab=requested'],
    ]);
    for (const l of liens) expect(l.getAttribute('aria-label')!.startsWith(l.textContent!)).toBe(true);
  });

  it('chaque compteur a son libellé, au singulier comme au pluriel', () => {
    render(
      withIntl(
        <BandeATraiter
          visibles={[
            P('unhandledLeads', 1, '/app/leads?filtre=todo'),
            P('propertyModeration', 2, '/app/agency/moderation/properties'),
            P('reviewModeration', 1, '/app/agency/moderation'),
          ]}
          autres={[]}
        />,
      ),
    );
    expect(screen.getAllByRole('link').map((l) => [l.textContent, l.getAttribute('aria-label')])).toEqual([
      ['1 demande', '1 demande non traitée'],
      ['2 biens', '2 biens à valider'],
      ['1 avis', '1 avis à modérer'],
    ]);
  });

  it('la couleur primaire reste à l’action principale : aucune pastille ne la porte', () => {
    render(withIntl(<BandeATraiter visibles={[P('unreadMessages', 3, '/app/messages')]} autres={[P('pendingVisits', 1, '/app/visits')]} />));
    for (const cible of [...screen.getAllByRole('link'), screen.getByRole('button')]) {
      expect(cible.className).not.toMatch(/\b(bg|text)-primary\b/);
      expect(cible.className).not.toMatch(/destructive/);
    }
  });

  it('« +N » montre les autres sur place', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <BandeATraiter
          visibles={[P('unhandledLeads', 1, '/app/leads?filtre=todo')]}
          autres={[P('reviewModeration', 2, '/app/agency/moderation'), P('unreadMessages', 5, '/app/messages')]}
        />,
      ),
    );
    const plus = screen.getByRole('button', { name: '+2 autres à traiter' });
    expect(plus).toHaveTextContent('+2');
    expect(plus).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('link')).toHaveLength(1);

    await user.click(plus);
    expect(plus).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'))).toEqual([
      '1 demande non traitée',
      '2 avis à modérer',
      '5 messages non lus',
    ]);

    await user.click(plus);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('un clic referme le tiroir (onNavigate)', async () => {
    const onNavigate = vi.fn();
    render(withIntl(<BandeATraiter visibles={[P('unreadMessages', 1, '/app/messages')]} autres={[]} onNavigate={onNavigate} />));
    await userEvent.setup().click(screen.getByRole('link'));
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('chaque cible porte l’anneau de focus de la barre', () => {
    render(withIntl(<BandeATraiter visibles={[P('unreadMessages', 3, '/app/messages')]} autres={[P('pendingVisits', 1, '/app/visits')]} />));
    for (const cible of [...screen.getAllByRole('link'), screen.getByRole('button')]) {
      expect(cible.className).toContain('focus-visible:ring-2');
    }
  });

  it('a11y : aucune violation, repliée comme dépliée', async () => {
    const { container } = render(
      withIntl(<BandeATraiter visibles={[P('unreadMessages', 3, '/app/messages')]} autres={[P('pendingVisits', 1, '/app/visits')]} />),
    );
    expect((await axe.run(container)).violations).toEqual([]);
    await userEvent.setup().click(screen.getByRole('button'));
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
