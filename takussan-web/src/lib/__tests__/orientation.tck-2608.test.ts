import { describe, expect, it } from 'vitest';

import {
  TRANCHES_DE_BUDGET,
  canalWhatsAppDuChercheur,
  criteresDuChercheur,
  ecranAReprendre,
  lienDInvitationSuivi,
  nomDeLAlerte,
  parametresDeLaListe,
} from '@/lib/orientation';

/**
 * TCK-2608 — UNE construction des critères du chercheur sert le compte (« Voir les N biens »), l'alerte
 * (`POST /api/saved-searches`) et la liste ouverte : si les trois divergeaient, le nombre promis ne
 * serait pas celui de la liste (AC2).
 */
describe('TCK-2608 — les critères du chercheur', () => {
  it('Mermoz + Ngor, 150 000 – 300 000, à louer : locations, bornes, contrat et période', () => {
    const c = criteresDuChercheur({ contrat: 'rent', quartiers: ['Mermoz', 'Ngor'], budget: '150-300' });
    expect(c).toEqual({ contract_type: 'rent', locations: ['Mermoz', 'Ngor'], price_min: 150000, price_max: 300000, rent_period: 'monthly' });
    expect(parametresDeLaListe(c)).toBe('contract_type=rent&locations=Mermoz%2CNgor&price_min=150000&price_max=300000&rent_period=monthly');
  });

  it('un seul quartier s’écrit `location` (l’API demande 2 à 12 quartiers sous `locations`)', () => {
    const c = criteresDuChercheur({ contrat: 'rent', quartiers: ['Mermoz'], budget: null });
    expect(c).toEqual({ contract_type: 'rent', location: 'Mermoz' });
    expect(parametresDeLaListe(c)).toBe('contract_type=rent&location=Mermoz');
  });

  it('rien de choisi : le seul contrat — quartiers et budget sont facultatifs', () => {
    expect(criteresDuChercheur({ contrat: 'rent', quartiers: [], budget: null })).toEqual({ contract_type: 'rent' });
  });

  it('les tranches ouvertes n’ont qu’une borne', () => {
    expect(criteresDuChercheur({ contrat: 'rent', quartiers: [], budget: 'moins-150' })).toMatchObject({ price_max: 150000 });
    expect(criteresDuChercheur({ contrat: 'rent', quartiers: [], budget: 'moins-150' })).not.toHaveProperty('price_min');
    expect(criteresDuChercheur({ contrat: 'rent', quartiers: [], budget: 'plus-600' })).toMatchObject({ price_min: 600000 });
    expect(criteresDuChercheur({ contrat: 'rent', quartiers: [], budget: 'plus-600' })).not.toHaveProperty('price_max');
    expect(TRANCHES_DE_BUDGET.map((t) => t.id)).toEqual(['moins-150', '150-300', '300-600', 'plus-600']);
  });

  it('à l’achat, le budget mensuel ne s’applique pas', () => {
    expect(criteresDuChercheur({ contrat: 'sale', quartiers: ['Ngor', 'Yoff'], budget: '150-300' })).toEqual({ contract_type: 'sale', locations: ['Ngor', 'Yoff'] });
  });

  it('un quartier en double ou vide ne compte pas', () => {
    expect(criteresDuChercheur({ contrat: 'rent', quartiers: [' Mermoz ', 'Mermoz', ''], budget: null })).toEqual({ contract_type: 'rent', location: 'Mermoz' });
  });
});

describe('TCK-2608 — le nom de l’alerte, lisible et unique pour le compte', () => {
  const libelles = { louer: 'Location', acheter: 'Achat', partout: 'Tous les quartiers', budget: (t: string) => `${t} F CFA` };

  it('dit le contrat, les quartiers et le budget', () => {
    const c = criteresDuChercheur({ contrat: 'rent', quartiers: ['Mermoz', 'Ngor'], budget: '150-300' });
    expect(nomDeLAlerte(c, '150 000 – 300 000', libelles, [])).toBe('Location · Mermoz, Ngor · 150 000 – 300 000 F CFA');
  });

  it('un nom déjà pris par le compte reçoit un numéro (l’API rend 422 sur un doublon)', () => {
    const c = criteresDuChercheur({ contrat: 'rent', quartiers: ['Mermoz'], budget: null });
    expect(nomDeLAlerte(c, null, libelles, ['Location · Mermoz'])).toBe('Location · Mermoz (2)');
    expect(nomDeLAlerte(c, null, libelles, ['Location · Mermoz', 'Location · Mermoz (2)'])).toBe('Location · Mermoz (3)');
  });

  it('sans quartier : « Tous les quartiers » ; jamais plus de 100 caractères', () => {
    expect(nomDeLAlerte(criteresDuChercheur({ contrat: 'sale', quartiers: [], budget: null }), null, libelles, [])).toBe('Achat · Tous les quartiers');
    const douze = Array.from({ length: 12 }, (_, i) => `Quartier numéro ${i + 1}`);
    const nom = nomDeLAlerte(criteresDuChercheur({ contrat: 'rent', quartiers: douze, budget: null }), null, libelles, []);
    expect(nom.length).toBeLessThanOrEqual(100);
    expect(nom.endsWith('…')).toBe(true);
  });
});

/**
 * « Un lien collé n'est suivi que s'il est une URL `/invitations/accept?token=…` de Takussan (filtre
 * anti-redirection) ; sinon un message. » Le chemin rendu est TOUJOURS reconstruit (jamais le texte
 * collé) : rien d'autre que le jeton ne passe.
 */
describe('TCK-2608 — le lien d’invitation collé', () => {
  const site = 'https://www.takussan.com';
  const jeton = 'a'.repeat(64);

  it('un lien Takussan rend le chemin reconstruit', () => {
    expect(lienDInvitationSuivi(`https://www.takussan.com/invitations/accept?token=${jeton}`, site)).toBe(`/invitations/accept?token=${jeton}`);
    expect(lienDInvitationSuivi(`takussan.com/invitations/accept?token=${jeton}`, site)).toBe(`/invitations/accept?token=${jeton}`);
    expect(lienDInvitationSuivi(`  https://takussan.com/invitations/accept?token=${jeton}&utm=x  `, site)).toBe(`/invitations/accept?token=${jeton}`);
  });

  it('l’origine du site configuré (préproduction) et celle de la page sont des liens Takussan', () => {
    expect(lienDInvitationSuivi(`https://preview.takussan.com/invitations/accept?token=${jeton}`, 'https://preview.takussan.com')).toBe(`/invitations/accept?token=${jeton}`);
    expect(lienDInvitationSuivi(`http://localhost:3000/invitations/accept?token=${jeton}`, site, 'http://localhost:3000')).toBe(`/invitations/accept?token=${jeton}`);
  });

  it('un autre site, un autre chemin, un jeton absent ou mal formé : refusé', () => {
    expect(lienDInvitationSuivi(`https://evil.example/invitations/accept?token=${jeton}`, site)).toBeNull();
    expect(lienDInvitationSuivi(`https://takussan.com.evil.example/invitations/accept?token=${jeton}`, site)).toBeNull();
    expect(lienDInvitationSuivi(`https://evil.example/?u=https://takussan.com/invitations/accept?token=${jeton}`, site)).toBeNull();
    expect(lienDInvitationSuivi(`https://www.takussan.com/auth/login?redirect=/invitations/accept?token=${jeton}`, site)).toBeNull();
    expect(lienDInvitationSuivi('https://www.takussan.com/invitations/accept', site)).toBeNull();
    expect(lienDInvitationSuivi('https://www.takussan.com/invitations/accept?token=<script>', site)).toBeNull();
    expect(lienDInvitationSuivi(`javascript:alert(1)//takussan.com/invitations/accept?token=${jeton}`, site)).toBeNull();
    expect(lienDInvitationSuivi(`//evil.example/invitations/accept?token=${jeton}`, site)).toBeNull();
    expect(lienDInvitationSuivi('', site)).toBeNull();
  });
});

/**
 * L'écran à reprendre quand la page est re-rendue réponse écrite (une server action qui pose un cookie
 * re-rend la page : l'ouverture de l'espace pro en pose un).
 */
describe('TCK-2608 — l’écran à reprendre (`?etape=`)', () => {
  it('l’écran du professionnel reprend, même avec le profil d’agence qu’il vient d’ouvrir', () => {
    expect(ecranAReprendre('pro', 'professional', true)).toBe('pro');
    expect(ecranAReprendre('pro', 'professional', false)).toBe('pro');
  });

  it('la porte pro du site (`?etape=pro` après la connexion) s’ouvre sans profil d’agence, quelle que soit la réponse', () => {
    expect(ecranAReprendre('pro', 'search', false)).toBe('pro');
    expect(ecranAReprendre('pro', 'publish', false)).toBe('pro');
    expect(ecranAReprendre('pro', undefined, false)).toBe('pro');
    // Un compte établi (profil d'agence) qui n'a pas répondu « professionnel » n'y est pas ramené.
    expect(ecranAReprendre('pro', 'search', true)).toBeNull();
    expect(ecranAReprendre('pro', undefined, true)).toBeNull();
  });

  it('le chercheur et les portes reprennent, jamais pour un compte qui a un profil d’agence', () => {
    expect(ecranAReprendre('chercheur', 'search', false)).toBe('chercheur');
    expect(ecranAReprendre('chercheur', 'search', true)).toBeNull();
    expect(ecranAReprendre('portes', 'search', false)).toBe('portes');
    expect(ecranAReprendre('portes', 'professional', false)).toBe('portes');
    expect(ecranAReprendre('portes', 'professional', true)).toBeNull();
  });

  it('l’étape doit correspondre à la réponse écrite ; publier et passer ne reprennent rien', () => {
    expect(ecranAReprendre('chercheur', 'professional', false)).toBeNull();
    expect(ecranAReprendre('portes', 'publish', false)).toBeNull();
    expect(ecranAReprendre('portes', 'skipped', false)).toBeNull();
    expect(ecranAReprendre(undefined, 'search', false)).toBeNull();
    expect(ecranAReprendre('autre', 'search', false)).toBeNull();
  });
});

describe('TCK-2608 — l’interrupteur WhatsApp du chercheur', () => {
  const ouverte = [{ event_type: 'saved_search_match', channel: 'whatsapp', locked: false }];
  const formater = (t: string) => `≈${t}`;

  it('capacité ouverte, canal libre, numéro : l’interrupteur, avec le numéro', () => {
    expect(canalWhatsAppDuChercheur(['email', 'whatsapp'], ouverte, '+221771234567', formater)).toEqual({ numero: '≈+221771234567' });
  });

  it('capacité fermée : pas d’interrupteur', () => {
    expect(canalWhatsAppDuChercheur(['email'], ouverte, '+221771234567', formater)).toBeNull();
  });

  it('canal verrouillé (numéro non vérifié, sans WhatsApp) ou absent : pas d’interrupteur', () => {
    expect(canalWhatsAppDuChercheur(['whatsapp'], [{ ...ouverte[0]!, locked: true }], '+221771234567', formater)).toBeNull();
    expect(canalWhatsAppDuChercheur(['whatsapp'], [{ event_type: 'autre', channel: 'whatsapp', locked: false }], '+221771234567', formater)).toBeNull();
  });

  it('sans numéro : pas d’interrupteur', () => {
    expect(canalWhatsAppDuChercheur(['whatsapp'], ouverte, null, formater)).toBeNull();
  });
});
