import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { ToastProvider } from '@/components/ui/toast';
import fr from '@/messages/fr.json';
import { TIMEZONE } from '@/i18n/config';
import type { PropertyListItem } from '@/types/property';

/**
 * TCK-1087 (P69.03) — **le premier octet de l'accueil n'attend plus `discovery`.**
 *
 * La page attendait `decouverteDeLAccueil` et `raccourcisDeLAccueil` avant de rendre quoi que ce
 * soit : mesuré, environ 1 s de TTFB sur `/fr`, contre 0,04 à 0,19 s sur la liste. Une frontière
 * `Suspense` laisse partir la coque (repli : le squelette de `HomepageDiscovery` sans données), et
 * les rangées arrivent dans la même réponse diffusée.
 *
 * Le réseau est retenu par une barrière : tant qu'elle est fermée, rien de ce que l'API rendrait
 * n'est connu. Le test éprouve deux choses :
 * 1. la page se rend, et la coque du flux est prête (premier octet), barrière FERMÉE ;
 * 2. barrière ouverte, le flux entier porte toujours le titre du bien et le lien vers sa fiche
 *    (TCK-432 : les rangées sont dans le HTML que lit un robot), et un seul `<h1>` ;
 * 3. le repli ne porte pas de `<h1>`.
 */

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr',
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: 'fr', messages: fr as never, namespace: namespace as never, timeZone: TIMEZONE }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

const BIEN = {
  id: 1,
  title: 'Zanzibar Onyx à Ngor',
  slug: 'zanzibar-onyx-a-ngor-Ab12Cd',
  price: 100_000,
  currency: 'XOF',
  type: 'villa',
  contract_type: 'rent',
  rent_period: 'monthly',
  bedrooms: 3,
  bathrooms: 2,
  area: 120,
  furnished: false,
  featured: false,
  main_photo_url: null,
  published_at: null,
  created_at: '2026-01-01',
  location: { quarter: null, city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
  reference_number: 'REF',
  status: null,
  visibility: null,
} as unknown as PropertyListItem;

let ouvrir: () => void = () => {};
let barriere = new Promise<void>((resolve) => {
  ouvrir = resolve;
});

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiFetch: vi.fn(async (path: string) => {
      await barriere;
      if (path.startsWith('/public/properties/discovery')) {
        return {
          data: {
            near: { items: [BIEN], city: 'Dakar', requested_city: null, fallback: false },
            rent: { items: [] },
            featured: { items: [] },
            latest: { items: [] },
          },
          meta: { per_row: 12 },
        };
      }
      throw new Error('hors du sujet');
    }),
  };
});

const { default: PageDAccueil } = await import('../page');

const ATTENTE = Symbol('attente');
const sous = <T,>(promesse: Promise<T>, ms: number) =>
  Promise.race([promesse, new Promise<typeof ATTENTE>((r) => setTimeout(() => r(ATTENTE), ms))]);

function enveloppe(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <NextIntlClientProvider locale="fr" messages={fr as never} timeZone={TIMEZONE}>
          {element}
        </NextIntlClientProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  ouvrir();
  barriere = new Promise<void>((resolve) => {
    ouvrir = resolve;
  });
  vi.spyOn(console, 'error').mockRestore();
});

describe('l’accueil diffuse sa coque avant ses rangées', () => {
  it('la page se rend et sa coque est prête alors que l’API n’a pas répondu', async () => {
    const element = await sous(PageDAccueil(), 200);
    expect(element, 'la page attend encore l’API avant de rendre').not.toBe(ATTENTE);

    // `renderToReadableStream` se résout quand la COQUE est prête, c'est-à-dire quand le premier
    // octet peut partir (`onShellReady`). Barrière fermée, elle doit l'être.
    const flux = await sous(renderToReadableStream(enveloppe(element as React.ReactElement)), 5_000);
    expect(flux, 'la coque attend l’API').not.toBe(ATTENTE);

    ouvrir();
    const lu = flux as ReadableStream<Uint8Array> & { allReady: Promise<void> };
    await lu.allReady;
    const decodeur = new TextDecoder();
    let markup = '';
    const lecteur = lu.getReader();
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      markup += decodeur.decode(value, { stream: true });
    }
    // TCK-432 — les rangées arrivent dans la MÊME réponse : titre et lien vers la fiche.
    expect(markup).toContain(BIEN.title);
    expect(markup).toMatch(new RegExp(`href="[^"]*/properties/${BIEN.slug}"`));
    expect(markup.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  });

  it('le repli est le squelette de l’accueil, sans `<h1>`', async () => {
    // Quand `discovery` tarde, le repli ET le contenu sont dans le HTML diffusé (le second dans un
    // `<div hidden>`, échangé par script). Mesuré sous `next dev` avec un repli qui portait le
    // titre : deux `<h1>` identiques dans le document servi. Le repli n'en porte donc pas, pour que
    // la page en garde un seul (TCK-432, AC3). Ce harnais ne voit pas le repli dans le flux (le
    // contenu y est prêt avant la première écriture) : il est rendu seul.
    const element = (await PageDAccueil()) as React.ReactElement<{ fallback: React.ReactElement }>;
    const repli = renderToStaticMarkup(enveloppe(element.props.fallback));

    expect(repli).toContain('<nav');
    expect(repli.match(/<h1[\s>]/g) ?? []).toHaveLength(0);
    expect(repli).toContain('aria-busy="true"');
  });
});
