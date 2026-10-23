import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RACINE_SRC } from "@/test/analyse-statique";
import { modulesDuGrapheClient } from "@/test/graphe-client";

/**
 * TCK-1773 (P173.02) — `/app/properties/new` prenait `PropertyWizard` au fichier `index.ts` de
 * `components/property-form`, qui réexporte aussi `PropertyForm` (le formulaire d'édition) : la
 * page de création téléchargeait ce formulaire sans l'afficher. La fiche du bien, elle, le charge
 * par `next/dynamic` à l'ouverture de l'onglet d'édition (TCK-1040). La page prend désormais
 * l'assistant à son fichier, et l'`index.ts`, resté sans importeur, est retiré.
 */
const PAGE = join(
  RACINE_SRC,
  "app",
  "(dashboard)",
  "app",
  "properties",
  "new",
  "page.tsx",
);

describe("graphe client de la création d’un bien", () => {
  it("TCK-1773 — témoin : l’assistant est dans le graphe client de la page", () => {
    expect(modulesDuGrapheClient(PAGE)).toContain(
      "components/property-form/PropertyWizard.tsx",
    );
  });

  it("TCK-1773 — le formulaire d’édition n’y entre pas", () => {
    const modules = modulesDuGrapheClient(PAGE);
    expect(
      [
        "components/property-form/PropertyForm.tsx",
        "hooks/useAvertissementDepart.ts",
      ].filter((m) => modules.has(m)),
    ).toEqual([]);
  });
});
