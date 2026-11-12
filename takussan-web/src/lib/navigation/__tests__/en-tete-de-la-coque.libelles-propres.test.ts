import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import type { UserRole } from '@/types/user';
import { PAGES_ADMIN } from '@/lib/access/pages-admin';
import { CATALOGUE } from '../catalogue';
import { DISPOSITIONS } from '../dispositions';
import { titreDeLaRoute, type TitreDerive } from '../en-tete-de-la-coque';
import type { ContexteDeMenu } from '../types';

/**
 * Vérification de TCK-2671 — `/app/agency/billing` rendait une 500 à l'hôte : MISSING_MESSAGE
 * `nav.sidebar.payouts`. L'hôte nomme sa page de facturation « Reversements » (`libelles` de sa
 * disposition, clé `payouts`), et cette clé vit dans l'espace de la destination (`nav.admin`), là où
 * le menu la cherche (`composer-menu`, `labelSpace`). L'en-tête de la coque la cherchait, lui, sous
 * `nav.sidebar` pour tout libellé propre au persona. Les deux lecteurs disent désormais la même chose,
 * et chaque libellé propre de chaque disposition est résolu ici, en français et en anglais.
 */
type Messages = Record<string, unknown>;

function lire(messages: Messages, titre: TitreDerive | null): string | undefined {
  if (!titre) return undefined;
  const valeur = [...titre.espace.split('.'), ...titre.cle.split('.')].reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    messages,
  );
  return typeof valeur === 'string' ? valeur : undefined;
}

const HOTE: ContexteDeMenu = {
  roles: ['agency_admin', 'customer'] as UserRole[],
  capacites: null,
  cheminsAdmin: PAGES_ADMIN.map((p) => p.chemin),
};

const LIBELLES_PROPRES = Object.entries(DISPOSITIONS).flatMap(([persona, disposition]) =>
  Object.entries(disposition.libelles ?? {}).map(([id, cle]) => [persona, id, cle as string] as const),
);

describe('le libellé propre au persona, dans l’espace de sa destination', () => {
  it('l’hôte lit « Reversements » en titre de sa page de facturation', () => {
    const titre = titreDeLaRoute('/app/agency/billing', HOTE, 'hote');
    expect(titre).toEqual({ espace: 'nav.admin', cle: 'payouts' });
    expect(lire(fr, titre)).toBe('Reversements');
  });

  it('le relevé n’est pas vide (garde-fou du parcours)', () => {
    expect(LIBELLES_PROPRES.length).toBeGreaterThan(5);
  });

  it.each(LIBELLES_PROPRES)('%s · %s → %s : traduit en fr et en en, là où le menu le cherche', (_persona, id, cle) => {
    const destination = CATALOGUE.find((d) => d.id === id);
    expect(destination, id).toBeDefined();
    const titre: TitreDerive = { espace: destination?.espace ?? 'nav.sidebar', cle };
    expect(lire(fr, titre), JSON.stringify(titre)).toBeTruthy();
    expect(lire(en, titre), JSON.stringify(titre)).toBeTruthy();
  });
});
