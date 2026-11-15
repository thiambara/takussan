/**
 * TCK-2613 (AC5) — l'écran 1 au bureau large : la colonne de 480 px et, à droite dès 1280, « {agence} vous attend »
 * (maquette `app-entree-assistants` a, « Ton numéro, étape commune », bureau). AVANT le code, le panneau ne montre
 * rien que l'invité n'ait déjà vu (team-lead, 2026-11-14) : l'agence, le rôle, et le titre de l'intervention que la
 * page d'invitation lui montrait (`awaiting.maintenance_request.title`) — jamais ses pièces ni un compte de biens.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { afficheA } from '@/test/affiche-a';
import { withIntl } from '@/test/intl';

import { CeQuiVousAttend } from '../CeQuiVousAttend';
import { EtapeDuNumero } from '../EtapeDuNumero';

vi.mock('@/app/actions/security', () => ({ phoneSendOtpAction: vi.fn(), phoneVerifyOtpAction: vi.fn() }));

const A = frMessages.onboarding.invite.attente;
const SANS_DONNEE_NEUVE = /pièce|\d+\s+biens?|loyer/i;

describe('<CeQuiVousAttend> (TCK-2613)', () => {
  it('bailleur : l’agence, « Juste après votre code », ses biens — sans compte ni pièce', () => {
    render(withIntl(<CeQuiVousAttend qui="bailleur" agence="Dakar Immo" />));
    const panneau = screen.getByRole('complementary', { name: 'Dakar Immo vous attend' });
    expect(panneau).toHaveTextContent(A.sousTitre);
    expect(panneau).toHaveTextContent(A.bailleur.titre);
    expect(panneau.textContent).not.toMatch(SANS_DONNEE_NEUVE);
  });

  it('prestataire : le titre de l’intervention jointe ; sans elle, ce qui viendra', () => {
    const { unmount } = render(withIntl(<CeQuiVousAttend qui="prestataire" agence="Dakar Immo" intervention="Fuite sous évier" />));
    const panneau = screen.getByRole('complementary');
    expect(within(panneau).getByText(A.prestataire.titre)).toBeInTheDocument();
    expect(panneau).toHaveTextContent('Fuite sous évier');
    expect(panneau.textContent).not.toMatch(SANS_DONNEE_NEUVE);
    unmount();
    render(withIntl(<CeQuiVousAttend qui="prestataire" agence={null} intervention={null} />));
    expect(screen.getByRole('complementary', { name: A.titreSans })).toHaveTextContent(A.prestataire.titreSans);
  });

  it('agent : ses prospects, sans présupposer qu’il en a un', () => {
    render(withIntl(<CeQuiVousAttend qui="agent" agence="Dakar Immo" />));
    expect(screen.getByRole('complementary')).toHaveTextContent(A.agent.titre);
    expect(screen.getByRole('complementary').textContent).not.toMatch(SANS_DONNEE_NEUVE);
  });
});

describe('<EtapeDuNumero> au bureau large (TCK-2613, AC5)', () => {
  it('la colonne tient 480 px dès xl, et l’aperçu passe à droite — absent en dessous de 1280', () => {
    render(
      withIntl(
        <EtapeDuNumero numero="+221776124567" onNumero={vi.fn()} agence="Dakar Immo" onVerifie={vi.fn()} panneau={<p>aperçu</p>} />,
      ),
    );
    const titre = screen.getByRole('heading', { level: 1 });
    const colonne = titre.parentElement!;
    expect(colonne.className).toMatch(/(^|\s)xl:max-w-\[30rem\](\s|$)/);
    const aside = screen.getByText('aperçu').closest('[data-apercu-d-invite]')!;
    expect(afficheA(aside, 390)).toBe(false);
    expect(afficheA(aside, 1024)).toBe(false);
    expect(afficheA(aside, 1280)).toBe(true);
    expect(colonne.parentElement!.className).toMatch(/(^|\s)xl:grid-cols-\[minmax\(0,30rem\)_minmax\(0,1fr\)\](\s|$)/);
  });

  it('sans aperçu, la colonne tient 480 px dès xl elle aussi (plus de champ de 1080 px)', () => {
    render(withIntl(<EtapeDuNumero numero="+221776124567" onNumero={vi.fn()} agence={null} onVerifie={vi.fn()} />));
    expect(screen.getByRole('heading', { level: 1 }).parentElement!.className).toMatch(/(^|\s)xl:max-w-\[30rem\](\s|$)/);
    expect(document.querySelector('[data-apercu-d-invite]')).toBeNull();
  });
});
