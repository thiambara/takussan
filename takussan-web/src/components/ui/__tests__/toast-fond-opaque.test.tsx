import React, { useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RACINE, SOMBRE, declaration, opacite } from '@/test/__tests__/couleur-compilee';

import { ToastProvider, Toaster, useToast } from '@/components/ui/toast';

/**
 * TCK-561 (M8) — un toast se lit SEUL, quoi qu'il y ait dessous.
 *
 * Le viewport des toasts flotte en `fixed` au-dessus de l'en-tête. Relevé du 2026-09-23 à 390 px :
 * le toast « Maximum 4 biens » avait un fond à 10 % d'opacité, et le logo, la recherche et le
 * bouton Filtres se lisaient à travers son texte.
 *
 * Ce que le test garde : aucun utilitaire de FOND du toast — dans aucun ton, ni sous `dark:` — ne
 * porte de canal alpha (`/N`) ni n'est transparent. Le teint reste permis, s'il est mélangé à une
 * surface opaque (cf. `kindClasses`).
 *
 * ⚠ **Ce premier contrôle lit des CHAÎNES, et il laissait passer un fond invisible** (vérification
 * adverse de TCK-561, mutation V6b) : `bg-[color-mix(in_srgb,var(--warning)_10%,var(--background)/0)]`
 * ne finit ni par `/N` ni par `transparent` — et le navigateur rejette la déclaration, donc aucun
 * fond. Le second bloc ci-dessous mesure la VALEUR : chaque classe est compilée par le Tailwind du
 * dépôt, la déclaration `background-color` que le navigateur retient est évaluée jeton par jeton
 * contre `globals.css` (`:root` et `.dark`), et son opacité doit valoir exactement 1. Une valeur que
 * l'évaluateur ne sait pas lire fait ROUGIR, elle n'est jamais supposée opaque.
 */

const TONS = ['info', 'success', 'warning', 'error'] as const;

function Declencheur({ type }: { type: string }) {
  const toast = useToast();
  // Le gestionnaire change d'identité à chaque rendu : une seule émission, gardée par ref.
  const emis = useRef(false);
  useEffect(() => {
    if (emis.current) return;
    emis.current = true;
    toast.add({ title: `titre-${type}`, description: 'corps', type });
  }, [toast, type]);
  return null;
}

function racineDuToast(titre: string): HTMLElement {
  const noeud = screen.getByText(titre);
  // La racine est l'ancêtre qui porte le ton — celui dont la classe pose la bordure arrondie.
  const racine = noeud.closest<HTMLElement>('.rounded-xl');
  if (!racine) throw new Error(`racine du toast « ${titre} » introuvable`);
  return racine;
}

/** Les utilitaires de fond, préfixe de variante retiré (`dark:bg-…` compris). */
function utilitairesDeFond(classes: string): string[] {
  return classes
    .split(/\s+/)
    .map((c) => c.split(':').pop() ?? c)
    .filter((c) => c.startsWith('bg-'));
}

describe('toast — fond opaque (TCK-561, M8)', () => {
  for (const type of TONS) {
    it(`le ton « ${type} » pose un fond sans canal alpha`, async () => {
      render(
        <NextIntlClientProvider locale="fr" messages={{ ui: { toast: { close: 'Fermer' } } }}>
          <ToastProvider>
            <Declencheur type={type} />
            <Toaster />
          </ToastProvider>
        </NextIntlClientProvider>,
      );
      await screen.findByText(`titre-${type}`);
      const fonds = utilitairesDeFond(racineDuToast(`titre-${type}`).className);

      // Non-vacuité : un toast sans aucun fond serait transparent par construction.
      expect(fonds.length, `ton ${type} : aucun utilitaire de fond`).toBeGreaterThan(0);
      for (const fond of fonds) {
        expect(fond, `ton ${type} : fond translucide`).not.toMatch(/\/\d+$/);
        expect(fond, `ton ${type} : fond transparent`).not.toMatch(/transparent/);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// La VALEUR, pas la chaîne — compilée par Tailwind, évaluée contre les jetons de globals.css.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('toast — le fond RENDU est opaque, jeton par jeton (TCK-561, vérification adverse)', () => {
  it('non-vacuité : l’évaluateur voit le fond invisible que la lecture de chaînes laissait passer', async () => {
    const mutant = await declaration('bg-[color-mix(in_srgb,var(--warning)_10%,var(--background)/0)]', 'background-color');
    expect(mutant).not.toBeNull();
    expect(() => opacite(mutant!.valeur, RACINE)).toThrow(/illisible/);
    const translucide = await declaration('bg-warning/10', 'background-color');
    expect(opacite(translucide!.valeur.replace('var(--color-warning)', 'var(--warning)'), RACINE)).toBeCloseTo(0.1, 5);
  });

  for (const type of TONS) {
    it(`le ton « ${type} » : opacité 1 en clair ET en sombre`, async () => {
      render(
        <NextIntlClientProvider locale="fr" messages={{ ui: { toast: { close: 'Fermer' } } }}>
          <ToastProvider>
            <Declencheur type={type} />
            <Toaster />
          </ToastProvider>
        </NextIntlClientProvider>,
      );
      await screen.findByText(`titre-${type}`);
      const classes = racineDuToast(`titre-${type}`).className.split(/\s+/);

      let clair: string | null = null;
      let sombre: string | null = null;
      for (const classe of classes.filter((c) => /(^|:)bg-/.test(c))) {
        const d = await declaration(classe, 'background-color');
        if (!d) continue;
        if (d.sombre) sombre = d.valeur;
        else clair = d.valeur;
      }
      expect(clair, `ton ${type} : aucune déclaration de fond compilée`).not.toBeNull();
      expect(opacite(clair!, RACINE), `ton ${type}, clair : ${clair}`).toBe(1);
      expect(opacite(sombre ?? clair!, SOMBRE), `ton ${type}, sombre : ${sombre ?? clair}`).toBe(1);
    });
  }
});
