import { describe, expect, it } from 'vitest';

import {
  echeanceDe,
  gesteDeLEntree,
  natureDeLEntree,
  voirLeCoffre,
  type CoffreDeDocuments,
  type DossierDuCoffre,
  type EntreeDuCoffre,
} from '../coffre';

/** TCK-2656 — le coffre vu : ordre des dossiers, natures, gestes, échéance au jour de Dakar. */

const genere = (category: string, date: string, chemin: string, title: string | null = null): EntreeDuCoffre => ({
  kind: 'generated',
  category,
  title,
  date,
  download_path: chemin,
  targets: [],
  document_id: null,
  is_verified: null,
  expiry_date: null,
  versions_count: null,
});

const piece = (id: number, nom: string, extra: Partial<EntreeDuCoffre> = {}): EntreeDuCoffre => ({
  kind: 'uploaded',
  category: 'id_card',
  title: nom,
  date: '2026-06-28',
  download_path: `/api/documents/${id}`,
  targets: [],
  document_id: id,
  is_verified: true,
  expiry_date: null,
  versions_count: 0,
  ...extra,
});

const dossier = (d: Partial<DossierDuCoffre> & Pick<DossierDuCoffre, 'key' | 'kind'>): DossierDuCoffre => ({
  target: null,
  name: null,
  year: null,
  entries: [],
  read_only: false,
  ...d,
});

const coffre = (folders: DossierDuCoffre[], counts = { expiring_soon: 0, unverified: 0 }): CoffreDeDocuments => ({
  folders,
  counts,
  attachable_targets: [],
});

const AUJOURDHUI = '2026-11-13';

describe('TCK-2656 — voirLeCoffre', () => {
  it('range bail, quittances (année récente d’abord) puis mes pièces, quel que soit l’ordre de l’API', () => {
    const vu = voirLeCoffre(
      coffre([
        dossier({ key: 'lease:22', kind: 'lease', name: 'Garage à Ouest Foire' }),
        dossier({ key: 'pieces', kind: 'pieces' }),
        dossier({ key: 'receipts:2025', kind: 'receipts', year: 2025 }),
        dossier({ key: 'receipts:2026', kind: 'receipts', year: 2026 }),
      ]),
      AUJOURDHUI,
    );
    expect(vu.dossiers.map((d) => d.key)).toEqual(['lease:22', 'receipts:2026', 'receipts:2025', 'pieces']);
    expect(vu.dossiers[0].etiquette).toEqual({ cle: 'monBail' });
    expect(vu.dossiers[1].etiquette).toEqual({ cle: 'quittances', annee: 2026 });
    expect(vu.dossiers[1].replieParDefaut).toBe(true);
    expect(vu.dossiers[0].replieParDefaut).toBe(false);
  });

  it('nomme chaque bail par son bien quand il y en a plusieurs', () => {
    const vu = voirLeCoffre(
      coffre([dossier({ key: 'lease:1', kind: 'lease', name: 'Villa' }), dossier({ key: 'lease:2', kind: 'lease', name: 'Garage' })]),
      AUJOURDHUI,
    );
    expect(vu.dossiers.map((d) => d.etiquette)).toEqual([
      { cle: 'bailDe', nom: 'Villa' },
      { cle: 'bailDe', nom: 'Garage' },
    ]);
  });

  it('met les quittances de la plus récente à la plus ancienne et les compte toutes', () => {
    const vu = voirLeCoffre(
      coffre([
        dossier({
          key: 'receipts:2026',
          kind: 'receipts',
          year: 2026,
          entries: [
            genere('receipt_deposit', '2026-07-01', '/api/leases/22/receipts/191/pdf'),
            genere('receipt_rent', '2026-07-05', '/api/leases/22/receipts/192/pdf'),
            genere('receipt_rent', '2026-08-05', '/api/leases/22/receipts/193/pdf'),
          ],
        }),
      ]),
      AUJOURDHUI,
    );
    const quittances = vu.dossiers[0].entrees;
    expect(quittances.map((e) => e.entree.date)).toEqual(['2026-08-05', '2026-07-05', '2026-07-01']);
    expect(quittances.map((e) => e.nature)).toEqual(['quittance', 'quittance', 'caution']);
    expect(vu.total).toBe(3);
  });

  it('lève l’alerte sur la pièce qui expire le plus tôt dans la fenêtre', () => {
    const vu = voirLeCoffre(
      coffre(
        [
          dossier({
            key: 'pieces',
            kind: 'pieces',
            entries: [
              piece(1, 'Assurance', { expiry_date: '2027-06-30' }),
              piece(3, 'Passeport', { expiry_date: '2026-12-30' }),
              piece(2, 'Carte d’identité', { expiry_date: '2026-12-25' }),
            ],
          }),
        ],
        { expiring_soon: 2, unverified: 0 },
      ),
      AUJOURDHUI,
    );
    expect(vu.alerte?.jours).toBe(42);
    expect(vu.alerte?.entree.entree.document_id).toBe(2);
    expect(vu.expireBientot).toBe(2);
  });

  it('décision 1 (a) — ne liste pas les biens sans document du bailleur, il les compte', () => {
    const vu = voirLeCoffre(
      coffre([
        dossier({ key: 'property:1', kind: 'property', name: 'Villa Almadies', entries: [piece(5, 'Titre foncier')] }),
        dossier({ key: 'property:2', kind: 'property', name: 'Appartement Mermoz' }),
        dossier({ key: 'property:3', kind: 'property', name: 'Garage Ouest Foire' }),
        dossier({ key: 'pieces', kind: 'pieces' }),
      ]),
      AUJOURDHUI,
    );
    expect(vu.dossiers.map((d) => d.key)).toEqual(['property:1', 'pieces']);
    expect(vu.dossiers[0].etiquette).toEqual({ cle: 'bien', nom: 'Villa Almadies' });
    expect(vu.biensSansDocument).toBe(2);
  });

  it('TCK-2729 — le dossier en lecture seule le reste, même vide, et son alerte ne se remplace pas', () => {
    const vu = voirLeCoffre(
      coffre([
        dossier({ key: 'property:1', kind: 'property', name: 'Villa', read_only: true, entries: [piece(5, 'Assurance', { expiry_date: '2026-12-01' })] }),
        dossier({ key: 'property:2', kind: 'property', name: 'Mermoz', read_only: true }),
        dossier({ key: 'pieces', kind: 'pieces' }),
      ]),
      AUJOURDHUI,
    );
    expect(vu.lectureSeule).toBe(true);
    expect(vu.dossiers.map((d) => [d.key, d.lectureSeule])).toEqual([
      ['property:1', true],
      ['pieces', false],
    ]);
    expect(vu.alerte).toMatchObject({ jours: 18, lectureSeule: true });
    // Le seul dossier en lecture seule peut être vide : le coffre le dit quand même.
    expect(voirLeCoffre(coffre([dossier({ key: 'property:2', kind: 'property', read_only: true })]), AUJOURDHUI).lectureSeule).toBe(true);
    expect(voirLeCoffre(coffre([dossier({ key: 'pieces', kind: 'pieces' })]), AUJOURDHUI).lectureSeule).toBe(false);
  });

  it('ne lève aucune alerte sans pièce dans la fenêtre', () => {
    const vu = voirLeCoffre(coffre([dossier({ key: 'pieces', kind: 'pieces', entries: [piece(1, 'A', { expiry_date: '2027-06-30' })] })]), AUJOURDHUI);
    expect(vu.alerte).toBeNull();
  });
});

describe('TCK-2656 — échéance au jour', () => {
  it('« expire dans 42 jours » dans la fenêtre de 60 jours, bornes comprises', () => {
    expect(echeanceDe('2026-12-25', AUJOURDHUI)).toEqual({ etat: 'bientot', jours: 42 });
    expect(echeanceDe('2027-01-12', AUJOURDHUI)).toEqual({ etat: 'bientot', jours: 60 });
    expect(echeanceDe('2027-01-13', AUJOURDHUI)).toEqual({ etat: 'plusTard', le: '2027-01-13' });
    expect(echeanceDe('2026-11-13', AUJOURDHUI)).toEqual({ etat: 'aujourdhui' });
    expect(echeanceDe('2026-11-12', AUJOURDHUI)).toEqual({ etat: 'expiree', le: '2026-11-12' });
    expect(echeanceDe(null, AUJOURDHUI)).toBeNull();
  });
});

describe('TCK-2656 — nature et geste d’une entrée', () => {
  it('tire la nature de la catégorie d’un document généré', () => {
    expect(natureDeLEntree(genere('lease_contract', '2026-06-29', '/api/leases/22/contract/pdf'))).toBe('contrat');
    expect(natureDeLEntree(genere('inventory_move_in', '2026-07-01', '/api/inventories/25/pdf'))).toBe('edlEntree');
    expect(natureDeLEntree(genere('inventory_move_out', '2026-07-01', '/api/inventories/26/pdf'))).toBe('edlSortie');
    expect(natureDeLEntree(genere('owner_statement', '2026-10-31', '/x', '2026-10'))).toBe('releve');
    expect(natureDeLEntree(genere('annual_attestation', '2025-12-31', '/x', '2025'))).toBe('attestation');
    expect(natureDeLEntree(piece(1, 'Contrat', { category: 'lease_contract' }))).toBe('piece');
    expect(natureDeLEntree(genere('receipt_charges', '2026-07-05', '/x'))).toBe('charges');
    expect(natureDeLEntree(genere('receipt_late_fee', '2026-07-05', '/x'))).toBe('quittance');
    // Une catégorie inconnue n'est pas une quittance.
    expect(natureDeLEntree(genere('mandate', '2026-07-05', '/x'))).toBe('autre');
  });

  it('télécharge un généré par son endpoint, ouvre la fiche d’une pièce, et rien pour une facture sans PDF', () => {
    expect(gesteDeLEntree(genere('lease_contract', '2026-06-29', '/api/leases/22/contract/pdf'))).toEqual({
      geste: 'telecharger',
      chemin: '/api/leases/22/contract/pdf',
    });
    expect(gesteDeLEntree(piece(210, 'Contrat'))).toEqual({ geste: 'ouvrir', documentId: 210 });
    expect(gesteDeLEntree(genere('provider_bill', '2026-11-06', '/api/service-provider-bills/4'))).toEqual({ geste: 'aucun' });
  });
});
