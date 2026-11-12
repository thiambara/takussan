'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, Loader2, Search, Users, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { initiales } from '@/lib/fiche-publique';
import { messageErreurApi } from '@/lib/api';
import { useMessagingContacts, useTrouverLeFilDirect, type MessagingContact } from '@/lib/queries/conversations';
import { PARTICIPANT_SEARCH_DEBOUNCE_MS } from './ParticipantPicker';

interface NouvelleConversationProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Un fil existe déjà avec cette personne : on l'ouvre (AC4, aucun `POST`). */
  readonly onOuvrir: (conversationId: number) => void;
  /** Aucun fil : un brouillon, créé au premier envoi. */
  readonly onBrouillon: (personne: MessagingContact) => void;
  /** « Nouveau groupe », là où l'espace le propose (`usePeutProposerUnGroupe`) ; absent sinon. */
  readonly onNouveauGroupe?: () => void;
}

/**
 * TCK-2632 — « Nouvelle conversation » (maquette `app-messagerie`, écran « Nouvelle conversation ») :
 * plein écran au téléphone, dialogue au bureau. Une recherche par nom, « Nouveau groupe », puis les
 * personnes joignables (`GET /api/conversations/contacts`, périmètre de TCK-565).
 *
 * Toucher une personne cherche d'abord son fil à deux (`useTrouverLeFilDirect`) : il s'ouvre s'il
 * existe, sinon un brouillon. Si la recherche échoue, on le DIT au lieu d'ouvrir un brouillon : un
 * brouillon envoyé créerait un second fil avec la même personne.
 *
 * Écarts assumés avec la maquette : les personnes ne sont pas rangées en « Clients récents ·
 * Équipe · Propriétaires » (l'API des contacts ne rend que le nom et l'avatar, ni le rôle ni le
 * bien) ; le groupe s'ouvre dans son propre dialogue au lieu d'un interrupteur dans celui-ci ; la
 * recherche ne porte que sur le nom (« un numéro » n'est pas cherché par l'API).
 */
export function NouvelleConversation({ open, onClose, onOuvrir, onBrouillon, onNouveauGroupe }: NouvelleConversationProps) {
  const t = useTranslations('messaging.nouvelle');
  const tGroupe = useTranslations('messaging.group.create');
  const tRacine = useTranslations();
  const [saisie, setSaisie] = useState('');
  const recherche = useDebouncedValue(saisie, PARTICIPANT_SEARCH_DEBOUNCE_MS);
  const contacts = useMessagingContacts(recherche, { enabled: open });
  const trouver = useTrouverLeFilDirect();
  const [enCours, setEnCours] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const personnes = contacts.data?.data ?? [];
  const total = contacts.data?.meta.total ?? 0;

  function fermer() {
    setSaisie('');
    setErreur(null);
    setEnCours(null);
    onClose();
  }

  async function choisir(personne: MessagingContact) {
    if (enCours !== null) return;
    setEnCours(personne.id);
    setErreur(null);
    try {
      const id = await trouver(personne);
      fermer();
      if (id !== null) onOuvrir(id);
      else onBrouillon(personne);
    } catch (err) {
      setErreur(messageErreurApi(err, tRacine, t('rechercheEchouee')));
      setEnCours(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : fermer())}>
      <DialogContent
        data-testid="nouvelle-conversation"
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden p-0 max-lg:inset-0 max-lg:h-dvh max-lg:max-h-none max-lg:w-full max-lg:max-w-none max-lg:translate-none max-lg:rounded-none lg:max-h-[min(40rem,calc(100dvh-var(--spacing)*16))] lg:max-w-[32.5rem]"
      >
        {/*
          TCK-2632 — maquette `app-messagerie` a/3 : au téléphone, l'en-tête d'un écran plein (« ✕ »
          à gauche, puis le titre, comme `EnTeteMobile` en plein écran) ; au bureau, le titre puis
          « ✕ » à droite, comme tout dialogue.
        */}
        <div className="flex h-14 flex-none items-center gap-1 border-b border-border/70 bg-background px-1 lg:gap-0 lg:border-border lg:bg-transparent lg:pr-2 lg:pl-5">
          <DialogClose
            aria-label={tRacine('common.actions.close')}
            className="inline-flex size-11 flex-none items-center justify-center rounded-full text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring lg:order-last lg:size-9 lg:rounded-lg"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogClose>
          <DialogTitle className="min-w-0 flex-1 truncate font-sans text-base leading-tight font-semibold lg:text-titre-court">{t('titre')}</DialogTitle>
        </div>
        <label className="flex min-h-12 flex-none items-center gap-2 border-b border-border px-4 text-corps">
          <Search className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{t('rechercheLabel')}</span>
          {/* La primitive, nue dans la rangée (TCK-2460) : la rangée de 48 px porte le filet. */}
          <Input
            type="search"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder={tGroupe('participantInputPlaceholder')}
            className="min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 focus-visible:ring-0 dark:bg-transparent"
          />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {onNouveauGroupe ? (
            <button
              type="button"
              onClick={() => {
                fermer();
                onNouveauGroupe();
              }}
              className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
            >
              <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-fond-avatar text-accent">
                <Users className="size-5 stroke-[1.75]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-corps font-medium">{t('nouveauGroupe')}</span>
                <span className="block text-ui text-muted-foreground">{t('nouveauGroupeAide')}</span>
              </span>
              <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
            </button>
          ) : null}
          {erreur ? (
            <p role="alert" className="px-4 pt-3 text-ui text-destructive">
              {erreur}
            </p>
          ) : null}
          <h3 className="px-4 pt-4 pb-1 text-xs font-medium text-muted-foreground">{t('personnes')}</h3>
          {contacts.isLoading ? (
            <p role="status" className="px-4 py-3 text-ui text-muted-foreground">
              {tGroupe('searching')}
            </p>
          ) : contacts.isError ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <p className="text-ui text-destructive">{tGroupe('contactsError')}</p>
              <button type="button" onClick={() => void contacts.refetch()} className="text-ui font-medium underline underline-offset-2">
                {tGroupe('retry')}
              </button>
            </div>
          ) : personnes.length === 0 ? (
            <p className="px-4 py-3 text-ui text-muted-foreground">
              {recherche.trim() ? tGroupe('noContact') : tGroupe('noContactYet')}
            </p>
          ) : (
            <ul>
              {personnes.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => void choisir(p)}
                    aria-busy={enCours === p.id || undefined}
                    disabled={enCours !== null && enCours !== p.id}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-1.5 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60 disabled:opacity-60"
                  >
                    <Avatar size="40">
                      {p.avatar_url ? <AvatarImage src={p.avatar_url} alt="" /> : null}
                      {/* Les initiales doublent le nom : la rangée se nomme par le nom seul. */}
                      <AvatarFallback aria-hidden="true">{initiales(p.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-corps font-medium">{p.name}</span>
                    {enCours === p.id ? <Loader2 className="size-4 flex-none animate-spin text-muted-foreground" aria-hidden="true" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!contacts.isError && total > personnes.length ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">{tGroupe('moreResults', { shown: personnes.length, total })}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
