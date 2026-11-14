'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { BellOff, Building2, ChevronRight, FileText, Loader2, MoreHorizontal, Pencil, UserPlus, Wrench } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { initiales } from '@/lib/fiche-publique';
import { useConversation, useConversationContext } from '@/lib/queries/conversations';
import type { ConversationContext, ConversationParticipant, RelationAuFil } from '@/types/message';
import { AlerteErreurs } from './erreursDeValidation';
import { ID_COLONNE_DE_CONTEXTE } from './EnTeteDuFil';
import { ParticipantPicker } from './ParticipantPicker';
import { MAX_GROUP_SIZE, useGestionDuGroupe } from './useGestionDuGroupe';

interface InfosDuGroupeProps {
  readonly conversationId: number;
}

/**
 * TCK-2748 (AC2) — la colonne de droite d'un fil de GROUPE au bureau, dès `xl` (maquette
 * `app-messagerie`, `AGroupeBureau`) : le nom (renommable par un admin), l'intervention, le bail et le
 * bien liés, les participants avec leur relation au contexte, « Ajouter un participant », la sourdine,
 * et « Quitter le groupe » — refusé à la dernière personne qui administre, avec la raison.
 *
 * Les fils directs gardent `ColonneDeContexte`. Sous `xl`, la feuille `ConversationInfoSheet` reste
 * la voie : les deux surfaces partagent leur logique (`useGestionDuGroupe`).
 *
 * **La relation de chaque participant vient de l'API** (`participants` du contexte, TCK-2748 AC3) :
 * elle n'y figure que si l'appelant peut lire l'objet dont elle vient. Absente, la ligne ne dit que ce
 * que le fil sait — « Vous », « admin du groupe » —, jamais une relation devinée.
 *
 * Repliée (le bouton de l'en-tête du fil), elle disparaît : le fil reprend la largeur.
 */
export function InfosDuGroupe({ conversationId }: InfosDuGroupeProps) {
  const t = useTranslations('messaging.group.info');
  const tCreation = useTranslations('messaging.group.create');
  const { data: detail } = useConversation(conversationId);
  const conversation = detail?.data;
  const { data: contexteData, isLoading } = useConversationContext(conversationId);
  const contexte = contexteData?.data ?? null;
  const g = useGestionDuGroupe(conversation);
  const [ajout, setAjout] = useState(false);
  const relations = new Map<number, RelationAuFil>((contexte?.participants ?? []).map((r) => [r.user_id, r]));
  const sourdine = Boolean(g.participants.find((p) => p.user_id === g.moiId)?.is_muted);

  return (
    <aside
      id={ID_COLONNE_DE_CONTEXTE}
      data-testid="infos-du-groupe"
      aria-label={t('colonne')}
      // Maquette : 320 px fixes (88,9 pas de 3,6 px au bureau), et non la largeur relative de la colonne
      // de contexte : la liste des participants garde ses lignes de rôle entières.
      className="flex w-[calc(var(--spacing)*88.9)] flex-none flex-col overflow-y-auto border-l border-border bg-background p-4 max-xl:hidden"
    >
      <p className="text-xs font-medium text-muted-foreground">{t('colonne')}</p>
      {conversation ? (
        <NomDuGroupe
          key={conversation.subject ?? ''}
          sujet={conversation.subject ?? ''}
          modifiable={g.estAdmin}
          enCours={g.enCours.renommer}
          onRenommer={g.renommer}
        />
      ) : (
        <Skeleton className="mt-2 h-11 w-full rounded-lg" />
      )}

      {isLoading ? (
        <Skeleton className="mt-3 h-20 w-full rounded-xl" />
      ) : contexte ? (
        <ObjetsLies contexte={contexte} />
      ) : null}

      <p className="mt-5 mb-1 text-xs font-medium text-muted-foreground tabular-nums">
        {t('participantsCompte', { count: g.participants.length })}
      </p>
      <ul className="divide-y divide-border/70 rounded-xl border border-border bg-card px-3.5" data-testid="participants-du-groupe">
        {g.participants.map((p) => (
          <LigneDeParticipant
            key={p.id}
            participant={p}
            soi={p.user_id === g.moiId}
            relation={relations.get(p.user_id) ?? null}
            gerable={g.estAdmin && p.user_id !== g.moiId}
            occupe={g.enCours.retirer || g.enCours.role}
            onPromouvoir={() => g.changerDeRole(p.user_id, 'admin')}
            onRetrograder={() => g.changerDeRole(p.user_id, 'member')}
            onRetirer={() => g.retirer(p.user_id)}
          />
        ))}
        {g.estAdmin ? (
          <li>
            {ajout ? (
              <div className="space-y-1.5 py-2.5">
                <label className="flex items-center gap-2 text-ui font-medium text-muted-foreground" htmlFor="infos-ajouter-participant">
                  {t('ajouterUnParticipant')}
                  {g.enCours.inviter ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                </label>
                <ParticipantPicker
                  inputId="infos-ajouter-participant"
                  conversationId={g.conversationId}
                  value={[]}
                  excludeIds={g.participants.map((p) => p.user_id)}
                  max={Math.max(0, MAX_GROUP_SIZE - g.participants.length)}
                  onMaxReached={() => g.setError(tCreation('maxParticipants', { max: MAX_GROUP_SIZE }))}
                  onChange={(next) => g.inviter(next.at(-1))}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAjout(true)}
                className="flex w-full items-center gap-2.5 rounded-lg py-2.5 text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                <span className="inline-flex size-8 flex-none items-center justify-center rounded-full border border-dashed border-primary">
                  <UserPlus className="size-4 stroke-[1.75]" aria-hidden="true" />
                </span>
                {t('ajouterUnParticipant')}
              </button>
            )}
          </li>
        ) : null}
      </ul>

      <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
        <BellOff className="size-4 flex-none text-muted-foreground stroke-[1.75]" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm font-medium">{t('sourdine')}</span>
        <Switch
          checked={sourdine}
          disabled={g.enCours.sourdine || !conversation}
          onCheckedChange={() => g.basculerLaSourdine(sourdine)}
        />
      </label>

      <div className="mt-3 rounded-xl border border-border bg-card px-3.5 py-3" data-testid="quitter-le-groupe">
        {g.dernierAdmin ? (
          <>
            <p className="text-sm font-medium text-muted-foreground">{t('leave')}</p>
            <p className="mt-1 text-ui leading-snug text-muted-foreground">{t('dernierAdminDepart')}</p>
          </>
        ) : (
          <button
            type="button"
            onClick={g.quitter}
            disabled={g.enCours.retirer || !conversation}
            className="text-sm font-medium text-destructive outline-none hover:underline focus-visible:underline disabled:opacity-60"
          >
            {t('leave')}
          </button>
        )}
      </div>

      <div className="mt-3">
        <AlerteErreurs erreurs={g.erreurs} />
      </div>
    </aside>
  );
}

function NomDuGroupe({
  sujet,
  modifiable,
  enCours,
  onRenommer,
}: {
  readonly sujet: string;
  readonly modifiable: boolean;
  readonly enCours: boolean;
  readonly onRenommer: (sujet: string) => void;
}) {
  const t = useTranslations('messaging.group.info');
  const [saisie, setSaisie] = useState(sujet);

  if (!modifiable) {
    return (
      <p className="mt-2 flex min-h-11 items-center rounded-lg border border-border bg-card px-3 text-corps font-medium">
        <span className="min-w-0 flex-1 truncate">{sujet}</span>
      </p>
    );
  }

  return (
    <form
      className="mt-2 flex min-h-11 items-center gap-1 rounded-lg border border-border bg-card pr-1 pl-3 focus-within:ring-3 focus-within:ring-ring"
      onSubmit={(e) => {
        e.preventDefault();
        if (saisie.trim() !== sujet) onRenommer(saisie);
      }}
    >
      <label htmlFor="infos-nom-du-groupe" className="sr-only">
        {t('renameLabel')}
      </label>
      {/* La primitive, nue dans la boîte (TCK-2460) : la boîte porte le filet et l'anneau. */}
      <Input
        id="infos-nom-du-groupe"
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        maxLength={120}
        className="min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 font-medium focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label={t('renommerAria')}
        disabled={enCours || saisie.trim().length === 0 || saisie.trim() === sujet}
        className="flex-none text-muted-foreground"
      >
        {enCours ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Pencil className="size-4" aria-hidden />}
      </Button>
    </form>
  );
}

function ObjetsLies({ contexte }: { readonly contexte: ConversationContext }) {
  const t = useTranslations('messaging.group.info');
  const format = useFormatter();
  const { maintenance: intervention, lease: bail, property: bien } = contexte;
  if (!intervention && !bail && !bien) return null;

  return (
    <div className="mt-3 divide-y divide-border/70 rounded-xl border border-border bg-card px-3.5 text-ui" data-testid="objets-du-groupe">
      {intervention ? (
        <Link
          href={`/app/maintenance/${intervention.id}`}
          className="flex items-center gap-2.5 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Wrench className="size-4 flex-none text-muted-foreground stroke-[1.75]" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {intervention.scheduled_at
              ? t('interventionPlanifiee', {
                  date: format.dateTime(new Date(intervention.scheduled_at), { weekday: 'short', day: 'numeric', month: 'short' }),
                })
              : (intervention.title ?? t('intervention'))}
          </span>
          <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}
      {bail ? (
        <Link href={`/app/leases/${bail.id}`} className="flex items-center gap-2.5 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring">
          <FileText className="size-4 flex-none text-muted-foreground stroke-[1.75]" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{t('bail', { reference: bail.reference ?? `#${bail.id}` })}</span>
          <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}
      {bien ? (
        <Link href={`/properties/${bien.slug}`} className="flex items-center gap-2.5 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring">
          <span className="relative size-5 flex-none overflow-hidden rounded bg-muted">
            {bien.cover_url ? (
              <Image src={bien.cover_url} alt="" fill sizes="20px" className="object-cover" />
            ) : (
              <Building2 className="absolute inset-0 m-auto size-3.5 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">{bien.title}</span>
          <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/** La ligne de rôle : « Vous », la relation au contexte (servie par l'API), « admin du groupe ». */
function useLigneDeRole(soi: boolean, relation: RelationAuFil | null, admin: boolean): string | null {
  const t = useTranslations('messaging.group.info');
  const morceaux: string[] = [];
  if (soi) morceaux.push(t('vous'));
  else if (relation && t.has(`relation.${relation.relation}`)) {
    const categorie = relation.category && t.has(`categorie.${relation.category}`) ? t(`categorie.${relation.category}`) : null;
    morceaux.push(categorie ? `${t(`relation.${relation.relation}`)} · ${categorie}` : t(`relation.${relation.relation}`));
  }
  if (admin) morceaux.push(t('adminDuGroupe'));
  return morceaux.length > 0 ? morceaux.join(' · ') : null;
}

function LigneDeParticipant({
  participant,
  soi,
  relation,
  gerable,
  occupe,
  onPromouvoir,
  onRetrograder,
  onRetirer,
}: {
  readonly participant: ConversationParticipant;
  readonly soi: boolean;
  readonly relation: RelationAuFil | null;
  readonly gerable: boolean;
  readonly occupe: boolean;
  readonly onPromouvoir: () => void;
  readonly onRetrograder: () => void;
  readonly onRetirer: () => void;
}) {
  const t = useTranslations('messaging.group.info');
  // TCK-2132 (P220.01) — `||` et non `??` : un compte créé par téléphone a `full_name: ''`.
  const nom = participant.user?.full_name || `#${participant.user_id}`;
  const role = useLigneDeRole(soi, relation, participant.role === 'admin');

  return (
    <li className="flex items-center gap-2.5 py-2.5" data-testid={`participant-${participant.user_id}`}>
      <Avatar size="32">
        {participant.user?.avatar_url ? <AvatarImage src={participant.user.avatar_url} alt="" /> : null}
        <AvatarFallback aria-hidden="true">{participant.user?.full_name ? initiales(participant.user.full_name) : '?'}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium">{nom}</span>
        {role ? <span className="block truncate text-xs text-muted-foreground">{role}</span> : null}
      </span>
      {gerable ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t('gerer', { nom })}
            disabled={occupe}
            className="inline-flex size-8 flex-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {participant.role === 'member' ? (
              <DropdownMenuItem onClick={onPromouvoir}>{t('promote')}</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onRetrograder}>{t('demote')}</DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={onRetirer}>
              {t('remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}
