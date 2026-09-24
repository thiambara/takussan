import React, { useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

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
