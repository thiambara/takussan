/**
 * TCK-2598 (réserve r2 de la contre-vérification de b055562f7) — l'assistant de l'admin d'agence, sans
 * brouillon, déclare sa saisie à la coque d'entrée : l'accueil et l'intro du second facteur sortent sans
 * demander ; dès que le code QR est montré (un secret est écrit), « Retour au site » demande et dit que
 * la configuration reprendra au début ; aux codes de secours, montrés une seule fois, il le dit.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { CoqueDEntree, type LibellesDeLaCoque } from '@/components/entree/CoqueDEntree';

import { AgencyAdminOnboardingWizard } from '../AgencyAdminOnboardingWizard';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...reste }: React.ComponentProps<'a'> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));
vi.mock('@/app/actions/security', () => ({
  twoFactorEnableAction: vi.fn(async () => ({ ok: true, data: { secret: 'SECRETDETEST', qr_svg: null, qr_url: 'otpauth://totp/test' } })),
  twoFactorConfirmAction: vi.fn(async () => ({ ok: true, data: { recovery_codes: ['aaaa-bbbb', 'cccc-dddd'] } })),
}));

const C = frMessages.coqueDEntree;
const S = frMessages.agency.onboarding.sortie;
const LIBELLES: LibellesDeLaCoque = {
  marque: 'Takussan',
  retourAuSite: C.retourAuSite,
  fermer: C.fermer,
  quitter: C.quitter,
  avancement: C.avancement,
  sortie: C.sortie,
};

let clics: { href: string | null; annule: boolean }[] = [];
function enregistrer(evenement: MouseEvent) {
  const lien = (evenement.target as Element).closest('a');
  if (!lien) return;
  clics.push({ href: lien.getAttribute('href'), annule: evenement.defaultPrevented });
  evenement.preventDefault();
}
beforeEach(() => {
  clics = [];
  window.addEventListener('click', enregistrer);
});
afterEach(() => window.removeEventListener('click', enregistrer));

/** Clique « Retour au site » : le texte de la confirmation, ou `null` si la sortie n'a rien demandé. */
function sortir(): string | null {
  fireEvent.click(screen.getAllByRole('link', { name: C.retourAuSite })[0]);
  const boite = screen.queryByRole('dialog');
  if (!boite) return null;
  const texte = [S.configuration, S.codes, C.sortie.texte].find((t) => within(boite).queryByText(t)) ?? '?';
  fireEvent.click(within(boite).getByRole('button', { name: C.sortie.rester }));
  return texte;
}

describe('r2 — l’assistant de l’admin d’agence déclare sa saisie', () => {
  it('accueil et intro : sortie directe ; code QR montré : la configuration reprendra ; codes de secours : ils ne reviendront pas', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
          <AgencyAdminOnboardingWizard firstName="Awa" agencyName="Dakar Immo" />
        </CoqueDEntree>,
      ),
    );

    expect(sortir()).toBeNull();
    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    expect(sortir()).toBeNull();
    expect(clics.every((clic) => !clic.annule)).toBe(true);

    await user.click(screen.getByRole('button', { name: frMessages.auth.twoFactor.intro.cta }));
    await screen.findByLabelText(frMessages.auth.twoFactor.scan.codeLabel);
    expect(sortir()).toBe(S.configuration);
    // La marque aussi (r1).
    fireEvent.click(screen.getAllByRole('link', { name: 'Takussan' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: C.sortie.rester }));

    await user.type(screen.getByLabelText(frMessages.auth.twoFactor.scan.codeLabel), '123456');
    await user.click(screen.getByRole('button', { name: frMessages.auth.twoFactor.scan.cta }));
    await screen.findByText('aaaa-bbbb');
    expect(sortir()).toBe(S.codes);
    expect(clics.at(-1)).toEqual({ href: '/', annule: true });
  });
});
