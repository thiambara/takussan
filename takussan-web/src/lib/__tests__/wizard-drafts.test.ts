import { describe, it, expect } from 'vitest';

import {
  resolveWizardResume,
  projectDraftForBanner,
  estDemarcheAReprendre,
} from '@/lib/wizard-drafts';
import type { WizardDraft } from '@/types/wizard-draft';

describe('resolveWizardResume', () => {
  it('matches exact rules', () => {
    expect(resolveWizardResume('host-individual-wizard')).toEqual({
      href: '/onboarding/host',
      i18nKey: 'host-individual-wizard',
    });
  });

  it("ne rend plus de lien pour les trois clés dont la route n'existe pas (TCK-419)", () => {
    // Ces trois règles pointaient vers des routes absentes de `app/(dashboard)/app`, pour des
    // clés qu'aucun `storageKey` du dépôt n'écrit. Elles ont été retirées : `resolveWizardResume`
    // doit désormais les traiter comme inconnues, et la bannière les filtre (`resumeHref !== null`).
    for (const cle of ['customer-onboarding', 'owner-kyc', 'agent-kyc']) {
      expect(resolveWizardResume(cle), cle).toEqual({ href: null, i18nKey: null });
    }
  });

  it('matches prefix rules and forwards the suffix', () => {
    expect(resolveWizardResume('owner-onboarding-42')).toEqual({
      href: '/onboarding/owner?owner=42',
      i18nKey: 'owner-onboarding',
    });
  });

  it('returns null when no rule matches', () => {
    expect(resolveWizardResume('unknown-wizard')).toEqual({ href: null, i18nKey: null });
  });
});

describe('projectDraftForBanner', () => {
  it('extracts a banner-ready entry', () => {
    const draft: WizardDraft = {
      id: 1,
      key: 'host-individual-wizard',
      step: 2,
      data: { foo: 'bar' },
      updated_at: '2026-05-10T03:00:00Z',
    };
    expect(projectDraftForBanner(draft)).toEqual({
      key: 'host-individual-wizard',
      step: 2,
      updatedAt: '2026-05-10T03:00:00Z',
      resumeHref: '/onboarding/host',
      i18nKey: 'host-individual-wizard',
    });
  });

  it('returns null hrefs for unknown keys', () => {
    const draft: WizardDraft = {
      id: 7,
      key: 'mystery',
      step: 0,
      data: null,
      updated_at: null,
    };
    const projected = projectDraftForBanner(draft);
    expect(projected.resumeHref).toBeNull();
    expect(projected.i18nKey).toBeNull();
  });
});

describe('estDemarcheAReprendre — TCK-566', () => {
  const brouillon = (key: string, data: Record<string, unknown> | null): WizardDraft => ({
    id: 1,
    key,
    step: 0,
    data,
    updated_at: '2026-09-23T10:00:00Z',
  });

  it('écarte le brouillon « Passage en pro » ouvert sans saisie, tel que le serveur le rend', () => {
    expect(
      estDemarcheAReprendre(
        brouillon('agency-upgrade-7', {
          rc: null,
          ninea: null,
          rib_pro: null,
          address_fiscale: null,
          company_legal_name: null,
          planned_agents_count: null,
        }),
      ),
    ).toBe(false);
  });

  it('garde un brouillon « Passage en pro » qui porte une saisie', () => {
    expect(estDemarcheAReprendre(brouillon('agency-upgrade-7', { rc: 'RC-1' }))).toBe(true);
  });

  it('garde les brouillons des assistants d’onboarding : leur état vierge dépend du compte', () => {
    expect(estDemarcheAReprendre(brouillon('host-individual-wizard', { title: null }))).toBe(true);
    expect(estDemarcheAReprendre(brouillon('owner-onboarding-3', {}))).toBe(true);
  });

  it('écarte une clé qu’aucune règle ne sait reprendre', () => {
    expect(estDemarcheAReprendre(brouillon('unknown-wizard', { a: 1 }))).toBe(false);
  });
});
