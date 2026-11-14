import { describe, expect, it } from 'vitest';

import type { Agency } from '@/types/agency';
import type { KycDocument, KycDossier } from '@/types/super-admin';
import {
  clesModifiees,
  completudeDeLaFiche,
  corpsDeLaFiche,
  entreesARemplir,
  erreursSurLeurChamp,
  etatDesSections,
  rebaserLaSaisie,
  referenceApresEnregistrement,
  champsModifies,
  numerosDuDossier,
  repriseDesNumeros,
  sectionDeLaCle,
  sectionsEnErreur,
  sectionsModifiees,
  sectionsMontrees,
  valeursDeLAgence,
  verificationAJour,
} from '../fiche';

function agence(surcharges: Partial<Agency> = {}): Agency {
  return {
    id: 1,
    name: 'Dakar Immo',
    slug: 'dakar-immo',
    license_number: null,
    description: null,
    email: 'contact@dakar-immo.sn',
    phone: '+221338000000',
    website: null,
    commission_rate: 5,
    currency: 'XOF',
    is_verified: false,
    status: null,
    kind: 'standard',
    logo_url: 'https://media.example/logo.png',
    settings: {},
    moderation_required: false,
    tagline: null,
    highlights: [],
    showcase_property_ids: [],
    default_tax_rate: 18,
    legal_name: null,
    ninea: null,
    rccm: null,
    legal_address: null,
    primary_admin_id: 1,
    ...surcharges,
  };
}

const avec = (vitrine = true) => ({ vitrine });

function piece(surcharges: Partial<KycDocument>): KycDocument {
  return {
    id: 1,
    file_name: 'x.pdf',
    mime_type: 'application/pdf',
    size: 1,
    document_type: 'rccm',
    signed_url: '',
    expires_at: '',
    document_expires_at: null,
    document_number: null,
    ...surcharges,
  };
}

const MAINTENANT = new Date(2026, 10, 12);

describe('corpsDeLaFiche — un seul PATCH, les seules clés modifiées', () => {
  it('rien de modifié : un corps vide', () => {
    const a = agence();
    const v = valeursDeLAgence(a);
    expect(corpsDeLaFiche(v, a, avec()).corps).toEqual({});
  });

  it('AC1 — l’accroche puis le numéro Wave : tagline et settings.offline_payment_wave_number, rien d’autre', () => {
    const a = agence();
    const initiales = valeursDeLAgence(a);
    const corps = corpsDeLaFiche(
      { ...initiales, tagline: 'Votre agence à Dakar', offline_payment_wave_number: '77 123 45 67' },
      a,
      avec(),
    ).corps;
    expect(corps).toEqual({ tagline: 'Votre agence à Dakar', settings: { offline_payment_wave_number: '77 123 45 67' } });
    expect(clesModifiees(corps).sort()).toEqual(['settings.offline_payment_wave_number', 'tagline']);
    expect(sectionsModifiees(corps)).toEqual(['publique', 'paiement']);
  });

  it('un espace ou une casse d’e-mail n’est pas une modification', () => {
    const a = agence();
    const initiales = valeursDeLAgence(a);
    expect(corpsDeLaFiche({ ...initiales, name: ' Dakar Immo ', email: 'CONTACT@dakar-immo.sn' }, a, avec()).corps).toEqual({});
  });

  it('un champ vidé part à null', () => {
    const a = agence({ tagline: 'Une accroche', settings: { offline_payment_wave_number: '+221771234567' } });
    const initiales = valeursDeLAgence(a);
    expect(corpsDeLaFiche({ ...initiales, tagline: '', offline_payment_wave_number: '' }, a, avec()).corps).toEqual({
      tagline: null,
      settings: { offline_payment_wave_number: null },
    });
  });

  it('la vitrine ne part jamais pour qui ne peut pas l’écrire', () => {
    const a = agence();
    const initiales = valeursDeLAgence(a);
    expect(corpsDeLaFiche({ ...initiales, tagline: 'x', showcase_property_ids: [4] }, a, avec(false)).corps).toEqual({});
  });

  it('les raisons : une ligne vide du milieu est retirée, l’ordre des biens compte', () => {
    const a = agence({ highlights: ['Un', 'Deux'], showcase_property_ids: [3, 4] });
    const initiales = valeursDeLAgence(a);
    expect(initiales.highlights).toEqual(['Un', 'Deux', '']);
    expect(
      corpsDeLaFiche({ ...initiales, highlights: ['Un', '', 'Trois'], showcase_property_ids: [4, 3] }, a, avec()).corps,
    ).toEqual({ highlights: ['Un', 'Trois'], showcase_property_ids: [4, 3] });
  });

  it('une agence individuelle n’envoie ni mentions légales ni modération ni menu, même modifiés', () => {
    const a = agence({ kind: 'individual' });
    const initiales = valeursDeLAgence(a);
    const corps = corpsDeLaFiche(
      { ...initiales, ninea: '123', moderation_required: true, hidden_modules: ['credits'], phone: '+221770000000' },
      a,
      avec(),
    ).corps;
    expect(corps).toEqual({ phone: '+221770000000' });
  });

  it('le seuil remis à sa valeur ne part pas ; modifié, il part seul', () => {
    const a = agence({ payout_approval_threshold: 500000 });
    const initiales = valeursDeLAgence(a);
    expect(initiales.payout_approval_threshold).toBe('500000');
    expect(corpsDeLaFiche(initiales, a, avec()).corps).toEqual({});
    expect(corpsDeLaFiche({ ...initiales, payout_approval_threshold: '750000' }, a, avec()).corps).toEqual({
      payout_approval_threshold: 750000,
    });
  });

  // Vider le seuil, c'est le couper (VERIF-594 : un relâchement, qui attend un second approbateur).
  // La référence normalisée ne porte pas la clé (inchangée), la saisie la porte à `null` : absente
  // d'un côté n'est pas « égale à null ».
  it('le seuil vidé part à null', () => {
    const a = agence({ payout_approval_threshold: 100000 });
    expect(corpsDeLaFiche({ ...valeursDeLAgence(a), payout_approval_threshold: '' }, a, avec()).corps).toEqual({
      payout_approval_threshold: null,
    });
  });

  it('deux clés de settings comptent deux modifications', () => {
    const a = agence();
    const initiales = valeursDeLAgence(a);
    const corps = corpsDeLaFiche(
      { ...initiales, late_fee_online_collection: true, hidden_modules: ['credits'] },
      a,
      avec(),
    ).corps;
    expect(clesModifiees(corps)).toEqual(['settings.late_fee_online_collection', 'settings.hidden_modules']);
    expect(sectionsModifiees(corps)).toEqual(['regles', 'menu']);
  });
});

describe('sectionDeLaCle — un 422 tombe dans sa section', () => {
  it.each([
    ['name', 'identite'],
    ['settings.offline_payment_wave_number', 'paiement'],
    ['highlights.1', 'publique'],
    ['showcase_property_ids.3', 'publique'],
    ['ninea', 'facturation'],
    ['settings.require_team_two_factor', 'regles'],
    ['settings.hidden_modules.0', 'menu'],
    ['payout_approval_threshold', 'regles'],
  ])('%s → %s', (cle, section) => {
    expect(sectionDeLaCle(cle)).toBe(section);
  });

  it('une clé inconnue ne vise aucune section', () => {
    expect(sectionDeLaCle('settings.watermark')).toBeNull();
    expect(sectionsEnErreur({ tagline: ['x'], 'settings.offline_payment_wave_number': ['y'], autre: ['z'] })).toEqual([
      'publique',
      'paiement',
    ]);
  });
});

describe('sectionsMontrees', () => {
  it('agence standard qui écrit la vitrine : les huit', () => {
    expect(sectionsMontrees({ individuelle: false, vitrine: true })).toHaveLength(8);
  });
  it('individuelle : pas de menu de l’équipe ; sans la vitrine : pas de fiche publique', () => {
    expect(sectionsMontrees({ individuelle: true, vitrine: false })).toEqual([
      'identite',
      'paiement',
      'facturation',
      'verification',
      'regles',
      'offre',
    ]);
  });
});

describe('« Reprendre ces deux numéros »', () => {
  const dossier = {
    documents: [
      piece({ id: 1, document_type: 'rccm', document_number: 'SN-DKR-2020-B-1' }),
      piece({ id: 5, document_type: 'rccm', document_number: 'SN-DKR-2024-B-9' }),
      piece({ id: 2, document_type: 'ninea', document_number: '  ' }),
      piece({ id: 3, document_type: 'director_id', document_number: 'AB123' }),
    ],
  };

  it('la pièce la plus récente de chaque type qui porte un numéro', () => {
    expect(numerosDuDossier(dossier)).toEqual({ ninea: null, rccm: 'SN-DKR-2024-B-9' });
  });

  it('AC4 — remplit le RCCM vide, n’écrase jamais une mention saisie', () => {
    const numeros = { ninea: '0012345', rccm: 'SN-DKR-2024-B-9' };
    expect(repriseDesNumeros({ ninea: '', rccm: '' }, numeros)).toEqual({ ninea: '0012345', rccm: 'SN-DKR-2024-B-9' });
    expect(repriseDesNumeros({ ninea: '999', rccm: '' }, numeros)).toEqual({ rccm: 'SN-DKR-2024-B-9' });
    expect(repriseDesNumeros({ ninea: '999', rccm: 'R' }, numeros)).toEqual({});
    expect(repriseDesNumeros({ ninea: '', rccm: '' }, numerosDuDossier(null))).toEqual({});
  });
});

describe('verificationAJour', () => {
  it('vérifié, sans échéance passée : à jour', () => {
    expect(verificationAJour({ status: 'verified', expires_at: '2027-05-01', documents: [] }, MAINTENANT)).toBe(true);
  });
  it('en attente, refusé, absent : pas à jour', () => {
    expect(verificationAJour({ status: 'pending', expires_at: null, documents: [] }, MAINTENANT)).toBe(false);
    expect(verificationAJour({ status: 'rejected', expires_at: null, documents: [] }, MAINTENANT)).toBe(false);
    expect(verificationAJour(null, MAINTENANT)).toBe(false);
  });
  it('vérifié mais une pièce échue : pas à jour', () => {
    expect(
      verificationAJour(
        { status: 'verified', expires_at: null, documents: [piece({ document_type: 'director_id', document_expires_at: '2026-11-12' })] },
        MAINTENANT,
      ),
    ).toBe(false);
  });
});

describe('completudeDeLaFiche — la liste fermée', () => {
  const enAttente: Pick<KycDossier, 'status' | 'expires_at' | 'documents'> = { status: 'pending', expires_at: null, documents: [] };

  it('AC3 — Dakar Immo de la démo : logo, téléphone, e-mail seuls → 3 / 12 = 25 %', () => {
    const c = completudeDeLaFiche(agence(), verificationAJour(enAttente, MAINTENANT));
    expect(c.elements).toHaveLength(12);
    expect(c.presents).toEqual(['logo', 'telephone', 'email']);
    expect(c.pourcentage).toBe(25);
    expect(c.manquants.slice(0, 2)).toEqual(['paiement_hors_ligne', 'raison_sociale']);
  });

  it('AC6 — une agence individuelle ne compte pas les quatre mentions légales', () => {
    const c = completudeDeLaFiche(agence({ kind: 'individual' }), false);
    expect(c.elements).toHaveLength(8);
    expect(c.elements).not.toContain('ninea');
    expect(c.pourcentage).toBe(38);
  });

  it('un seul moyen hors ligne suffit ; un « pourquoi nous » blanc ne compte pas', () => {
    const c = completudeDeLaFiche(
      agence({ settings: { offline_payment_bank_details: 'CBAO 0001' }, highlights: ['  '] }),
      false,
    );
    expect(c.presents).toContain('paiement_hors_ligne');
    expect(c.presents).not.toContain('pourquoi_nous');
  });

  it('tout rempli et vérifié : 100 %', () => {
    const c = completudeDeLaFiche(
      agence({
        settings: { offline_payment_wave_number: '+221771234567' },
        legal_name: 'Dakar Immo SARL',
        ninea: '0012345',
        rccm: 'SN-DKR-1',
        legal_address: 'Plateau',
        tagline: 'Accroche',
        highlights: ['Un'],
        showcase_property_ids: [1],
      }),
      true,
    );
    expect(c.manquants).toEqual([]);
    expect(c.pourcentage).toBe(100);
  });

  it('NINEA et RCCM manquants font une entrée ; le compte reste par élément', () => {
    const c = completudeDeLaFiche(agence(), verificationAJour(enAttente, MAINTENANT));
    const entrees = entreesARemplir(c.manquants);
    expect(entrees.slice(0, 3)).toEqual(['paiement_hors_ligne', 'raison_sociale', 'ninea_et_rccm']);
    expect(entrees).not.toContain('rccm');
    expect(entrees.length).toBe(c.manquants.length - 1);
    expect(entreesARemplir(['ninea', 'accroche'])).toEqual(['ninea', 'accroche']);
  });
});

describe('etatDesSections', () => {
  it('incomplet là où manque un élément, alerte là où tombe un 422', () => {
    const c = completudeDeLaFiche(agence(), false);
    const etats = etatDesSections(c, ['identite']);
    expect(etats.identite).toBe('alerte');
    expect(etats.paiement).toBe('incomplet');
    expect(etats.facturation).toBe('incomplet');
    expect(etats.regles).toBe('ok');
    expect(etats.verification).toBe('incomplet');
  });

  it('un dossier refusé met la vérification en alerte', () => {
    const c = completudeDeLaFiche(agence(), false);
    expect(etatDesSections(c, [], { status: 'rejected' }).verification).toBe('alerte');
  });
});

describe('une seule référence : l’agence enregistrée', () => {
  it('après un enregistrement, la réponse devient la référence de tout — réglages compris', () => {
    const avant = agence({ settings: { offline_payment_wave_number: '+221771234567' } });
    const reponse = agence({ settings: { offline_payment_wave_number: '+221779999999' }, tagline: 'Neuve' });
    delete (reponse as Partial<Agency>).payout_approval_threshold;
    const apres = referenceApresEnregistrement({ ...avant, payout_approval_threshold: 500000 }, reponse);
    expect(apres.payout_approval_threshold).toBe(500000);
    const v = valeursDeLAgence(apres);
    expect(corpsDeLaFiche(v, apres, avec()).corps).toEqual({});
    // Revenir à l’ancien numéro est une modification, jugée contre la réponse et non contre le chargement.
    expect(corpsDeLaFiche({ ...v, offline_payment_wave_number: '+221771234567' }, apres, avec()).corps).toEqual({
      settings: { offline_payment_wave_number: '+221771234567' },
    });
  });
});

describe('erreursSurLeurChamp — un 422 sur sa ligne', () => {
  it('highlights.k suit indexDesPoints, settings.<paiement> perd son préfixe', () => {
    const a = agence();
    const v = { ...valeursDeLAgence(a), highlights: ['Un', '', 'Trois'] };
    const { indexDesPoints } = corpsDeLaFiche(v, a, avec());
    expect(indexDesPoints).toEqual([0, 2]);
    expect(
      erreursSurLeurChamp(
        { 'highlights.1': ['trop long'], 'settings.offline_payment_wave_number': ['invalide'], 'showcase_property_ids.2': ['x'], name: ['n'] },
        indexDesPoints,
      ),
    ).toEqual({
      'highlights.2': ['trop long'],
      offline_payment_wave_number: ['invalide'],
      showcase_property_ids: ['x'],
      name: ['n'],
    });
  });
});

describe('verification illisible', () => {
  it('hors du compte : ni manquante, ni présente', () => {
    const c = completudeDeLaFiche(agence(), null);
    expect(c.elements).toHaveLength(11);
    expect(c.elements).not.toContain('verification');
    expect(c.pourcentage).toBe(27);
  });
});

describe('rebaserLaSaisie — une agence relue pendant la saisie', () => {
  it('les champs non touchés suivent la nouvelle référence, les champs modifiés gardent la saisie', () => {
    const ancienne = agence({ logo_url: null, phone: '+221338000000' });
    const nouvelle = agence({ logo_url: 'https://media.example/neuf.png', phone: '+221338000000', website: 'https://autre.sn' });
    const saisie = { ...valeursDeLAgence(ancienne), tagline: 'En cours', offline_payment_wave_number: '771234567' };
    const rebasee = rebaserLaSaisie(saisie, ancienne, nouvelle, avec());
    expect(rebasee.tagline).toBe('En cours');
    expect(rebasee.offline_payment_wave_number).toBe('771234567');
    expect(rebasee.website).toBe('https://autre.sn');
    expect(champsModifies(corpsDeLaFiche(rebasee, nouvelle, avec()).corps)).toEqual(new Set(['tagline', 'offline_payment_wave_number']));
  });
});
