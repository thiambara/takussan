// @vitest-environment node
/**
 * TCK-2660 (ADR-0105 § 1) — le message de relance s'écrit dans la langue du LOCATAIRE, pas dans
 * celle de l'écran ; la langue de l'écran n'est qu'un repli (locataire sans langue, ou langue
 * inconnue). Wolof en pause : un locataire `wo` reçoit le texte français, tel que `wo.json` le porte.
 */
import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';

const DICTIONNAIRES = { fr, en, wo } as const;

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: keyof typeof DICTIONNAIRES; namespace: string }) =>
    createTranslator({ locale, messages: DICTIONNAIRES[locale], namespace: namespace as never }),
}));

const { composerLaRelanceAction } = await import('../relance');

const LIEN = 'https://www.takussan.com/pay/k7Qm2xR9';
const base = {
  localeDeLEcran: 'fr',
  prenom: 'Fatou',
  paymentType: 'rent',
  periodStart: '2026-10-01',
  dueDate: '2026-10-07',
  montant: 250_000,
  devise: 'XOF',
  bien: 'Studio de Sacré-Cœur',
  lien: LIEN,
} as const;

describe('TCK-2660 — composerLaRelanceAction', () => {
  it('écrit au prénom, le loyer du mois, le montant, le bien, la date et le lien — en français par défaut', async () => {
    const { locale, texte } = await composerLaRelanceAction({ ...base, localeDuLocataire: null });

    expect(locale).toBe('fr');
    expect(texte).toMatch(/^Bonjour Fatou, le loyer d’octobre \(250\s000\sF\sCFA\) du bien « Studio de Sacré-Cœur » reste à régler depuis le 7 octobre\. /u);
    expect(texte).toContain(`Vous pouvez le payer en ligne ici : ${LIEN}`);
    // Aucun moyen de paiement nommé : le lien ne dit pas lesquels il propose.
    expect(texte).not.toMatch(/Wave|Orange Money/);
  });

  it('suit la langue du LOCATAIRE, même quand l’écran est en français', async () => {
    const { locale, texte } = await composerLaRelanceAction({ ...base, localeDuLocataire: 'en' });

    expect(locale).toBe('en');
    expect(texte).toMatch(/^Hello Fatou, the October rent \(/);
    expect(texte).toContain(`You can pay it online here: ${LIEN}`);
  });

  it('un locataire sans langue reçoit celle de l’écran (le repli)', async () => {
    const { locale, texte } = await composerLaRelanceAction({ ...base, localeDuLocataire: null, localeDeLEcran: 'en' });

    expect(locale).toBe('en');
    expect(texte).toMatch(/^Hello Fatou/);
  });

  it('wolof en pause : un locataire `wo` reçoit le texte FRANÇAIS', async () => {
    const { locale, texte } = await composerLaRelanceAction({ ...base, localeDuLocataire: 'wo', localeDeLEcran: 'en' });

    expect(locale).toBe('wo');
    expect(texte).toMatch(/^Bonjour Fatou, le loyer d’octobre/);
  });

  it('sans prénom ni bien : « Bonjour, le loyer de novembre (…) reste à régler »', async () => {
    const { texte } = await composerLaRelanceAction({ ...base, localeDuLocataire: 'fr', prenom: null, bien: '  ', periodStart: '2026-11-01', dueDate: '2026-11-05' });

    expect(texte).toMatch(/^Bonjour, le loyer de novembre \([^)]+\) reste à régler depuis le 5 novembre\./);
  });

  it('une échéance qui n’est pas un loyer se nomme par sa période (« Charges d’octobre »)', async () => {
    const { texte } = await composerLaRelanceAction({ ...base, localeDuLocataire: 'fr', paymentType: 'charges' });

    expect(texte).toMatch(/^Bonjour Fatou, le paiement « Charges d’octobre » \(/);
  });
});
