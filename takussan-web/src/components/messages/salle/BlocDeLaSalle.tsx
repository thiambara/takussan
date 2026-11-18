'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight, MessageSquare } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useMessagesInfinite } from '@/lib/queries/conversations';
import { cn } from '@/lib/utils';
import type { Conversation, Message } from '@/types/message';

import { useOuvrirLaSalle } from './requetesDeLaSalle';
import { membresActuels, type NatureDeSalle } from './salle';

interface BlocDeLaSalleProps {
  readonly nature: NatureDeSalle;
  /** L'identifiant du bail ou de la réservation de la fiche. */
  readonly id: number;
  readonly className?: string;
}

/** Les messages de membres que le bloc reprend (jamais un événement, une carte ni un avis système). */
const TYPES_DE_MEMBRE: readonly Message['type'][] = ['text', 'image', 'document', 'audio'];

/**
 * TCK-2963 (maquette `fil-salle-bail` A, `BlocSalle`) — l'entrée dans la salle depuis la fiche du bail ou de
 * la réservation : ce qui s'y dit (les deux derniers messages), et UN bouton pour y entrer.
 *
 * La salle s'ouvre par `POST /api/conversations/rooms` (TCK-2960) au rendu de la fiche : c'est la réponse
 * qui dit si le bloc existe. Pendant la lecture, et sur un refus (403 : un collègue de l'agence lit le bail
 * sans en être partie), RIEN ne s'affiche — ni squelette, ni bloc vide, ni message d'erreur.
 */
export function BlocDeLaSalle({ nature, id, className }: BlocDeLaSalleProps) {
  const { data, isPending, isError } = useOuvrirLaSalle({ nature, id });
  const salle = data?.data;
  if (isPending || isError || !salle) return null;
  return <Bloc salle={salle} nature={nature} className={className} />;
}

function Bloc({ salle, nature, className }: { readonly salle: Conversation; readonly nature: NatureDeSalle; readonly className?: string }) {
  const t = useTranslations('messaging');
  const f = useFormatteurs();
  const { user } = useAuth();
  const { data } = useMessagesInfinite(salle.id);
  const derniers = (data?.pages.flatMap((p) => p.data) ?? [])
    .filter((m) => TYPES_DE_MEMBRE.includes(m.type))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 2)
    .reverse();
  const membres = membresActuels(salle).length;

  return (
    <section data-testid="bloc-de-la-salle" className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <MessageSquare className="size-icone flex-none text-primary" strokeWidth={1.75} aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate text-corps font-semibold text-foreground">
          {nature === 'lease' ? t('salle.bloc.titreLease') : t('salle.bloc.titreBooking')}
        </h2>
        <span className="flex-none text-xs tabular-nums text-muted-foreground">{t('list.personnes', { n: membres })}</span>
      </div>
      <div className="space-y-2 px-4 py-3 text-ui">
        {derniers.length === 0 ? (
          <p className="text-muted-foreground">{t('salle.bloc.aucunMessage')}</p>
        ) : (
          derniers.map((m) => (
            <p key={m.id} className="flex items-baseline gap-2" data-testid="dernier-message-de-la-salle">
              <span className="max-w-[40%] flex-none truncate font-semibold text-foreground">
                {m.sender_id != null && m.sender_id === user?.id ? t('salle.bloc.vous') : (m.sender?.full_name ?? '—')}
              </span>
              <span className="min-w-0 flex-1 truncate text-encre-douce">
                {m.type === 'text' ? m.content : t(`list.apercu.${m.type}`)}
              </span>
              <span className="flex-none tabular-nums text-muted-foreground">{f.heure(m.created_at)}</span>
            </p>
          ))
        )}
      </div>
      <div className="border-t border-border px-4 py-3">
        <Link
          href={`/app/messages?conversation=${salle.id}`}
          data-testid="ouvrir-la-salle"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-10 w-full')}
        >
          {t('salle.bloc.ouvrir')}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
