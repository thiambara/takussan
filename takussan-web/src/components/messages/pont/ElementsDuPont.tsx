'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Clock, Link2, MessageCircle, Send } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/console';
import { Button } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useConversation } from '@/lib/queries/conversations';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/message';
import {
  cleDeLEtat,
  cleDuCanal,
  cleDuRefus,
  destinatairesEnMessageType,
  destinatairesFenetreOuverte,
  fenetreOuverte,
  relaye,
  useInvitationAuPont,
  type ParticipantDuPont,
} from './pont';

/**
 * TCK-2984 (ADR-0132, maquette `fil-pont` D) — ce que l'agent voit du pont. Chaque élément ne se rend QUE si la
 * réponse de l'API porte sa clé (`channel`, `relays`, `action_link`, `context.pont`) : l'API les réserve
 * au personnel de l'agence du fil ; un locataire, un bailleur, un prestataire n'en reçoivent rien, et ces
 * éléments ne rendent alors rien. Aucun numéro de téléphone n'est lu ni écrit ici.
 */

type Noms = Readonly<Record<number, string>>;

/** Le ton d'une puce du pont (téléphone) : la couleur se décide dans `StatusBadge`. */
const TON_DE_LA_PUCE: Readonly<Record<'opposition' | 'ouverte' | 'fermee' | 'app', StatusTone>> = {
  opposition: 'danger',
  ouverte: 'success',
  fermee: 'attention',
  app: 'neutral',
};

/** Le ton de l'état d'un relais : la couleur se décide dans `StatusBadge`, jamais ici. */
const TON_DU_RELAIS: Readonly<Record<ReturnType<typeof cleDeLEtat>, StatusTone>> = {
  en_attente_accord: 'attention',
  envoye: 'neutral',
  remis: 'info',
  lu: 'success',
  echec: 'danger',
  non_envoye: 'danger',
  autre: 'neutral',
};

/** La puce discrète d'un canal (connu ou générique). `app` ne se marque pas : c'est le cas ordinaire. */
export function PuceDeCanal({ canal, className }: { readonly canal: string; readonly className?: string }) {
  const t = useTranslations('messaging.pont.canal');
  if (canal === 'app') return null;
  return (
    <span
      data-testid="puce-de-canal"
      data-canal={cleDuCanal(canal)}
      className={cn('inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground', className)}
    >
      <MessageCircle className="size-3 stroke-[1.75]" aria-hidden="true" />
      {t(cleDuCanal(canal))}
    </span>
  );
}

/** Sous un message : « par WhatsApp » (reçu par le pont), puis l'état de ses relais (message du personnel). */
export function PontDuMessage({ message, noms, className }: { readonly message: Message; readonly noms: Noms; readonly className?: string }) {
  const t = useTranslations('messaging.pont');
  const f = useFormatteurs();
  // Une note d'équipe ne part jamais par le pont : rien ne s'y affiche (TCK-2968).
  if (message.visibility === 'team') return null;
  const recu = typeof message.channel === 'string' && message.channel !== 'app';
  const relais = Array.isArray(message.relays) ? message.relays : [];
  if (!recu && relais.length === 0) return null;
  return (
    <div data-testid="pont-du-message" className={cn('mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground', className)}>
      {recu ? <PuceDeCanal canal={message.channel as string} /> : null}
      {relais.map((r) => {
        const etat = cleDeLEtat(r.status);
        return (
          <span key={`${r.user_id}-${r.channel}`} data-testid="relais" data-etat={etat} className="inline-flex items-center gap-1">
            {t('relais.destinataire', { nom: noms[r.user_id] ?? t('quelquUn'), canal: t(`canal.${cleDuCanal(r.channel)}`) })}
            <StatusBadge label={t(`relais.etat.${etat}`)} tone={TON_DU_RELAIS[etat]} data-testid="etat-du-relais" />
            {r.form === 'template' ? <span className="opacity-80">· {t('relais.messageType')}</span> : null}
            {r.at ? <span className="opacity-80">· {f.heure(r.at)}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

/** Sous une carte : lien envoyé · ouvert · fait, avec l'heure — personnel seul (clé `action_link`). */
export function TraceDuLien({ message }: { readonly message: Message }) {
  const t = useTranslations('messaging.pont.lien');
  const f = useFormatteurs();
  const lien = message.action_link;
  if (!lien || typeof lien !== 'object') return null;
  const etapes = (
    [
      ['envoye', lien.sent_at],
      ['ouvert', lien.opened_at],
      ['fait', lien.used_at],
    ] as const
  ).filter(([, quand]) => Boolean(quand));
  if (etapes.length === 0) return null;
  return (
    <p data-testid="trace-du-lien" className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <Link2 className="size-3 stroke-[1.75]" aria-hidden="true" />
      {etapes.map(([cle, quand], i) => (
        <span key={cle}>
          {i > 0 ? '· ' : ''}
          {t(cle, { heure: f.heure(quand) })}
        </span>
      ))}
    </p>
  );
}

interface BandeauDeLaFenetreProps {
  readonly participants: ReadonlyArray<ParticipantDuPont> | undefined;
  readonly noms: Noms;
  readonly moi?: number | null;
  /** Injecté par les tests ; sinon l'instant du rendu. */
  readonly maintenant?: number;
}

/**
 * Au-dessus du composeur : fenêtre ouverte, un bandeau calme ; fenêtre FERMÉE pour un destinataire joint, un
 * bandeau d'attention qui annonce que le message partira en message type (le seul gabarit, ADR-0132 § 4), et que
 * sa réponse rouvrira la fenêtre. Jugé sur `fenetre_jusqu_a` seul (AC3).
 */
export function BandeauDeLaFenetre({ participants, noms, moi, maintenant }: BandeauDeLaFenetreProps) {
  const t = useTranslations('messaging.pont.fenetre');
  const f = useFormatteurs();
  // eslint-disable-next-line react-hooks/purity -- l'instant du rendu ; les tests l'injectent.
  const instant = maintenant ?? Date.now();
  const fermees = destinatairesEnMessageType(participants, instant, moi);
  const ouvertes = destinatairesFenetreOuverte(participants, instant, moi);
  const nom = (p: ParticipantDuPont) => noms[p.user_id] ?? '—';
  if (fermees.length > 0) {
    return (
      <div role="status" data-testid="bandeau-fenetre" data-etat="fermee" className="flex items-start gap-2 border-t border-warning/40 bg-warning/10 px-4 py-2 text-sm">
        <AlertTriangle className="mt-0.5 size-4 flex-none stroke-[1.75] text-warning" aria-hidden="true" />
        <p>
          <span className="font-medium">{t('fermee', { noms: fermees.map(nom).join(', ') })}</span>{' '}
          <span data-testid="annonce-message-type">{t('messageType')}</span>
        </p>
      </div>
    );
  }
  if (ouvertes.length > 0) {
    return (
      <div role="status" data-testid="bandeau-fenetre" data-etat="ouverte" className="flex items-center gap-2 border-t border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
        <Clock className="size-3.5 stroke-[1.75]" aria-hidden="true" />
        {ouvertes.map((p) => (
          <span key={p.user_id}>{t('ouverte', { nom: nom(p), jusqua: f.heure(p.pont?.fenetre_jusqu_a ?? null) })}</span>
        ))}
      </div>
    );
  }
  return null;
}

/**
 * Au téléphone (sous `xl`, où la colonne de contexte n'est pas là) : une puce par participant qui porte un bloc
 * `pont`, sous l'en-tête — son canal et sa fenêtre, ou WhatsApp barré après un STOP. Rien sans bloc `pont`.
 */
export function PucesDuPont({ participants, noms, moi, maintenant }: BandeauDeLaFenetreProps) {
  const t = useTranslations('messaging.pont');
  // eslint-disable-next-line react-hooks/purity -- l'instant du rendu ; les tests l'injectent.
  const instant = maintenant ?? Date.now();
  const avecPont = (participants ?? []).filter((p) => p.user_id !== moi && Boolean(p.pont));
  if (avecPont.length === 0) return null;
  return (
    <ul data-testid="puces-du-pont" aria-label={t('panneau.titre')} className="flex gap-1.5 overflow-x-auto border-b border-border px-4 py-1.5 xl:hidden">
      {avecPont.map((p) => {
        const pont = p.pont;
        const canal = t(`canal.${cleDuCanal(pont.canal ?? 'whatsapp')}`);
        const etat: keyof typeof TON_DE_LA_PUCE = pont.opposition_at ? 'opposition' : relaye(pont) ? (fenetreOuverte(pont, instant) ? 'ouverte' : 'fermee') : 'app';
        return (
          <li key={p.user_id} data-testid="puce-du-pont" data-etat={etat} className="inline-flex flex-none items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            <span className="font-medium">{noms[p.user_id] ?? '—'}</span>
            <StatusBadge
              tone={TON_DE_LA_PUCE[etat]}
              icon={etat === 'app' ? undefined : <MessageCircle className="size-3 stroke-[1.75]" aria-hidden="true" />}
              label={etat === 'opposition' ? <s>{canal}</s> : etat === 'app' ? t('canal.app') : canal}
            />
            {etat === 'fermee' ? <Clock className="size-3 stroke-[1.75]" role="img" aria-label={t('puce.fenetreFermee')} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

interface ParticipantsEtCanauxProps {
  readonly conversationId: number;
  readonly participants: ReadonlyArray<ParticipantDuPont> | undefined;
  readonly noms: Noms;
  readonly maintenant?: number;
}

/**
 * Le panneau « Participants et canaux » (bureau) : qui lit dans Takussan, qui est joint par WhatsApp, l'accord,
 * l'opposition (STOP, sans bouton pour passer outre), la fenêtre ; « Joindre par WhatsApp » sur une personne
 * `invitable`. Rien sans au moins un bloc `pont` dans la réponse (lecteur qui n'est pas personnel).
 */
export function ParticipantsEtCanaux({ conversationId, participants, noms, maintenant }: ParticipantsEtCanauxProps) {
  const t = useTranslations('messaging.pont');
  const f = useFormatteurs();
  const avecPont = (participants ?? []).filter((p) => Boolean(p.pont));
  // eslint-disable-next-line react-hooks/purity -- l'instant du rendu ; les tests l'injectent.
  const instant = maintenant ?? Date.now();
  if (avecPont.length === 0) return null;
  return (
    <section data-testid="participants-et-canaux" aria-label={t('panneau.titre')} className="mt-4 rounded-xl border border-border p-3">
      <h3 className="mb-2 text-sm font-semibold">{t('panneau.titre')}</h3>
      <ul className="space-y-2">
        {avecPont.map((p) => (
          <LigneDuParticipant key={p.user_id} conversationId={conversationId} participant={p} nom={noms[p.user_id] ?? '—'} instant={instant} f={f} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Le panneau monté dans la colonne de contexte : il ne lit les noms du fil (`useConversation`, en cache) que
 * lorsqu'au moins un participant porte un bloc `pont` — pour tout autre lecteur, rien n'est monté ni demandé.
 */
export function ParticipantsEtCanauxDuFil({ conversationId, participants }: { readonly conversationId: number; readonly participants: ReadonlyArray<ParticipantDuPont> | undefined }) {
  if (!(participants ?? []).some((p) => Boolean(p.pont))) return null;
  return <PanneauAvecNoms conversationId={conversationId} participants={participants} />;
}

function PanneauAvecNoms({ conversationId, participants }: { readonly conversationId: number; readonly participants: ReadonlyArray<ParticipantDuPont> | undefined }) {
  const { data } = useConversation(conversationId);
  const noms: Noms = Object.fromEntries((data?.data?.participants ?? []).map((p) => [p.user_id, p.user?.full_name ?? '—']));
  return <ParticipantsEtCanaux conversationId={conversationId} participants={participants} noms={noms} />;
}

function LigneDuParticipant({
  conversationId,
  participant,
  nom,
  instant,
  f,
}: {
  readonly conversationId: number;
  readonly participant: ParticipantDuPont;
  readonly nom: string;
  readonly instant: number;
  readonly f: ReturnType<typeof useFormatteurs>;
}) {
  const t = useTranslations('messaging.pont');
  const invitation = useInvitationAuPont(conversationId);
  // Un seul appel, même sur deux clics avant que `isPending` ne désactive le bouton.
  const enVol = useRef(false);
  const pont = participant.pont;
  const canal = pont.canal ?? 'whatsapp';
  let etat: React.ReactNode;
  if (pont.opposition_at) {
    etat = (
      <span data-testid="etat-pont" data-etat="opposition" className="text-destructive">
        <span className="line-through">{t(`canal.${cleDuCanal(canal)}`)}</span> · {t('panneau.opposition', { date: f.date(pont.opposition_at, { dateStyle: 'medium' }) })}
      </span>
    );
  } else if (relaye(pont)) {
    etat = (
      <span data-testid="etat-pont" data-etat="joint" className="inline-flex flex-wrap items-center gap-1">
        <PuceDeCanal canal={canal} />
        {fenetreOuverte(pont, instant)
          ? t('panneau.fenetreOuverte', { jusqua: f.heure(pont.fenetre_jusqu_a ?? null) })
          : t('panneau.fenetreFermee')}
      </span>
    );
  } else if (invitation.isSuccess || pont.invitation_en_attente) {
    etat = <span data-testid="etat-pont" data-etat="invite">{t('panneau.invitationEnvoyee')}</span>;
  } else {
    etat = <span data-testid="etat-pont" data-etat="app">{t('panneau.litDansTakussan')}</span>;
  }
  return (
    <li className="flex flex-col gap-1 text-sm" data-testid="ligne-pont" data-user-id={participant.user_id}>
      <span className="font-medium">{nom}</span>
      <span className="text-xs text-muted-foreground">{etat}</span>
      {pont.invitable && !pont.joint && !pont.opposition_at && !invitation.isSuccess && !pont.invitation_en_attente ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          disabled={invitation.isPending}
          onClick={() => {
            if (enVol.current || invitation.isPending) return;
            enVol.current = true;
            invitation.mutate({ user_id: participant.user_id }, { onSettled: () => { enVol.current = false; } });
          }}
        >
          <Send className="size-3.5 stroke-[1.75]" aria-hidden="true" />
          {t('panneau.joindre')}
        </Button>
      ) : null}
      {invitation.isError ? (
        <p role="alert" data-testid="refus-invitation" className="text-xs text-destructive">
          {t(`refus.${cleDuRefus(invitation.error)}`)}
        </p>
      ) : null}
    </li>
  );
}
