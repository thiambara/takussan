import { describe, it, expect } from 'vitest';

import {
  resolveWizardResume,
  projectDraftForBanner,
} from '@/lib/wizard-drafts';
import type { WizardDraft } from '@/types/wizard-draft';

describe('resolveWizardResume', () => {
  it('matches exact rules', () => {
    expect(resolveWizardResume('host-individual-wizard')).toEqual({
      href: '/onboarding/host',
      i18nKey: 'host-individual-wizard',
    });
    expect(resolveWizardResume('customer-onboarding')).toEqual({
      href: '/app/profile/customer/onboarding',
      i18nKey: 'customer-onboarding',
    });
  });

  it('matches prefix rules and forwards the suffix', () => {
    expect(resolveWizardResume('owner-onboarding-42')).toEqual({
      href: '/app/profile/owner/onboarding?invitation=42',
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
