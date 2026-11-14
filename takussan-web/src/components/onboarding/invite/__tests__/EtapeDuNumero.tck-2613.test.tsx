import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

const phoneSendOtpAction = vi.fn();
const phoneVerifyOtpAction = vi.fn();
vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...args: unknown[]) => phoneSendOtpAction(...args),
  phoneVerifyOtpAction: (...args: unknown[]) => phoneVerifyOtpAction(...args),
}));

import { EtapeDuNumero } from '../EtapeDuNumero';

/**
 * TCK-2613 — l'étape commune des assistants d'invité : le numéro saisi par l'agence, le code en six cases, et
 * l'échec d'envoi écrit SOUS LE CHAMP, avec son délai, qui reste (AC2 : sur `dev`, un toast éphémère seul).
 */
function monter(numero = '+221776124567', onVerifie = vi.fn(), onNumero = vi.fn()) {
  render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <EtapeDuNumero numero={numero} onNumero={onNumero} agence="Dakar Immo" onVerifie={onVerifie} />
    </NextIntlClientProvider>,
  );
  return { onVerifie, onNumero };
}

async function vider() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('<EtapeDuNumero> (TCK-2613)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('le numéro saisi par l’agence se montre figé, avec « Modifier », et l’agence est nommée', () => {
    monter();
    expect(screen.getByRole('heading', { level: 1, name: 'Vérifiez votre numéro' })).toBeInTheDocument();
    expect(screen.getByText(/Dakar Immo l’a déjà saisi/)).toBeInTheDocument();
    expect(screen.getByText('77 612 45 67')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recevoir le code' })).toBeEnabled();
  });

  it('AC2 — un 429 laisse sous le champ « trop d’envois », avec son délai, encore là 10 s plus tard', async () => {
    vi.useFakeTimers();
    phoneSendOtpAction.mockResolvedValue({ ok: false, message: 'Trop de tentatives.', attente: 120 });
    monter();

    fireEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await vider();

    const attendu = 'Le SMS n’est pas parti : trop d’envois vers ce numéro. Réessayez dans 2 min, ou vérifiez le numéro.';
    expect(screen.getByRole('alert')).toHaveTextContent(attendu);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(attendu);
    // Sous le champ : dans le bloc du numéro, avant tout le reste.
    expect(document.querySelector('[data-erreur-d-envoi]')?.previousElementSibling).toHaveTextContent('77 612 45 67');
    // Le renvoi attend la fin du délai.
    expect(screen.getByRole('button', { name: 'Recevoir le code' })).toBeDisabled();
  });

  it('un autre refus d’envoi écrit ce que l’API a dit, sous le champ', async () => {
    phoneSendOtpAction.mockResolvedValue({ ok: false, message: 'Numéro invalide.' });
    monter();
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await vider();
    expect(screen.getByRole('alert')).toHaveTextContent('Numéro invalide.');
  });

  it('le numéro TAPÉ part avec la demande ; le renvoi se compte sur `retry_after`', async () => {
    phoneSendOtpAction.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null, attente: 42 } });
    monter();
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await vider();

    expect(phoneSendOtpAction).toHaveBeenCalledWith('+221776124567');
    expect(screen.getByText(/Code envoyé par SMS au/)).toHaveTextContent('77 •• •• 45 67');
    expect(screen.getByText(/renvoyer le code dans/)).toHaveTextContent('0:42');
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled();
  });

  it('« Continuer » s’allume au sixième chiffre et vérifie ; le code accepté passe la main', async () => {
    phoneSendOtpAction.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null } });
    phoneVerifyOtpAction.mockResolvedValue({ ok: true, data: null });
    const { onVerifie } = monter();
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await vider();

    fireEvent.change(screen.getByLabelText('Code reçu par SMS'), { target: { value: '482913' } });
    const continuer = screen.getByRole('button', { name: 'Continuer' });
    expect(continuer).toBeEnabled();
    fireEvent.click(continuer);
    await vider();

    expect(phoneVerifyOtpAction).toHaveBeenCalledWith('482913');
    expect(onVerifie).toHaveBeenCalledTimes(1);
  });

  it('un code refusé reste à l’écran, en rouge, et ne passe pas la main', async () => {
    phoneSendOtpAction.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null } });
    phoneVerifyOtpAction.mockResolvedValue({ ok: false, message: 'Code invalide ou expiré.' });
    const { onVerifie } = monter();
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await vider();
    fireEvent.change(screen.getByLabelText('Code reçu par SMS'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await vider();

    expect(screen.getByRole('alert')).toHaveTextContent('Code invalide ou expiré.');
    expect(onVerifie).not.toHaveBeenCalled();
  });

  it('hors production, le code d’aperçu se propose', async () => {
    phoneSendOtpAction.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: '482913' } });
    monter();
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await vider();
    expect(screen.getByTestId('code-de-preproduction')).toHaveTextContent('482913');
  });

  it('sans numéro, le champ s’ouvre et « Recevoir le code » attend un numéro composable', () => {
    monter('');
    expect(screen.getByLabelText('Votre numéro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recevoir le code' })).toBeDisabled();
  });
});
