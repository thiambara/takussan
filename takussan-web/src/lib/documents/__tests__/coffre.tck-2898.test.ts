import { describe, expect, it } from 'vitest';

import { voirLeCoffre, voirLesTrouvees, type CoffreDeDocuments, type DossierDuCoffre, type EntreeDuCoffre, type EntreeTrouvee } from '../coffre';
import { ciblesDeRangement, pieceARemplacer } from '../rangement';
import {
  CADRE_ENTIER,
  CADRE_MINIMAL,
  deplacerLeCoin,
  estIntact,
  nomDuRecadrage,
  placerLeCoin,
  rectangleDuRecadrage,
} from '../recadrage';

/**
 * TCK-2898 — le module pur du coffre : la pièce que « Remplace … qui expire » vise, le nom d'un bail
 * trouvé chez le bailleur, la précision « Rangé dans » d'un sous-dossier de bail, et la géométrie du
 * recadrage (cadre, coins, quarts de tour, dimensions du fichier envoyé).
 */

const AUJOURDHUI = '2026-11-15';

function piece(id: number, category: string, expiry: string | null): EntreeDuCoffre {
  return {
    kind: 'uploaded',
    category,
    title: null,
    date: '2026-01-10',
    download_path: `/api/documents/${id}`,
    targets: [],
    document_id: id,
    is_verified: true,
    expiry_date: expiry,
    versions_count: 0,
  };
}

function dossier(partiel: Partial<DossierDuCoffre> & Pick<DossierDuCoffre, 'key' | 'kind'>): DossierDuCoffre {
  return { target: null, name: null, year: null, entries: [], read_only: false, parent: null, reference: null, ...partiel };
}

const coffre = (folders: DossierDuCoffre[], attachable: CoffreDeDocuments['attachable_targets'] = []): CoffreDeDocuments => ({
  folders,
  counts: { expiring_soon: 0, unverified: 0 },
  attachable_targets: attachable,
});

describe('TCK-2898 — pieceARemplacer', () => {
  it('AC1 — la carte d’identité qui expire dans 42 jours, pour la catégorie « carte d’identité »', () => {
    const vu = voirLeCoffre(coffre([dossier({ key: 'pieces', kind: 'pieces', entries: [piece(41, 'id_card', '2026-12-27'), piece(42, 'insurance', '2026-11-20')] })]), AUJOURDHUI);
    expect(pieceARemplacer(vu, 'id_card')).toMatchObject({ documentId: 41, echeance: { etat: 'bientot', jours: 42 } });
    expect(pieceARemplacer(vu, 'insurance')).toMatchObject({ documentId: 42 });
  });

  it('AC3 — aucune pièce du même genre qui expire : rien (au-delà de 60 jours, autre genre, lecture seule)', () => {
    const vu = voirLeCoffre(
      coffre([
        dossier({ key: 'pieces', kind: 'pieces', entries: [piece(41, 'id_card', '2027-06-01'), piece(42, 'insurance', '2026-11-20')] }),
        dossier({ key: 'property:1', kind: 'property', read_only: true, entries: [piece(43, 'passport', '2026-11-20')] }),
      ]),
      AUJOURDHUI,
    );
    expect(pieceARemplacer(vu, 'id_card')).toBeNull();
    expect(pieceARemplacer(vu, 'passport')).toBeNull();
    expect(pieceARemplacer(vu, 'other')).toBeNull();
  });

  it('une pièce KYC posée sur un profil ne se remplace pas (l’API ne la versionne pas)', () => {
    const surProfil = { ...piece(45, 'id_card', '2026-12-20'), targets: [{ type: 'owner_profile', id: 3 }] };
    const vu = voirLeCoffre(coffre([dossier({ key: 'pieces', kind: 'pieces', entries: [surProfil, { ...piece(46, 'insurance', '2026-12-20'), targets: [{ type: 'owner_profile', id: 3 }] }] })]), AUJOURDHUI);
    expect(pieceARemplacer(vu, 'id_card')).toBeNull();
    expect(pieceARemplacer(vu, 'insurance')?.documentId).toBe(46);
  });

  it('la plus pressée d’abord ; une pièce déjà expirée se remplace aussi', () => {
    const vu = voirLeCoffre(coffre([dossier({ key: 'pieces', kind: 'pieces', entries: [piece(41, 'id_card', '2026-12-20'), piece(44, 'id_card', '2026-10-01')] })]), AUJOURDHUI);
    expect(pieceARemplacer(vu, 'id_card')?.documentId).toBe(44);
  });
});

describe('TCK-2898 — le bail d’un locataire, chez le bailleur', () => {
  const folders = [
    dossier({ key: 'property:1', kind: 'property', name: 'Villa Almadies' }),
    dossier({ key: 'lease:7', kind: 'lease', name: 'Fatou Kiné Diallo', parent: 'property:1', reference: 'LS-7' }),
  ];

  it('une entrée trouvée dans un sous-dossier de bail se nomme « Bail de … », jamais « Mon bail »', () => {
    const trouvee: EntreeTrouvee = {
      ...piece(9, 'lease_contract', null),
      folder: { key: 'lease:7', kind: 'lease', name: 'Fatou Kiné Diallo', year: null, read_only: false },
    };
    expect(voirLesTrouvees([trouvee], AUJOURDHUI, 0, folders)[0].dossier).toEqual({ cle: 'bailDuLocataire', nom: 'Fatou Kiné Diallo' });
    // Sans les dossiers du coffre (ancien appel), le bail redevient « Mon bail » : le paramètre compte.
    expect(voirLesTrouvees([trouvee], AUJOURDHUI, 0)[0].dossier).toEqual({ cle: 'monBail' });
  });

  it('« Rangé dans » : le sous-dossier du bail, précisé par son bien et son numéro', () => {
    const cibles = ciblesDeRangement(coffre(folders, [{ type: 'lease', id: 7, folder: 'lease:7', name: 'Villa Almadies', reference: 'LS-7' }]));
    expect(cibles[0]).toMatchObject({
      etiquette: { cle: 'bailDuLocataire', nom: 'Fatou Kiné Diallo' },
      precision: { cle: 'dansLeBien', nom: 'Villa Almadies', reference: 'LS-7' },
    });
  });
});

describe('TCK-2898 — la géométrie du recadrage', () => {
  it('un coin se déplace, le coin opposé reste fixe', () => {
    expect(placerLeCoin(CADRE_ENTIER, 'hautGauche', 0.2, 0.1)).toEqual({ x: 0.2, y: 0.1, largeur: 0.8, hauteur: 0.9 });
    const c = placerLeCoin(CADRE_ENTIER, 'basDroit', 0.5, 0.75);
    expect(c).toEqual({ x: 0, y: 0, largeur: 0.5, hauteur: 0.75 });
  });

  it('un coin ne sort pas de l’image ni ne traverse le coin opposé', () => {
    expect(placerLeCoin(CADRE_ENTIER, 'hautGauche', -1, -1)).toEqual(CADRE_ENTIER);
    const c = placerLeCoin(CADRE_ENTIER, 'hautGauche', 2, 2);
    expect(c.largeur).toBeCloseTo(CADRE_MINIMAL);
    expect(c.hauteur).toBeCloseTo(CADRE_MINIMAL);
    expect(deplacerLeCoin(CADRE_ENTIER, 'hautDroit', 0.02, 0)).toEqual(CADRE_ENTIER);
  });

  it('AC4 — après un quart de tour, les dimensions du fichier sont celles du cadre dans l’image tournée', () => {
    // Une photo 1000 × 600 tournée d'un quart de tour : 600 × 1000.
    const cadre = placerLeCoin(CADRE_ENTIER, 'hautGauche', 0.1, 0.1);
    expect(rectangleDuRecadrage(1000, 600, 1, cadre)).toEqual({ x: 60, y: 100, largeur: 540, hauteur: 900 });
    expect(rectangleDuRecadrage(1000, 600, 0, cadre)).toEqual({ x: 100, y: 60, largeur: 900, hauteur: 540 });
  });

  it('rien à faire : le fichier d’origine part tel quel ; sinon un JPEG du même nom', () => {
    expect(estIntact(0, CADRE_ENTIER)).toBe(true);
    expect(estIntact(4, CADRE_ENTIER)).toBe(true);
    expect(estIntact(1, CADRE_ENTIER)).toBe(false);
    expect(estIntact(0, { ...CADRE_ENTIER, largeur: 0.9 })).toBe(false);
    expect(nomDuRecadrage('IMG_2041.HEIC')).toBe('IMG_2041.jpg');
  });
});
