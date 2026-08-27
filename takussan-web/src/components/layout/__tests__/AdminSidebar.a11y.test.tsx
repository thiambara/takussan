/**
 * TCK-371 — lisibilité des entrées VERROUILLÉES et focus clavier de la barre `/admin`.
 *
 * ## Pourquoi ce test lit des CLASSES et non des pixels
 *
 * jsdom ne charge pas la feuille Tailwind : `getComputedStyle(el).color` y rend la valeur
 * héritée, jamais celle qu'`text-white/55` produirait. Le rapport de contraste ne se mesure
 * donc PAS ici — il se calcule, et le calcul est reporté dans la PR (AC1), paire par paire.
 *
 * Ce que ce fichier garde, c'est l'**entrée du calcul** : l'alpha effectif de l'encre. C'est
 * exactement ce qui avait dérivé — `text-white/40` et `opacity-60` composaient 0,24 sans que
 * rien ne le signale, parce que deux classes anodines prises séparément se multiplient.
 *
 * Les valeurs, sur le fond RÉEL de la barre (`bg-foreground` = #1f1812 en clair, seul thème
 * atteignable : aucun `ThemeProvider`, aucune classe `.dark` n'est jamais posée) :
 *
 *   text-white/40 + opacity-60  → alpha 0,24 → encre #554f4b → **2,18:1**  ÉCHEC
 *   text-white/55               → alpha 0,55 → encre #9a9794 → **6,04:1**  AA
 *   text-white/70 (item inactif, inchangé)  → #bcbab8 → 9,04:1
 *
 * L'entrée verrouillée reste donc plus sourde que l'item inactif — elle doit continuer de
 * s'en distinguer — tout en repassant au-dessus de 4,5:1.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AdminSidebar } from '../AdminSidebar';
import type { User } from '@/types/user';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: null }),
}));

const ADMIN_AGENCE = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  roles: ['agency_admin'],
  avatar_url: null,
} as unknown as User;

function rendreBarre() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        {/* `agencyIsStandard={false}` — c'est l'agence `individual` qui voit les cadenas. */}
        <AdminSidebar user={ADMIN_AGENCE} agencyIsStandard={false} />
      </QueryClientProvider>,
    ),
  );
}

describe('AC1 — contraste des entrées verrouillées', () => {
  it("n'empile plus deux atténuations : l'alpha de l'encre est porté par une SEULE classe", () => {
    rendreBarre();

    const verrouillees = screen.getAllByTitle('Réservé aux comptes pro');
    expect(verrouillees.length).toBeGreaterThan(0);

    for (const entree of verrouillees) {
      // Le défaut d'origine : `opacity-60` MULTIPLIAIT l'alpha de `text-white/40`.
      // `opacity` atténue en plus le cadenas et l'icône, qui portent déjà l'interdit.
      expect(entree.className).not.toMatch(/\bopacity-\d+\b/);
      expect(entree.className).not.toMatch(/\btext-white\/40\b/);
      // L'alpha retenu, celui qui donne 6,04:1.
      expect(entree.className).toMatch(/\btext-white\/55\b/);
    }
  });

  it("garde l'entrée verrouillée distincte de l'item inactif", () => {
    rendreBarre();

    const verrouillee = screen.getAllByTitle('Réservé aux comptes pro')[0];
    // `role="link"` est porté AUSSI par le <span> verrouillé : on prend un lien réel.
    const inactif = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('aria-disabled') !== 'true' && /text-white\/70/.test(l.className))!;
    expect(inactif).toBeDefined();

    // 6,04:1 contre 9,04:1 : lisible, et toujours plus sourde. Le cadenas et
    // `cursor-not-allowed` portent l'interdit, l'opacité n'a pas à le porter en plus.
    expect(verrouillee.className).toMatch(/\btext-white\/55\b/);
    expect(inactif.className).toMatch(/\btext-white\/70\b/);
    expect(verrouillee.className).toMatch(/\bcursor-not-allowed\b/);
  });
});

describe('AC4 — anneau de focus des liens de la barre', () => {
  /**
   * ⚠ Le jeton PLEIN, jamais `outline-ring/50`. Sur le fond de la barre (#1f1812) :
   *   `--ring` #a85332 plein  → **3,30:1** — au-dessus des 3:1 de WCAG 1.4.11
   *   `--ring` à 50 %         → 1,73:1 — ÉCHEC
   * Le second est l'idiome de la primitive `Button` ; il ne se recopie pas sur ce fond-là.
   *
   * ⚠ Décalage NÉGATIF (`-outline-offset-2`) : le `<nav>` est en `overflow-y-auto`, et dès
   * qu'un axe n'est pas `visible` l'autre calcule `auto` — un anneau sortant serait rogné.
   */
  it('chaque lien de navigation porte un anneau plein et rentrant', () => {
    rendreBarre();

    const liens = screen
      .getAllByRole('link')
      // L'entrée verrouillée est un `<span role="link" aria-disabled>` non focusable :
      // elle n'a pas d'anneau à porter.
      .filter((l) => l.getAttribute('aria-disabled') !== 'true');

    expect(liens.length).toBeGreaterThan(5);
    for (const lien of liens) {
      expect(lien.className).toMatch(/focus-visible:outline-2/);
      expect(lien.className).toMatch(/focus-visible:outline-ring(?!\/)/);
      expect(lien.className).toMatch(/focus-visible:-outline-offset-2/);
    }
  });
});
