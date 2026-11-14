/**
 * TCK-2798 — l'outil de fidélité ne refrappe que les jetons qu'on lui nomme, et le jeton d'une invitation n'atteint
 * jamais un relevé. Le 2026-11-13, `jetons --renouveler` a révoqué les jetons de tous les agents en même temps.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { masquer, personasAFrapper, remplirInvitation } from '../../scripts/fidelite/personas.mjs';

const connues = ['admin', 'agent', 'personas-hote', 'personas-bailleur-invite'];
const jetons = { admin: { token: 'a' }, 'personas-bailleur-invite': { invitation: 'i' } };

describe('personasAFrapper', () => {
  it('refuse --renouveler sans personas nommées', () => {
    expect(() => personasAFrapper({ demandes: null, renouveler: true, connues, jetons })).toThrow(/--persona/);
    expect(() => personasAFrapper({ demandes: [], renouveler: true, connues, jetons })).toThrow(/--persona/);
  });

  it('ne refrappe que les personas nommées', () => {
    expect(personasAFrapper({ demandes: ['admin'], renouveler: true, connues, jetons })).toEqual(['admin']);
  });

  it('sans --renouveler, ne frappe que ce qui manque : rien de présent n’est révoqué', () => {
    expect(personasAFrapper({ demandes: null, renouveler: false, connues, jetons })).toEqual(['agent', 'personas-hote']);
    expect(personasAFrapper({ demandes: ['admin', 'personas-hote'], renouveler: false, connues, jetons })).toEqual(['personas-hote']);
  });

  it('refuse une persona inconnue', () => {
    expect(() => personasAFrapper({ demandes: ['fantome'], renouveler: false, connues, jetons })).toThrow(/fantome/);
  });
});

describe('remplirInvitation', () => {
  it('pose le jeton dans la requête seulement', () => {
    expect(remplirInvitation('/invitations/accept?token={invitation}', 'ab/c+d')).toBe('/invitations/accept?token=ab%2Fc%2Bd');
    expect(remplirInvitation('/app', undefined)).toBe('/app');
  });

  it('refuse un gabarit sans jeton, ou qui le porte dans le chemin', () => {
    expect(() => remplirInvitation('/invitations/accept?token={invitation}', undefined)).toThrow(/--invitation/);
    expect(() => remplirInvitation('/invitations/{invitation}', 'x')).toThrow(/chemin/);
  });
});

describe('masquer', () => {
  it('retire le jeton, brut ou encodé, d’une URL observée', () => {
    expect(masquer('GET /api/public/invitations/ab/c+d', ['ab/c+d'])).toBe('GET /api/public/invitations/<jeton>');
    expect(masquer('GET /api/public/invitations/ab%2Fc%2Bd', ['ab/c+d'])).toBe('GET /api/public/invitations/<jeton>');
  });
});

describe('personas.json', () => {
  it('déclare les personas semées sous le domaine dédié, les invités à part', () => {
    const personas = JSON.parse(readFileSync(join(__dirname, '../../scripts/fidelite/personas.json'), 'utf8'));
    const semees = Object.entries<{ email: string }>(personas.comptes).filter(([n]) => n.startsWith('personas-'));
    expect(semees.map(([n]) => n).sort()).toEqual([
      // TCK-2838 : le compte du bailleur invité, une fois l'invitation consommée (relevé de la carte de
      // l'interlocuteur). Il porte un nom distinct de l'invitation, qui reste « à part ».
      'personas-bailleur-invite-compte',
      'personas-gerant',
      'personas-hote',
      'personas-orientation-awa',
      'personas-orientation-sans-prenom',
      'personas-prestataire-intervention',
    ]);
    for (const [, c] of semees) expect(c.email).toMatch(/@personas\.takussan\.test$/);
    expect(Object.keys(personas.invitations).sort()).toEqual(['personas-agent-invite', 'personas-bailleur-invite', 'personas-prestataire-invite']);
    // Un invité n'a pas de compte : il ne doit pas être frappé comme un compte.
    for (const n of Object.keys(personas.invitations)) expect(personas.comptes[n]).toBeUndefined();
  });
});
