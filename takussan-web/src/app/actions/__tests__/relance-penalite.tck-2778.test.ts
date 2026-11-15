// @vitest-environment node
/**
 * TCK-2778 — le message de relance de la pénalité de retard SEULE (`sujet: 'penalite'`) : il dit la
 * pénalité et son montant, jamais « le loyer … reste à régler » ; sans lien (agence qui ne l'encaisse
 * pas en ligne), il ne porte ni lien ni repère et dit qu'elle se règle à l'agence.
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
  localeDuLocataire: null,
  localeDeLEcran: 'fr',
  prenom: 'Fatou',
  paymentType: 'rent',
  periodStart: '2026-10-01',
  dueDate: '2026-10-07',
  montant: 12_500,
  devise: 'XOF',
  bien: 'Studio de Sacré-Cœur',
  lien: LIEN,
  agence: 'Keur Immo',
  sujet: 'penalite',
} as const;

describe('TCK-2778 — composerLaRelanceAction, la pénalité seule', () => {
  it('dit la pénalité de retard du loyer du mois et son montant, avec le lien', async () => {
    const { texte, repere } = await composerLaRelanceAction(base);

    expect(texte).toMatch(/^Bonjour Fatou, la pénalité de retard du loyer d’octobre \(12\s500\sF\sCFA\) du bien « Studio de Sacré-Cœur » reste à régler\. /u);
    expect(texte).toContain(`Vous pouvez la payer en ligne ici : ${LIEN}`);
    expect(texte).toContain('De la part de Keur Immo.');
    expect(texte).not.toMatch(/le loyer d/);
    expect(repere).toBeNull();
  });

  it('sans lien encore créé : le repère, rendu pour être remplacé à l’envoi', async () => {
    const { texte, repere } = await composerLaRelanceAction({ ...base, lien: null });
    expect(repere).toBe(fr.admin.finances.impayes.message.repereDuLien);
    expect(texte).toContain(`Vous pouvez la payer en ligne ici : ${repere}`);
  });

  it('sans lien possible (`sansLien`) : ni lien, ni repère, la pénalité se règle à l’agence', async () => {
    const { texte, repere } = await composerLaRelanceAction({ ...base, lien: null, sansLien: true });
    expect(repere).toBeNull();
    expect(texte).toContain('reste à régler, auprès de votre agence.');
    expect(texte).not.toContain(fr.admin.finances.impayes.message.repereDuLien);
    expect(texte).not.toContain('http');
  });

  it('dans la langue du locataire, et pour un paiement qui n’est pas un loyer', async () => {
    const anglais = await composerLaRelanceAction({ ...base, localeDuLocataire: 'en' });
    expect(anglais.texte).toMatch(/^Hello Fatou, the late fee on the October rent \(/);
    expect(anglais.texte).toContain(`You can pay it online here: ${LIEN}`);

    const charges = await composerLaRelanceAction({ ...base, paymentType: 'charges' });
    expect(charges.texte).toMatch(/^Bonjour Fatou, la pénalité de retard du paiement « .+ » \(12\s500/u);
  });

  it('sans `sujet`, le message du loyer reste celui de TCK-2660', async () => {
    const { texte } = await composerLaRelanceAction({ ...base, sujet: undefined, montant: 250_000 });
    expect(texte).toMatch(/^Bonjour Fatou, le loyer d’octobre \(250\s000/u);
  });
});
