/**
 * Le pied de page ne fait plus semblant — TCK-437.
 *
 * Trois défauts mesurés, trois angles :
 *
 *  · un formulaire de newsletter INERTE (champ contrôlé, bouton sans `onClick`, pas de `<form>`,
 *    état jamais lu). L'issue retenue est le RETRAIT — aucun endpoint d'inscription n'existe côté
 *    API (cf. l'en-tête de `Footer.tsx`). AC1 est donc éprouvé dans les deux sens : plus aucun
 *    contrôle inerte, ET chaque contrôle encore rendu fait quelque chose ;
 *  · des liens qui rechargeaient le document (`<a href>` nu) ;
 *  · deux entrées seulement, dont aucune ne menait ailleurs que sur `/properties`.
 *
 * ⚠ Comme pour `Navbar.recherche.test.tsx`, `next/link` est remplacé par un double FIDÈLE : jsdom
 * ne recharge pas de document, il ne peut donc pas montrer un rechargement. Ce qui est éprouvé,
 * c'est l'observable qui sépare les deux mondes — l'action par défaut est-elle empêchée, le
 * routeur client est-il sollicité, et l'état client survit-il.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { routeExiste } from '@/test/routes-publiques';
import { COMPARE_STORAGE_KEY, readCompare, writeCompare } from '@/lib/compare';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a
      href={href}
      onClick={(e) => { e.preventDefault(); onClick?.(e); push(href); }}
      {...reste}
    >
      {children}
    </a>
  ),
}));

const { Footer } = await import('@/components/home/Footer');

function monter() {
  return render(withIntl(<Footer />));
}

function pied(): HTMLElement {
  return screen.getByRole('contentinfo');
}

describe('Footer (TCK-437)', () => {
  beforeEach(() => {
    push.mockReset();
    window.localStorage.clear();
  });

  it("AC1 — plus aucun contrôle inerte : ni champ, ni bouton, ni formulaire", () => {
    monter();
    const zone = pied();

    // Le formulaire de newsletter, dans les trois formes sous lesquelles il pouvait subsister.
    expect(within(zone).queryByRole('textbox')).toBeNull();
    expect(zone.querySelectorAll('input')).toHaveLength(0);
    expect(zone.querySelectorAll('form')).toHaveLength(0);
    expect(within(zone).queryByRole('button')).toBeNull();
  });

  it("AC1 (revers) — tout élément interactif encore rendu est un lien qui mène quelque part", () => {
    monter();
    const interactifs = pied().querySelectorAll('a, button, input, select, textarea');
    expect(interactifs.length).toBeGreaterThan(0);
    for (const el of interactifs) {
      expect(el.tagName, `élément interactif non cliquable : ${el.outerHTML}`).toBe('A');
      expect(el.getAttribute('href')).toBeTruthy();
    }
  });

  it("AC2 / AC5 — aucun libellé n'est resté en clé brute", () => {
    monter();
    // `Footer` résout ses libellés par clé dynamique (`t(`${colonne}.${labelKey}`)`) : une clé
    // absente du dictionnaire ne casse rien, elle s'AFFICHE. C'est le mode de défaillance que
    // le découpage next-intl a déjà produit ailleurs (TCK-337).
    expect(pied().textContent).not.toMatch(/\b(discover|professionals|tools)\.[a-z]+/);
    expect(pied().textContent).not.toMatch(/Heading\b/);
  });

  it('AC4 — chaque entrée du pied de page mène à une route qui existe', () => {
    monter();
    const liens = [...pied().querySelectorAll('a')];
    expect(liens.length).toBeGreaterThanOrEqual(5);
    for (const lien of liens) {
      const href = lien.getAttribute('href') ?? '';
      // L'inventaire est celui de `src/test/routes-publiques.ts`, partagé avec TCK-436 et
      // TCK-439 — il n'est recopié nulle part.
      expect(routeExiste(href), `href introuvable sous src/app : « ${href} »`).toBe(true);
    }
  });

  it("AC2 — un clic ne recharge pas le document, et la langue est portée", async () => {
    const user = userEvent.setup();
    monter();

    const evenements: MouseEvent[] = [];
    document.addEventListener('click', (e) => evenements.push(e as MouseEvent));

    await user.click(within(pied()).getByRole('link', { name: 'Biens en vedette' }));

    expect(evenements.at(-1)?.defaultPrevented, "l'action par défaut du navigateur n'est pas empêchée").toBe(true);
    expect(push).toHaveBeenCalledWith('/fr/properties?featured=true');
  });

  it("AC3 — un clic conserve l'état client : le comparateur n'est pas vidé", async () => {
    const user = userEvent.setup();
    writeCompare([12, 34]);
    expect(readCompare().ids).toEqual([12, 34]);

    monter();
    await user.click(within(pied()).getByRole('link', { name: 'Comparateur' }));

    // Un rechargement de document ne vide pas `localStorage` — ce qu'il perd, c'est l'état en
    // MÉMOIRE et le contexte de rendu. On éprouve donc les deux : la donnée persistée est
    // intacte, ET le composant n'a pas été démonté par une navigation de document.
    expect(readCompare().ids).toEqual([12, 34]);
    expect(window.localStorage.getItem(COMPARE_STORAGE_KEY)).not.toBeNull();
    expect(pied()).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('/fr/compare');
  });

  it("la colonne « Professionnels » n'est PAS rendue tant que TCK-436 n'a rien à y mettre", () => {
    monter();
    // Le titre existe dans les trois dictionnaires, la colonne est déclarée — mais un en-tête
    // sans lien serait exactement la promesse vide que ce ticket corrige.
    expect(within(pied()).queryByText('Professionnels')).toBeNull();
    expect(within(pied()).getByText('Découvrir')).toBeInTheDocument();
    expect(within(pied()).getByText('Vos outils')).toBeInTheDocument();
  });
});
