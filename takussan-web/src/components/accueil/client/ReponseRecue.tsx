'use client';

import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { anciennete } from '@/lib/accueil/a-faire';
import { useReponseRecue } from '@/lib/queries/accueil-client';
import type { Conversation } from '@/types/message';

import { Disque, LienTonal } from '../pieces';

/**
 * TCK-2853 (maquette `app-accueil` a, écran « Client », bureau) — sous la visite, la rangée « Sokhna Sène
 * vous a répondu » / « « Oui, le studio est libre au 1ᵉʳ décembre. » · il y a 1 h » et « Lire », qui
 * ouvre le fil. Le fil est le direct NON LU le plus récent ({@link useReponseRecue}) : l'API ne le rend
 * que s'il porte un message d'un autre que le client, postérieur à sa lecture. Sans lui — ou en
 * chargement, ou en panne —, aucune rangée : c'est un signal, pas un bloc.
 *
 * Le nom est celui de l'autre membre du fil. La citation est l'aperçu du dernier message
 * (`last_message_preview`) ; un avis système n'est jamais cité.
 *
 * TCK-2860 — le fil non lu peut finir sur un message du client lui-même (il a répondu après le
 * message non lu) : `last_message.sender_id` (TCK-2858) le dit, et la rangée n'est alors pas rendue —
 * « X vous a répondu » serait faux. `null` (avis système) ou absent : la règle d'avant.
 */
export function ReponseRecue({ className }: { readonly className?: string }) {
  const t = useTranslations('accueil.client.reponse');
  const tAge = useTranslations('accueil.aFaire');
  const maintenant = useMinuteCourante();
  const { user } = useAuth();
  const lue = useReponseRecue();
  const fil = lue.data?.data?.[0];
  if (!fil) return null;
  if (user && fil.last_message?.sender_id === user.id) return null;
  const nom = nomDeLAutre(fil, user?.id ?? null);
  if (!nom) return null;
  const apercu = fil.last_message?.type !== 'system' ? fil.last_message_preview?.trim() || null : null;
  const age = fil.last_message_at ? anciennete(fil.last_message_at, maintenant) : null;
  const quand = age ? tAge(`ilYa.${age.unite}`, { n: age.unite === 'hier' ? 1 : age.n }) : null;
  const ligne = [apercu ? t('citation', { texte: apercu }) : null, quand].filter(Boolean).join(' · ');

  return (
    <div className={className} data-slot="reponse-recue">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <Disque icone={MessageSquare} ton="neutre" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-corps font-medium">{t('aRepondu', { nom })}</p>
          {ligne ? <p className="truncate text-ui text-muted-foreground">{ligne}</p> : null}
        </div>
        <LienTonal href={`/app/messages?conversation=${fil.id}`} className="flex-none">
          {t('lire')}
        </LienTonal>
      </div>
    </div>
  );
}

function nomDeLAutre(fil: Conversation, moi: number | null): string | null {
  const autre = (fil.participants ?? []).find((p) => p.user_id !== moi && !p.left_at && p.user?.full_name?.trim());
  return autre?.user?.full_name.trim() || fil.subject?.trim() || null;
}
