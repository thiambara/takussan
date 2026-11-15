import { describe, expect, it } from "vitest";

import {
  natureDeLEntree,
  voirLeCoffre,
  type CoffreDeDocuments,
  type DossierDuCoffre,
  type EntreeDuCoffre,
} from "../coffre";

/**
 * TCK-2897 — ce que le coffre de l'API sert désormais, lu sans casser l'écran existant (TCK-2898 en fait
 * la mise en page) : le sous-dossier d'un bail sous son bien (`parent`), « Devis et rapports » du
 * prestataire, et la nature de leurs entrées.
 */

function genere(
  category: string,
  date: string,
  chemin: string,
): EntreeDuCoffre {
  return {
    kind: "generated",
    category,
    title: null,
    date,
    download_path: chemin,
    targets: [],
    document_id: null,
    is_verified: null,
    expiry_date: null,
    versions_count: null,
  };
}

function dossier(
  partiel: Partial<DossierDuCoffre> & Pick<DossierDuCoffre, "key" | "kind">,
): DossierDuCoffre {
  return {
    target: null,
    name: null,
    year: null,
    entries: [],
    read_only: false,
    parent: null,
    reference: null,
    ...partiel,
  };
}

function coffre(folders: DossierDuCoffre[]): CoffreDeDocuments {
  return {
    folders,
    counts: { expiring_soon: 0, unverified: 0 },
    attachable_targets: [],
  };
}

describe("TCK-2897 — sous-dossiers de bail, devis et rapports", () => {
  it("range le sous-dossier d’un bail juste après son bien, au nom du locataire", () => {
    const vu = voirLeCoffre(
      coffre([
        dossier({
          key: "property:1",
          kind: "property",
          name: "Villa Almadies",
          entries: [genere("lease_contract", "2026-01-01", "/x")],
        }),
        dossier({
          key: "lease:7",
          kind: "lease",
          name: "Fatou Kiné Diallo",
          reference: "LS-7",
          parent: "property:1",
          entries: [
            genere(
              "lease_contract",
              "2026-01-01",
              "/api/leases/7/contract/pdf",
            ),
          ],
        }),
        dossier({
          key: "property:2",
          kind: "property",
          name: "Appartement Plateau",
        }),
        dossier({
          key: "lease:9",
          kind: "lease",
          name: "Moussa Ndiaye",
          parent: "property:2",
          entries: [genere("inventory_move_in", "2026-02-01", "/y")],
        }),
        dossier({ key: "property:3", kind: "property", name: "Studio vide" }),
        dossier({
          key: "lease:11",
          kind: "lease",
          name: "Awa Sarr",
          parent: "property:3",
        }),
        dossier({ key: "pieces", kind: "pieces" }),
      ]),
      "2026-11-15",
    );

    expect(vu.dossiers.map((d) => d.key)).toEqual([
      "property:1",
      "lease:7",
      "property:2",
      "lease:9",
      "pieces",
    ]);
    expect(vu.dossiers[1].etiquette).toEqual({
      cle: "bailDe",
      nom: "Fatou Kiné Diallo",
    });
    // Le bien dont seul le bail a des entrées n'est pas « sans document » ; le bien vide, si.
    expect(vu.biensSansDocument).toBe(1);
  });

  it("nomme « Devis et rapports » et la nature de ses entrées", () => {
    const vu = voirLeCoffre(
      coffre([
        dossier({ key: "pieces", kind: "pieces" }),
        dossier({
          key: "quotes_reports",
          kind: "quotes_reports",
          entries: [
            genere(
              "maintenance_quote",
              "2026-10-01",
              "/api/maintenance-requests/3/quote/pdf",
            ),
            genere(
              "maintenance_completion_report",
              "2026-11-01",
              "/api/maintenance-requests/3/completion-report/pdf",
            ),
          ],
        }),
        dossier({ key: "bills", kind: "bills" }),
      ]),
      "2026-11-15",
    );

    expect(vu.dossiers.map((d) => d.key)).toEqual([
      "bills",
      "quotes_reports",
      "pieces",
    ]);
    const devis = vu.dossiers[1];
    expect(devis.etiquette).toEqual({ cle: "devisEtRapports" });
    // Le plus récent d'abord.
    expect(devis.entrees.map((e) => e.nature)).toEqual(["rapport", "devis"]);
    expect(
      natureDeLEntree(genere("maintenance_quote", "2026-10-01", "/x")),
    ).toBe("devis");
  });
});
