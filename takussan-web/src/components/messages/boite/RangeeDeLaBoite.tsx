'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { AlarmClock, Check, Clock3, Hourglass, UserRoundPlus } from 'lucide-react';
import { StatusBadge } from '@/components/console/StatusBadge';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/message';
import { DELAI_DEPASSE_MS, delaiDuFil, nomsAttendus, type PuceDePilotage } from './pilotage';

/**
 * TCK-2968 (ADR-0128 § 7, maquette `fil-boite` D) — ce que la boîte de pilotage ajoute à une rangée de la
 * liste : l'étiquette de la file (« Tous », « Non lus »), les signaux (délai, motif d'attente, « confié à »,
 * rappel), et les gestes — au survol au bureau, au glissement au téléphone.
 *
 * Les gestes ne sont montés que par la PAGE de la messagerie (`pilotage`), jamais par le widget flottant,
 * ni sous impersonation (lecture seule).
 */
export interface PilotageDeLaListe {
  readonly onTraite: (conversation: Conversation, titre: string) => void;
  readonly onRappel: (conversation: Conversation, titre: string) => void;
  readonly onRamener: (conversation: Conversation) => void;
  /** Le personnel, pour une salle ou un groupe (jamais le fil d'un prospect) : décidé par la liste. */
  readonly onConfier?: (conversation: Conversation) => void;
}

const HEURES_DEPASSE = DELAI_DEPASSE_MS / 3_600_000;

/** L'étiquette de la file, quand la puce ne la dit pas (« Tous », « Non lus »). Rien pour « À jour ». */
export function EtiquetteDeFile({ file }: { readonly file: Conversation['file'] }) {
  const t = useTranslations('messaging.boite.etiquette');
  if (file !== 'vous' && file !== 'attente' && file !== 'rappel') return null;
  return <StatusBadge tone={file === 'vous' ? 'primary' : 'neutral'} label={t(file)} className="h-5 flex-none px-1.5 text-legende" />;
}

function Signal({ icone, children, className }: { readonly icone: ReactNode; readonly children: ReactNode; readonly className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      {icone}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Les signaux d'une rangée, lisibles sans légende : « depuis 25 min » sur un fil « À vous » (alerte au-delà de
 * {@link DELAI_DEPASSE_MS}), « En attente de Bineta Sarr » ou « Confié à Ibrahima Fall », « Revient demain
 * 09:00 ». `confieVisible` : le personnel seul lit à qui un fil est confié.
 */
export function SignauxDuFil({
  conversation,
  maintenant,
  moi,
  confieVisible,
}: {
  readonly conversation: Conversation;
  readonly maintenant: Date;
  readonly moi: number | undefined;
  readonly confieVisible: boolean;
}) {
  const t = useTranslations('messaging.boite');
  const format = useFormatter();
  const ic = 'size-3.5 flex-none';
  const items: ReactNode[] = [];
  if (conversation.file === 'vous') {
    const delai = delaiDuFil(conversation.attend_depuis, maintenant);
    if (delai) {
      const texte =
        delai.unite === 'minutes'
          ? t('delai.minutes', { n: delai.n })
          : delai.unite === 'jours'
            ? t('delai.jours', { n: delai.n })
            : delai.reste > 0
              ? t('delai.heuresMinutes', { h: delai.n, m: String(delai.reste).padStart(2, '0') })
              : t('delai.heures', { h: delai.n });
      items.push(
        <Signal
          key="delai"
          className={delai.depasse ? 'font-semibold text-warning' : 'text-encre-douce'}
          icone={<Clock3 className={ic} aria-hidden />}
        >
          {delai.depasse ? `${texte} · ${t('delai.depasse', { h: HEURES_DEPASSE })}` : texte}
        </Signal>,
      );
    }
  }
  const confie = confieVisible ? conversation.assigned_to : null;
  if (conversation.file === 'attente' && !confie) {
    const noms = nomsAttendus(conversation);
    if (noms.length > 0) {
      items.push(
        <Signal key="attente" className="text-muted-foreground" icone={<Hourglass className={ic} aria-hidden />}>
          {t('attenteDe', { noms: format.list(noms, { type: 'conjunction' }) })}
        </Signal>,
      );
    }
  }
  if (confie) {
    items.push(
      <Signal key="confie" className="text-encre-douce" icone={<UserRoundPlus className={ic} aria-hidden />}>
        {confie.id === moi ? t('confieAVous') : t('confieA', { nom: confie.name })}
      </Signal>,
    );
  }
  if (conversation.file === 'rappel' && conversation.snoozed_until) {
    const quand = format.dateTime(new Date(conversation.snoozed_until), { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar' });
    items.push(
      <Signal key="rappel" className="text-encre-douce" icone={<AlarmClock className={ic} aria-hidden />}>
        {t('revient', { quand })}
      </Signal>,
    );
  }
  if (items.length === 0) return null;
  return (
    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs" data-testid="signaux-du-fil">
      {items}
    </span>
  );
}

/** Le bureau, au survol ou au focus : Traité · Rappel · Confier. Au toucher, rien ici : la rangée se glisse. */
export function GestesAuSurvol({
  conversation,
  titre,
  pilotage,
  confiable,
}: {
  readonly conversation: Conversation;
  readonly titre: string;
  readonly pilotage: PilotageDeLaListe;
  readonly confiable: boolean;
}) {
  const t = useTranslations('messaging.boite.gestes');
  const b =
    'inline-flex h-7 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium text-encre-douce outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4';
  return (
    <div
      role="group"
      aria-label={t('label', { titre })}
      data-testid="gestes-au-survol"
      className="pointer-events-none absolute top-2 right-3 flex gap-0.5 rounded-lg border border-border bg-card p-0.5 opacity-0 shadow-actif transition-opacity group-hover/rangee:pointer-events-auto group-hover/rangee:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
    >
      {conversation.file === 'vous' ? (
        <button type="button" className={b} onClick={() => pilotage.onTraite(conversation, titre)}>
          <Check aria-hidden />
          {t('traite')}
        </button>
      ) : null}
      {conversation.file !== 'rappel' ? (
        <button type="button" className={b} aria-label={t('rappel')} onClick={() => pilotage.onRappel(conversation, titre)}>
          <AlarmClock aria-hidden />
        </button>
      ) : null}
      {confiable && pilotage.onConfier ? (
        <button type="button" className={b} aria-label={t('confier')} onClick={() => pilotage.onConfier?.(conversation)}>
          <UserRoundPlus aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** « Rappels » : ramener un fil avant l'heure — un bouton au bureau, un rond au téléphone. */
export function BoutonRamener({ conversation, pilotage }: { readonly conversation: Conversation; readonly pilotage: PilotageDeLaListe }) {
  const t = useTranslations('messaging.boite.gestes');
  return (
    <button
      type="button"
      onClick={() => pilotage.onRamener(conversation)}
      aria-label={t('ramenerAria')}
      className="absolute top-1/2 right-4 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring lg:h-8 lg:w-auto lg:rounded-lg lg:px-3 lg:text-ui lg:font-medium lg:text-foreground"
    >
      <AlarmClock className="size-4 lg:hidden" aria-hidden />
      <span className="max-lg:sr-only">{t('ramener')}</span>
    </button>
  );
}

const LARGEUR_ACTION = 84;

/**
 * Le téléphone : une rangée glissée vers la gauche découvre « Rappel » et « Traité » (maquette D2). Seul le
 * TOUCHER glisse (`pointerType`), le défilement vertical reste au navigateur (`touch-action: pan-y`). Au-delà
 * de la moitié d'une action, la rangée reste ouverte ; un toucher la referme.
 */
export function RangeeGlissable({
  conversation,
  titre,
  pilotage,
  children,
}: {
  readonly conversation: Conversation;
  readonly titre: string;
  readonly pilotage: PilotageDeLaListe | undefined;
  readonly children: ReactNode;
}) {
  const t = useTranslations('messaging.boite.gestes');
  const actions = pilotage ? (conversation.file === 'vous' ? 2 : conversation.file === 'rappel' ? 0 : 1) : 0;
  const max = actions * LARGEUR_ACTION;
  const [decalage, setDecalage] = useState(0);
  const depart = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  if (!pilotage || actions === 0) return <>{children}</>;
  const fermer = () => setDecalage(0);
  return (
    <div
      className="relative overflow-hidden touch-pan-y"
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return;
        depart.current = { x: e.clientX, y: e.clientY, base: decalage, horizontal: null };
      }}
      onPointerMove={(e) => {
        const d = depart.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (d.horizontal === null && (Math.abs(dx) > 8 || Math.abs(e.clientY - d.y) > 8)) d.horizontal = Math.abs(dx) > Math.abs(e.clientY - d.y);
        if (d.horizontal) setDecalage(Math.min(max, Math.max(0, d.base - dx)));
      }}
      onPointerUp={() => {
        const d = depart.current;
        depart.current = null;
        if (!d?.horizontal) return;
        setDecalage((x) => (x > LARGEUR_ACTION / 2 ? max : 0));
      }}
      onPointerCancel={() => {
        depart.current = null;
        fermer();
      }}
      onClickCapture={(e) => {
        // Une rangée ouverte se referme au toucher, sans ouvrir le fil.
        if (decalage > 0 && !(e.target as HTMLElement).closest('[data-geste-glisse]')) {
          e.preventDefault();
          e.stopPropagation();
          fermer();
        }
      }}
    >
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={decalage === 0} inert={decalage === 0}>
        {conversation.file !== 'rappel' ? (
          <button
            type="button"
            data-geste-glisse
            onClick={() => {
              fermer();
              pilotage.onRappel(conversation, titre);
            }}
            className="flex w-21 flex-col items-center justify-center gap-1 bg-muted text-xs font-medium text-foreground"
          >
            <AlarmClock className="size-5 stroke-[1.75]" aria-hidden />
            {t('rappelCourt')}
          </button>
        ) : null}
        {conversation.file === 'vous' ? (
          <button
            type="button"
            data-geste-glisse
            onClick={() => {
              fermer();
              pilotage.onTraite(conversation, titre);
            }}
            className="flex w-21 flex-col items-center justify-center gap-1 bg-success text-xs font-medium text-success-foreground"
          >
            <Check className="size-5" aria-hidden />
            {t('traite')}
          </button>
        ) : null}
      </div>
      <div
        className={cn('relative bg-background transition-transform motion-reduce:transition-none', decalage > 0 && 'shadow-actif')}
        style={{ transform: decalage > 0 ? `translateX(-${decalage}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}

export type { PuceDePilotage };
