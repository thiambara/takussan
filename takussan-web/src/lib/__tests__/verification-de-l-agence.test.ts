import { describe, expect, it } from 'vitest';

import { etatDeLaVerification, historiqueDuDossier, pieceRemplacable, piecesManquantes, renouvellementOuvert } from '../verification-de-l-agence';
import type { KycDocument, KycDossier } from '@/types/super-admin';

/**
 * TCK-2671 — un état, une phrase, une action. L'état se juge sur le dossier que l'API rend ; le
 * renouvellement, sur le jour d'ouverture que l'API sert (`renewal.opens_on`, TCK-2671).
 */

const AUJOURDHUI = new Date(2026, 10, 12, 10, 0); // 12 nov. 2026, heure locale
const piece = (document_type: string, document_expires_at: string | null = null): KycDocument => ({
  id: document_type.length,
  file_name: `${document_type}.pdf`,
  mime_type: 'application/pdf',
  size: 1,
  document_type,
  signed_url: '/kyc/1',
  expires_at: '2026-11-12T10:15:00Z',
  document_expires_at,
  document_number: null,
});
const TROIS = [piece('rccm'), piece('ninea'), piece('director_id', '2030-01-01')];
const dossier = (d: Partial<KycDossier>): KycDossier => ({
  id: 1,
  subject_type: 'App\\Models\\Agency',
  subject_id: 1,
  status: 'pending',
  submitted_at: null,
  reviewed_at: null,
  reviewed_by: null,
  rejection_reason: null,
  metadata: {},
  documents: [],
  expires_at: null,
  created_at: '2017-11-02T09:00:00Z',
  updated_at: null,
  ...d,
});

describe('etatDeLaVerification', () => {
  it('pending sans pièce : à fournir ; les trois pièces valables : prêt à soumettre', () => {
    expect(etatDeLaVerification(dossier({}), AUJOURDHUI)).toBe('a_fournir');
    expect(etatDeLaVerification(dossier({ documents: TROIS }), AUJOURDHUI)).toBe('pret');
  });

  it('submitted : en examen ; rejected : refusée', () => {
    expect(etatDeLaVerification(dossier({ status: 'submitted', documents: TROIS }), AUJOURDHUI)).toBe('en_examen');
    expect(etatDeLaVerification(dossier({ status: 'rejected', documents: TROIS }), AUJOURDHUI)).toBe('refusee');
  });

  it('vérifié loin de l’échéance : vérifiée ; à 20 jours : à renouveler (AC1)', () => {
    const verifieLe = (expires_at: string, opens_on: string) =>
      dossier({ status: 'verified', documents: TROIS, expires_at, renewal: { document_type: 'director_id', opens_on } });
    expect(etatDeLaVerification(verifieLe('2027-06-01T00:00:00Z', '2027-05-02'), AUJOURDHUI)).toBe('verifiee');
    expect(etatDeLaVerification(verifieLe('2026-12-02T00:00:00Z', '2026-11-02'), AUJOURDHUI)).toBe('a_renouveler');
  });

  it('repassé pending par l’échéance, pièce du dirigeant échue : à renouveler (la démo)', () => {
    const echu = dossier({
      metadata: { expired_at: '2026-11-11T06:00:03+00:00' },
      documents: [piece('rccm'), piece('ninea'), piece('director_id', '2021-04-26')],
    });
    expect(etatDeLaVerification(echu, AUJOURDHUI)).toBe('a_renouveler');
    expect(piecesManquantes(echu, AUJOURDHUI)).toEqual(['director_id']);
  });

  it('la pièce remplacée, le dossier passé par une échéance devient prêt à soumettre', () => {
    const remplace = dossier({
      metadata: { expired_at: '2026-11-11T06:00:03+00:00' },
      documents: [piece('rccm'), piece('ninea'), piece('director_id', '2021-04-26'), piece('director_id', '2031-01-01')],
    });
    expect(etatDeLaVerification(remplace, AUJOURDHUI)).toBe('pret');
  });

  it('une pièce du dirigeant qui échoit aujourd’hui est déjà échue', () => {
    expect(piecesManquantes(dossier({ documents: [piece('rccm'), piece('ninea'), piece('director_id', '2026-11-12')] }), AUJOURDHUI)).toEqual([
      'director_id',
    ]);
  });
});

describe('renouvellementOuvert — le jugement de l’API', () => {
  const verifie = (opens_on: string | null) =>
    dossier({
      status: 'verified',
      documents: TROIS,
      expires_at: '2026-12-12T00:00:00Z',
      renewal: opens_on ? { document_type: 'director_id', opens_on } : null,
    });

  it('ouvert dès le jour que l’API sert (`renewal.opens_on`), fermé la veille', () => {
    expect(renouvellementOuvert(verifie('2026-11-12'), AUJOURDHUI)).toBe(true);
    expect(renouvellementOuvert(verifie('2026-11-01'), AUJOURDHUI)).toBe(true);
    expect(renouvellementOuvert(verifie('2026-11-13'), AUJOURDHUI)).toBe(false);
  });

  it('le jour se lit en heure locale : à 0 h 30 le 13, la fenêtre du 13 est ouverte', () => {
    expect(renouvellementOuvert(verifie('2026-11-13'), new Date(2026, 10, 13, 0, 30))).toBe(true);
  });

  it('un dossier vérifié sans échéance reste verrouillé ; un autre statut n’est pas un renouvellement', () => {
    expect(renouvellementOuvert(verifie(null), AUJOURDHUI)).toBe(false);
    expect(renouvellementOuvert(dossier({ status: 'verified', documents: TROIS, expires_at: '2026-11-20T00:00:00Z' }), AUJOURDHUI)).toBe(false);
    expect(
      renouvellementOuvert(
        dossier({ status: 'pending', expires_at: '2026-11-20T00:00:00Z', renewal: { document_type: 'director_id', opens_on: '2026-10-21' } }),
        AUJOURDHUI,
      ),
    ).toBe(false);
  });

  it('sur un dossier vérifié dans la fenêtre, seule la pièce du dirigeant se remplace', () => {
    const d = verifie('2026-11-02');
    expect(pieceRemplacable(d, 'director_id', AUJOURDHUI)).toBe(true);
    expect(pieceRemplacable(d, 'rccm', AUJOURDHUI)).toBe(false);
    expect(pieceRemplacable(verifie('2027-05-02'), 'director_id', AUJOURDHUI)).toBe(false);
  });

  it('pendant l’examen, aucune pièce ne se remplace ; en attente ou refusé, toutes', () => {
    expect(pieceRemplacable(dossier({ status: 'submitted' }), 'rccm', AUJOURDHUI)).toBe(false);
    expect(pieceRemplacable(dossier({ status: 'rejected' }), 'ninea', AUJOURDHUI)).toBe(true);
    expect(pieceRemplacable(dossier({}), 'director_id', AUJOURDHUI)).toBe(true);
  });
});

describe('historiqueDuDossier', () => {
  it('ne lit que les dates de l’API, les plus récentes d’abord', () => {
    const h = historiqueDuDossier(
      dossier({
        status: 'verified',
        submitted_at: '2017-11-06T09:00:00Z',
        reviewed_at: '2017-11-09T09:00:00Z',
        metadata: { expired_at: '2021-04-26T06:00:00Z' },
      }),
    );
    expect(h.map((e) => e.cle)).toEqual(['expire', 'verifie', 'envoye', 'ouvert']);
  });

  it('un dossier en attente jamais décidé n’a ni décision ni refus', () => {
    expect(historiqueDuDossier(dossier({ reviewed_at: '2017-11-09T09:00:00Z' })).map((e) => e.cle)).toEqual(['ouvert']);
  });
});
