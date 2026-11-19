'use client';

import { useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { useConversation } from '@/lib/queries/conversations';
import type { Conversation, ConversationContext } from '@/types/message';

/** Au-delà, les pastilles se tassent : les deux nombres restent la mesure. */
const PASTILLES_MAX = 20;

export interface PersonneDuFil {
  readonly id: number;
  readonly nom: string;
}

/**
 * TCK-2973 (ADR-0130 § 6, décision 1a) — la fiabilité des participants d'un fil : « 12 tenus · 2 en retard ·
 * sur 90 jours », et une rangée de pastilles. Jamais un pourcentage, une note ni une étoile.
 *
 * **Elle ne s'affiche que si l'API rend `commitments_records`, et pour les seuls comptes qu'elle y met** :
 * la clé n'existe que pour le personnel actif de l'agence. Le front ne la déduit d'aucun rôle et ne
 * complète jamais une ligne absente par zéro — un client, le participant lui-même ou une impersonation de
 * locataire ne voient ni le bloc, ni son texte. Soi n'y figure pas.
 */
export function FiabiliteDuFil({ contexte, personnes }: { readonly contexte: Pick<ConversationContext, 'commitments_records'> | null | undefined; readonly personnes: readonly PersonneDuFil[] }) {
  const t = useTranslations('messaging.engagements.fiabilite');
  const { user } = useAuth();
  const registres = contexte?.commitments_records;
  if (!registres) return null;
  const lignes = personnes.flatMap((p) => {
    const r = registres[String(p.id)];
    return r && p.id !== user?.id ? [{ ...p, ...r }] : [];
  });
  if (lignes.length === 0) return null;

  return (
    <section data-testid="fiabilite-du-fil" className="mt-5" aria-label={t('titre')}>
      <h3 className="text-sm font-semibold text-foreground">{t('titre')}</h3>
      <ul className="mt-2 space-y-3">
        {lignes.map((l) => (
          <li key={l.id} data-testid={`fiabilite-${l.id}`} className="rounded-xl bg-muted/60 px-3.5 py-3">
            <p className="text-sm font-medium">{l.nom}</p>
            <p className="mt-0.5 text-ui tabular-nums text-foreground">{t('compte', { tenus: l.kept, retard: l.late })}</p>
            <p className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
              {Array.from({ length: Math.min(l.kept, PASTILLES_MAX) }, (_, i) => (
                <span key={`k${i}`} className="size-2 rounded-full bg-success" />
              ))}
              {Array.from({ length: Math.min(l.late, PASTILLES_MAX) }, (_, i) => (
                <span key={`l${i}`} className={cn('size-2 rounded-full bg-warning')} />
              ))}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{t('visible')}</p>
    </section>
  );
}

/** TCK-2973 — la fiabilité dans la colonne de contexte (bureau) : les noms viennent des participants actifs du fil. */
export function FiabiliteDuFilOuvert({ conversationId, contexte }: { readonly conversationId: number; readonly contexte: Pick<ConversationContext, 'commitments_records'> | null | undefined }) {
  const { data } = useConversation(conversationId);
  return <FiabiliteDuFil contexte={contexte} personnes={personnesDuFil(data?.data)} />;
}

/** Les participants actifs nommés d'un fil. */
export function personnesDuFil(conversation: Pick<Conversation, 'participants'> | undefined): PersonneDuFil[] {
  return (conversation?.participants ?? []).filter((p) => !p.left_at && p.user?.full_name).map((p) => ({ id: p.user_id, nom: p.user!.full_name }));
}
