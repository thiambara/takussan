import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ZodType } from 'zod';

import { withIntl } from '@/test/intl';
import { useResolveurValidation } from '@/hooks/useApiForm';
import { bookingRequestSchema, type BookingRequestFormValues } from '@/lib/schemas/booking';
import { sendMessageSchema, type SendMessageFormValues } from '@/lib/schemas/message';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES DEUX CONSOMMATEURS QUE L'INVENTAIRE DU LOT J AURAIT DÛ VOIR — ET N'A PAS VUS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le rapport de régression de TCK-292 nommait trois écrans, tous du même type : `safeParse()` +
 * rendu direct. En cherchant la FAMILLE plutôt que les trois cas, on en a trouvé **deux autres,
 * d'un type différent** : `ChatView.tsx` et `BookingTunnel.tsx` montaient `zodResolver` NU.
 *
 * Ce sont exactement les fichiers que `grep -rn zodResolver src` — la commande d'inventaire du lot
 * J — devait lister. Ils l'étaient. Ils n'ont pas été corrigés. *Une commande d'inventaire juste ne
 * vaut que si sa sortie est traitée en entier, et rien ne prouve après coup qu'elle l'ait été.*
 *
 * Ces deux composants sont lourds à monter (polling, React Query, contexte d'auth, machine à états
 * multi-étapes). Ce test-ci vise donc l'endroit exact où la traduction se produit — le résolveur —
 * et vérifie que sur LEURS schémas, il rend du français. Le branchement lui-même (« ce fichier
 * monte bien `useResolveurValidation` et pas `zodResolver` ») est gardé par le recensement de
 * `src/lib/schemas/__tests__/traducteurs-de-messages.test.ts`, qui casse sur tout retour en
 * arrière. Les deux ensemble couvrent ce qu'un montage complet couvrirait.
 */

const wrapper = ({ children }: { readonly children: ReactNode }) => withIntl(children);

/** Le caractère de contrôle U+0001 qui sépare la clé de ses paramètres ICU dans `msgValidation`. */
const SEPARATEUR_VALEURS = String.fromCharCode(1);

async function messagesDuResolveur<T extends Record<string, unknown>>(
  schema: ZodType<T>,
  valeurs: unknown,
): Promise<Record<string, string>> {
  const { result } = renderHook(() => useResolveurValidation<T>(schema), { wrapper });
  const sortie = await result.current(
    valeurs as T,
    undefined,
    // Le résolveur ne lit pas ces options ; react-hook-form les fournit en vrai.
    { fields: {}, shouldUseNativeValidation: false } as never,
  );
  return Object.fromEntries(
    Object.entries(sortie.errors as Record<string, { message?: string }>)
      .map(([champ, erreur]) => [champ, erreur?.message ?? '']),
  );
}

describe('useResolveurValidation sur les schémas des deux `zodResolver` nus corrigés', () => {
  it('sendMessageSchema (ChatView) rend le français, pas `validation.message.*`', async () => {
    const messages = await messagesDuResolveur<SendMessageFormValues>(
      sendMessageSchema as unknown as ZodType<SendMessageFormValues>,
      { content: '' },
    );
    expect(messages.content).toBe('Le message ne peut pas être vide.');
  });

  it('sendMessageSchema interpole le paramètre ICU `{max}` du message trop long', async () => {
    // Le seul message de ce schéma qui porte des VALEURS. S'il traversait sans être décodé, on
    // lirait la clé suivie du séparateur U+0001 et de son JSON — d'où la seconde assertion, qui
    // distingue « pas traduit du tout » de « traduit mais sans son paramètre ».
    const messages = await messagesDuResolveur<SendMessageFormValues>(
      sendMessageSchema as unknown as ZodType<SendMessageFormValues>,
      { content: 'x'.repeat(4001) },
    );
    expect(messages.content).toBe('Message trop long (4000 caractères max).');
    expect(messages.content).not.toContain(SEPARATEUR_VALEURS);
  });

  it('bookingRequestSchema (BookingTunnel) rend le français sur tous ses champs', async () => {
    const messages = await messagesDuResolveur<BookingRequestFormValues>(
      bookingRequestSchema as unknown as ZodType<BookingRequestFormValues>,
      {
        property_id: 1,
        start_date: '',
        end_date: 'pas-une-date',
        guests: 0,
        notes: '',
        accept_terms: false,
      },
    );
    expect(messages.start_date).toBe('La date est requise.');
    expect(messages.end_date).toBe('Format de date invalide.');
    expect(messages.guests).toBe('Au moins 1 personne.');
    expect(messages.accept_terms).toBe('Vous devez accepter les conditions.');
    for (const [champ, message] of Object.entries(messages)) {
      expect(message, `champ ${champ}`).not.toMatch(/^validation\./);
    }
  });
});
