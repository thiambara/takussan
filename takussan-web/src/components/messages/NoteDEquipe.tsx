'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { decouperLesMentions } from './composeur/equipe';

/**
 * TCK-2968 — le texte d'un message, ses @mentions en valeur. Les mentions sont des IDENTIFIANTS
 * (`metadata.mentions`, TCK-2966) que l'appelant nomme d'après les participants : seul `@Nom` est mis en
 * valeur, et un identifiant n'est jamais affiché.
 */
export function TexteAvecMentions({ texte, noms, className }: { readonly texte: string; readonly noms: readonly string[]; readonly className?: string }) {
  return (
    <p className={cn('whitespace-pre-line text-pretty break-words', className)}>
      {decouperLesMentions(texte, noms).map((m, i) =>
        m.mention ? (
          <span key={i} className="font-medium text-primary-deep" data-testid="mention">
            {m.texte}
          </span>
        ) : (
          m.texte
        ),
      )}
    </p>
  );
}

/**
 * TCK-2968 (maquette `fil-cartes` D, `NoteEquipeD`) — une note d'équipe se lit au premier regard, sans
 * bordure : aplat ocre, cadenas, « Note d'équipe · auteur », et qui ne la lit pas. Elle n'arrive qu'à
 * qui la lit (l'API la filtre, TCK-2965) : un client ne la reçoit jamais.
 */
export function NoteDEquipe({
  mienne,
  auteur,
  invisiblePour,
  heure,
  children,
}: {
  readonly mienne: boolean;
  readonly auteur: string | null;
  /** Les prénoms de ceux qui ne la lisent pas ; vide ou inconnu : « Visible de l'équipe seulement ». */
  readonly invisiblePour: string | null;
  readonly heure: ReactNode;
  readonly children: ReactNode;
}) {
  const t = useTranslations('messaging.bulle.note');
  return (
    <li className={cn('flex', mienne ? 'justify-end' : 'justify-start')} data-testid="note-d-equipe">
      <div className={cn('max-w-[84%] rounded-2xl bg-warning/10 px-3.5 py-2.5 text-corps leading-snug text-foreground', mienne ? 'rounded-br-md' : 'rounded-bl-md')}>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
          <Lock className="size-3 flex-none" strokeWidth={2.5} aria-hidden />
          {t('titre')} · <span className="font-normal text-encre-douce">{mienne ? t('vous') : auteur}</span>
        </p>
        {children}
        <p className="mt-1.5 text-right text-legende text-encre-douce">
          {invisiblePour ? t('invisiblePour', { noms: invisiblePour }) : t('equipeSeule')} · <span className="tabular-nums">{heure}</span>
        </p>
      </div>
    </li>
  );
}
