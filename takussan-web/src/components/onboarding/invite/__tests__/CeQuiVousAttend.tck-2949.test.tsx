/**
 * TCK-2949 — le panneau « {agence} vous attend » de l'étape du numéro, chiffré par `invite-summary` (TCK-2939) :
 * « 3 biens suivis par l'agence » + les titres, « Votre dernier loyer · 350 000 F reçus le 5 nov. », « 2 pièces à
 * envoyer » (maquette `app-entree-assistants` a, e4, bureau). Chaque ligne n'est rendue que si l'API la sert ; sans
 * résumé (404 → `null`) ou champs nuls, les lignes génériques de TCK-2613.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import type { PieceDuProfil } from '@/lib/pieces/pieces';
import type { ResumeDInvite } from '@/lib/resume-d-invite';
import { withIntl } from '@/test/intl';

import { CeQuiVousAttend } from '../CeQuiVousAttend';

const A = frMessages.onboarding.invite.attente;
const espaces = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');

function piece(code: string, state: PieceDuProfil['state'] = 'missing', required = true): PieceDuProfil {
  return { code, required, state } as unknown as PieceDuProfil;
}

const RESUME_DU_BAILLEUR: ResumeDInvite = {
  role: 'owner',
  properties_count: 3,
  titles: ['Appartement F4 à Mermoz', 'Studio à Ouakam', 'Villa à Ngor'],
  last_rent: { amount: 350000, paid_at: '2026-11-05T10:00:00+00:00' },
  missing_documents: 2,
};

const VIDE: ResumeDInvite = { role: 'owner', properties_count: null, titles: [], last_rent: null, missing_documents: 0 };

beforeEach(() => {
  // « 5 nov. » sans l'année : la date est de l'année en cours (`jourMois`).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('<CeQuiVousAttend> chiffré (TCK-2949)', () => {
  it('AC1 — bailleur : 3 biens et leurs titres, le dernier loyer, les pièces à envoyer nommées', () => {
    render(
      withIntl(
        <CeQuiVousAttend
          qui="bailleur"
          agence="Dakar Immo"
          resume={RESUME_DU_BAILLEUR}
          pieces={[piece('cni'), piece('rib'), piece('ninea', 'missing', false), piece('photo', 'verified')]}
        />,
      ),
    );
    const panneau = screen.getByRole('complementary', { name: 'Dakar Immo vous attend' });
    const lignes = Array.from(panneau.querySelectorAll('li')).map((li) => espaces(li.textContent));
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toBe('3 biens suivis par l’agenceAppartement F4 à Mermoz, Studio à Ouakam, Villa à Ngor');
    expect(lignes[1]).toBe(`${A.chiffres.loyer}350 000 F reçus le 5 nov.`);
    expect(lignes[2]).toBe('2 pièces à envoyerRIB et pièce d’identité — quand vous voulez, depuis votre espace');
    // La ligne générique du bailleur cède la place aux chiffres.
    expect(panneau).not.toHaveTextContent(A.bailleur.titre);
  });

  it('AC2 — sans résumé (404 → null) : les lignes génériques, sans chiffre', () => {
    render(withIntl(<CeQuiVousAttend qui="bailleur" agence="Dakar Immo" resume={null} pieces={[piece('cni')]} />));
    const panneau = screen.getByRole('complementary');
    expect(panneau.querySelectorAll('li')).toHaveLength(1);
    expect(panneau).toHaveTextContent(A.bailleur.titre);
    expect(panneau.textContent).not.toMatch(/pièce|\d+\s+biens?|loyer/i);
  });

  it('AC2 — champs nuls : les lignes génériques, sans chiffre', () => {
    render(withIntl(<CeQuiVousAttend qui="bailleur" agence="Dakar Immo" resume={VIDE} pieces={null} />));
    const panneau = screen.getByRole('complementary');
    expect(panneau.querySelectorAll('li')).toHaveLength(1);
    expect(panneau).toHaveTextContent(A.bailleur.titre);
    expect(panneau.textContent).not.toMatch(/pièce|\d+\s+biens?|loyer/i);
  });

  it('bailleur sans bien mais avec un loyer : la ligne générique, puis le loyer — chaque ligne si servie', () => {
    render(
      withIntl(
        <CeQuiVousAttend
          qui="bailleur"
          agence="Dakar Immo"
          resume={{ ...VIDE, properties_count: 0, last_rent: { amount: 120000, paid_at: null } }}
        />,
      ),
    );
    const lignes = Array.from(screen.getByRole('complementary').querySelectorAll('li')).map((li) => espaces(li.textContent));
    expect(lignes).toEqual([`${A.bailleur.titre}${A.bailleur.texte}`, `${A.chiffres.loyer}120 000 F reçus`]);
  });

  it('pièces : sans leurs noms concordants, le compte seul et le texte générique', () => {
    render(
      withIntl(<CeQuiVousAttend qui="bailleur" agence={null} resume={{ ...VIDE, missing_documents: 1 }} pieces={[piece('cni'), piece('rib')]} />),
    );
    const derniere = Array.from(screen.getByRole('complementary').querySelectorAll('li')).at(-1)!;
    expect(espaces(derniere.textContent)).toBe(`1 pièce à envoyer${A.chiffres.piecesSansNoms}`);
  });

  it('agent : sa ligne de prospects, les biens de l’agence, ses pièces — jamais de loyer', () => {
    render(
      withIntl(
        <CeQuiVousAttend
          qui="agent"
          agence="Dakar Immo"
          resume={{ role: 'agent', properties_count: 12, titles: [], last_rent: { amount: 1, paid_at: null }, missing_documents: 1 }}
          pieces={[piece('cni')]}
        />,
      ),
    );
    const lignes = Array.from(screen.getByRole('complementary').querySelectorAll('li')).map((li) => espaces(li.textContent));
    expect(lignes).toEqual([
      `${A.agent.titre}${A.agent.texte}`,
      `12 biens suivis par l’agence${A.chiffres.parc}`,
      '1 pièce à envoyerPièce d’identité — quand vous voulez, depuis votre espace',
    ]);
  });

  it('prestataire : l’intervention jointe, puis ses pièces — ni biens ni loyer', () => {
    render(
      withIntl(
        <CeQuiVousAttend
          qui="prestataire"
          agence="Dakar Immo"
          intervention="Fuite sous évier"
          resume={{ role: 'service_provider', properties_count: 4, titles: ['X'], last_rent: { amount: 1, paid_at: null }, missing_documents: 2 }}
          pieces={[piece('insurance'), piece('license')]}
        />,
      ),
    );
    const lignes = Array.from(screen.getByRole('complementary').querySelectorAll('li')).map((li) => espaces(li.textContent));
    expect(lignes).toEqual([
      `${A.prestataire.titre}Fuite sous évier`,
      '2 pièces à envoyerCarte professionnelle et assurance RC pro — quand vous voulez, depuis votre espace',
    ]);
  });
});
