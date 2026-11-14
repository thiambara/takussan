import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';
import { WizardDraftsBanner } from '../WizardDraftsBanner';

/**
 * TCK-2622 — AC5 : `GET /api/me/wizard-drafts` en `500` (relevé intermittent chez le prestataire, audit
 * § 2) ne casse pas l'accueil. Le bandeau ne rend rien, et aucun message d'erreur ne couvre la page.
 */
function rendre() {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <WizardDraftsBanner />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<WizardDraftsBanner> — la panne de l’API des brouillons', () => {
  it('500 : rien ne se rend, aucune alerte', async () => {
    const appel = vi.fn(async () => new Response(JSON.stringify({ message: 'Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', appel);
    const { container } = rendre();

    await waitFor(() => expect(appel).toHaveBeenCalledWith('/api/me/wizard-drafts', expect.anything()));
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('réseau coupé (fetch rejeté) : rien non plus', async () => {
    const appel = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', appel);
    const { container } = rendre();

    await waitFor(() => expect(appel).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
