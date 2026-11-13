'use client';

import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BellOff, Bell, Building2, ChevronRight, Info, MoreHorizontal, PanelRightClose, PanelRightOpen, Phone, Users, Wrench } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { BoutonFlecheDeRetour } from '@/components/navigation-publique/FlecheDeRetour';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import { useConversationContext, useToggleMute } from '@/lib/queries/conversations';
import { initiales } from '@/lib/fiche-publique';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/message';
import { autreParticipant, titreDeConversation } from './ConversationList';
import { useGesteDuClient } from './useGesteDuClient';

/**
 * L'identifiant de la colonne de contexte du bureau, que le bouton de l'en-tête désigne
 * (`aria-controls`). Déclaré ICI et non dans `ColonneDeContexte` : le widget flottant importe cet
 * en-tête, et le graphe d'imports déciderait sinon des dictionnaires de toute la coque (bien,
 * bail, intervention, pipeline), que seule la page lit.
 */
export const ID_COLONNE_DE_CONTEXTE = 'messagerie-contexte';

/** Sous `lg`, la messagerie est une seule colonne : l'en-tête du fil est celui du téléphone. */
const SOUS_LG_PX = 1023;

interface EnTeteDuFilProps {
  readonly conversationId: number;
  readonly conversation: Conversation | undefined;
  readonly onBack?: () => void;
  readonly sourdine: boolean;
  /** Les infos d'un groupe (`ConversationInfoSheet`) : renommer, participants, quitter. */
  readonly onInfosDuGroupe: () => void;
  /** La colonne de contexte du bureau (dès `xl`) : son état, et le bouton qui la replie. */
  readonly contexte?: { readonly ouvert: boolean; readonly onBasculer: () => void };
  /** Au téléphone, pour un fil direct : « ⋯ » ouvre la feuille du fil que la page rend (maquette a/2). */
  readonly onPlusDActions?: () => void;
}

/**
 * TCK-2632 — l'en-tête du fil « la personne d'abord » (maquette `app-messagerie`, `EnTeteFil` et
 * `TeteFilBureau`) : la flèche de retour, l'avatar et le NOM de la personne (ou du groupe), en
 * sous-ligne le bien, en lien vers sa fiche (« Voir le bien », lu par l'assistance) ou le nombre de
 * personnes d'un groupe.
 *
 * **Appel et WhatsApp n'existent que si le contexte du fil rend un téléphone** (TCK-2630) : celui de la
 * fiche du client, que l'API ne rend qu'au personnel de l'agence du fil qui peut la lire. Un client
 * ne voit donc jamais de bouton d'appel, et jamais le numéro personnel d'un agent par ce biais.
 * Au téléphone, « 📞 » ouvre une feuille (appeler ou écrire sur WhatsApp) ; au bureau, « Appeler » et
 * l'icône WhatsApp. Chacun CONSIGNE le geste de contact de la fiche (famille 5, TCK-2583) en même
 * temps qu'il ouvre l'application : il compte pour le délai de première réponse.
 *
 * Le widget flottant garde son propre en-tête (`ChatView`, variante `widget`).
 *
 * « ⋯ » : au téléphone, pour un fil direct, la feuille du fil que la page rend (`onPlusDActions`) ;
 * sinon le menu — la sourdine, et pour un groupe ses infos (renommer, participants, quitter). Les autres gestes du menu de la maquette
 * (« Marquer comme non lue », « Signaler la conversation ») n'ont pas de route : non rendus.
 */
export function EnTeteDuFil({
  conversationId,
  conversation,
  onBack,
  sourdine,
  onInfosDuGroupe,
  contexte,
  onPlusDActions,
}: EnTeteDuFilProps) {
  const t = useTranslations('messaging');
  const tWidget = useTranslations('messaging.widget');
  const { user } = useAuth();
  const compact = useMatchesMaxWidth(SOUS_LG_PX);
  const [feuilleOuverte, setFeuilleOuverte] = useState(false);
  const { data: contexteData } = useConversationContext(conversationId);
  // Réserve de TCK-2632 : un second appui pendant que le geste est en cours est ignoré.
  const { consigner: envoyer, enCours } = useGesteDuClient(contexteData?.data?.customer?.id ?? null);
  const basculerSourdine = useToggleMute(conversationId);
  const messageErreur = useMessageErreurApi();
  /**
   * L'échec d'un geste de l'en-tête, dit sous lui (P228.06 : aucune mutation muette). Le geste de
   * contact échoue après que l'appel ou WhatsApp s'est ouvert : la phrase dit que la FICHE n'en garde
   * pas trace, pas que l'appel a échoué.
   */
  const [erreur, setErreur] = useState<string | null>(null);

  const isGroup = conversation?.type === 'group';
  const intervention = conversation?.maintenance_request_id != null;
  const autre = conversation && !isGroup ? autreParticipant(conversation, user?.id) : null;
  const titre = conversation
    ? titreDeConversation(conversation, user?.id, t('conversationTitleFallback', { id: String(conversationId) }))
    : t('conversationTitleFallback', { id: String(conversationId) });
  const client = contexteData?.data?.customer ?? null;
  const telephone = client && isReachable(client.phone) ? client.phone : null;
  const consigner = (event: MouseEvent<HTMLElement>, channel: 'call' | 'whatsapp') => {
    if (!client) return false;
    return envoyer(event, { id: client.id, channel }, { onDepart: () => setErreur(null), onError: () => setErreur(t('chat.gesteNonConsigne')) });
  };
  const membres = (conversation?.participants ?? []).filter((p) => !p.left_at).length;
  const archivee = Boolean(conversation?.participants?.find((p) => p.user_id === user?.id && !p.left_at)?.archived_at);
  const taille = compact ? 36 : 40;

  return (
    <>
      <header
        data-slot="en-tete-du-fil"
        className={cn(
          'flex flex-none items-center border-b border-border/70 bg-background',
          compact ? 'h-14 pr-1 pl-1' : 'h-16 gap-3 px-5',
        )}
      >
        {onBack ? (
          // TCK-2617 — la flèche unique (`BoutonFlecheDeRetour`) : 20 px dans 44, à toute largeur.
          <BoutonFlecheDeRetour libelle={tWidget('chatBack')} onClick={onBack} data-testid="chat-back-button" />
        ) : null}
        {isGroup ? (
          <span
            className={cn(
              'inline-flex flex-none items-center justify-center rounded-full bg-fond-avatar text-accent',
              compact ? 'size-avatar-36' : 'size-avatar-40',
            )}
          >
            {intervention ? <Wrench className="size-5 stroke-[1.75]" aria-hidden /> : <Users className="size-5 stroke-[1.75]" aria-hidden />}
          </span>
        ) : autre ? (
          <Avatar size={String(taille) as '36' | '40'}>
            {autre.avatar_url ? <AvatarImage src={autre.avatar_url} alt="" /> : null}
            <AvatarFallback>{autre.full_name ? initiales(autre.full_name) : null}</AvatarFallback>
          </Avatar>
        ) : (
          <span className={cn('inline-flex flex-none items-center justify-center rounded-full bg-muted text-muted-foreground', compact ? 'size-avatar-36' : 'size-avatar-40')}>
            <Building2 className="size-5" aria-hidden />
          </span>
        )}
        <div className={cn('min-w-0 flex-1 leading-tight', compact && 'ml-2.5')}>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-base font-semibold text-foreground">{titre}</h2>
            {archivee ? (
              // TCK-2632 (décision b) — un fil archivé rouvert depuis « Nouvelle conversation » : on le
              // dit, au lieu d'en ouvrir un second. Le premier message envoyé le désarchive.
              <span
                data-testid="fil-archive"
                className="flex-none rounded-full bg-muted px-2 py-0.5 text-legende font-medium text-encre-douce"
              >
                {t('chat.archivee')}
              </span>
            ) : null}
          </div>
          {isGroup ? (
            // TCK-2632 (maquette a/5) — la sous-ligne d'un groupe mène à ses infos, comme celle d'un
            // fil direct mène au bien : « 4 personnes › ».
            <button
              type="button"
              onClick={onInfosDuGroupe}
              className={cn(
                '-my-1 flex max-w-full items-center gap-0.5 py-1 tabular-nums text-muted-foreground outline-none hover:text-foreground focus-visible:underline',
                compact ? 'text-xs' : 'text-ui',
              )}
            >
              <span className="sr-only">{t('chat.groupInfoAria')} : </span>
              <span className="truncate">{t('list.personnes', { n: membres })}</span>
              <ChevronRight className="size-3.5 flex-none" aria-hidden="true" />
              {sourdine ? <BellOff className="ml-1 size-3.5 flex-none" role="img" aria-label={t('list.muted')} /> : null}
            </button>
          ) : conversation?.property ? (
            <Link
              href={`/properties/${conversation.property.slug}`}
              className={cn(
                // `-my-1 py-1` : une cible de 24 px (WCAG 2.5.8) sans déplacer la ligne.
                '-my-1 flex max-w-full items-center gap-0.5 py-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline',
                compact ? 'text-xs' : 'text-ui',
              )}
            >
              <span className="sr-only">{t('chat.viewProperty')} : </span>
              <span className="truncate">{conversation.property.title}</span>
              <ChevronRight className="size-3.5 flex-none" aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {telephone ? (
          compact ? (
            <>
              <button
                type="button"
                onClick={() => setFeuilleOuverte(true)}
                aria-label={t('chat.joindre', { nom: titre })}
                data-testid="joindre-le-client"
                className="inline-flex size-11 flex-none items-center justify-center rounded-full text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
              >
                <Phone className="size-5 stroke-[1.75]" aria-hidden="true" />
              </button>
              <FeuilleDuBas open={feuilleOuverte} onOpenChange={setFeuilleOuverte} titre={t('chat.joindre', { nom: titre })}>
                <div className="divide-y divide-border/70">
                  <a
                    href={telHref(telephone)}
                    aria-disabled={enCours || undefined}
                    onClick={(e) => {
                      if (consigner(e, 'call')) setFeuilleOuverte(false);
                    }}
                    className="flex min-h-12 items-center gap-3 py-2 text-corps outline-none focus-visible:ring-3 focus-visible:ring-ring aria-disabled:opacity-60"
                  >
                    <Phone className="size-5 flex-none text-muted-foreground stroke-[1.75]" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t('chat.appeler')}</span>
                      <span className="block text-ui tabular-nums text-muted-foreground">{telephone}</span>
                    </span>
                    <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
                  </a>
                  <a
                    href={whatsappHref(telephone, '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={enCours || undefined}
                    onClick={(e) => {
                      if (consigner(e, 'whatsapp')) setFeuilleOuverte(false);
                    }}
                    className="flex min-h-12 items-center gap-3 py-2 text-corps outline-none focus-visible:ring-3 focus-visible:ring-ring aria-disabled:opacity-60"
                  >
                    <IconeWhatsApp className="size-5 flex-none" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t('chat.whatsapp')}</span>
                      <span className="block text-ui tabular-nums text-muted-foreground">{telephone}</span>
                    </span>
                    <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
                  </a>
                </div>
              </FeuilleDuBas>
            </>
          ) : (
            <div className="flex flex-none items-center gap-2">
              <a
                href={telHref(telephone)}
                aria-disabled={enCours || undefined}
                onClick={(e) => consigner(e, 'call')}
                aria-label={t('chat.appelerNom', { nom: titre })}
                data-testid="appeler-le-client"
                // Maquette a/2 : le bouton « contour » de taille courante (36 px, 32,4 au bureau).
                className={cn(buttonVariants({ variant: 'outline' }), 'aria-disabled:opacity-60')}
              >
                <Phone className="size-4 stroke-[1.75]" aria-hidden="true" />
                {t('chat.appeler')}
              </a>
              <a
                href={whatsappHref(telephone, '')}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={enCours || undefined}
                onClick={(e) => consigner(e, 'whatsapp')}
                aria-label={t('chat.whatsapp')}
                className="inline-flex size-9 flex-none items-center justify-center rounded-lg border border-border bg-card text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring aria-disabled:opacity-60"
              >
                <IconeWhatsApp className="size-4.5" />
              </a>
            </div>
          )
        ) : null}

        {compact && !isGroup && onPlusDActions ? (
          <button
            type="button"
            onClick={onPlusDActions}
            aria-label={t('chat.plusDActions')}
            aria-haspopup="dialog"
            data-testid="plus-d-actions"
            className="inline-flex size-11 flex-none items-center justify-center rounded-full text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </button>
        ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t('chat.plusDActions')}
            data-testid="plus-d-actions"
            className={cn(
              'inline-flex flex-none items-center justify-center text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring',
              compact ? 'size-11 rounded-full' : 'size-9 rounded-lg border border-border bg-card',
            )}
          >
            <MoreHorizontal className={compact ? 'size-5' : 'size-4.5'} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {isGroup ? (
              <DropdownMenuItem onClick={onInfosDuGroupe} data-testid="group-info-button">
                <Info className="size-4 text-muted-foreground stroke-[1.75]" aria-hidden="true" />
                {t('chat.groupInfoAria')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onClick={() => {
                setErreur(null);
                basculerSourdine.mutate(
                  { is_muted: !sourdine },
                  { onError: (err) => setErreur(messageErreur(err, t('chat.sourdineEchouee'))) },
                );
              }}
            >
              {sourdine ? (
                <Bell className="size-4 text-muted-foreground stroke-[1.75]" aria-hidden="true" />
              ) : (
                <BellOff className="size-4 text-muted-foreground stroke-[1.75]" aria-hidden="true" />
              )}
              {sourdine ? t('group.info.unmute') : t('group.info.mute')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
        {contexte && !compact ? (
          <button
            type="button"
            onClick={contexte.onBasculer}
            aria-label={contexte.ouvert ? t('contexte.replier') : t('contexte.afficher')}
            aria-expanded={contexte.ouvert}
            aria-controls={ID_COLONNE_DE_CONTEXTE}
            data-testid="basculer-le-contexte"
            className="hidden size-9 flex-none items-center justify-center rounded-lg border border-border bg-card text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring xl:inline-flex"
          >
            {contexte.ouvert ? (
              <PanelRightClose className="size-4.5 stroke-[1.75]" aria-hidden="true" />
            ) : (
              <PanelRightOpen className="size-4.5 stroke-[1.75]" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </header>
      {erreur ? (
        <p
          role="alert"
          data-testid="erreur-de-l-en-tete"
          className="flex-none border-b border-border/70 bg-background px-4 py-2 text-ui text-destructive"
        >
          {erreur}
        </p>
      ) : null}
    </>
  );
}
