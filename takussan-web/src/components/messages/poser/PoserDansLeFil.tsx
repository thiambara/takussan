'use client';

import { useId, useState, type ReactNode } from 'react';
import { CalendarClock, House } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { useApiMutation } from '@/hooks/useApiQuery';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { cheminApi } from '@/lib/chemin-api';
import { lireLesCreneaux } from '@/lib/maintenance/mes-demandes';
import { useConversationContext } from '@/lib/queries/conversations';
import { messagesInfiniteQueryKey, nouveauxMessagesQueryKey } from '@/lib/queries/conversations-cles';
import type { ApiResponse } from '@/types/api';

import { GroupPropertyPicker, type GroupContextOption } from '../GroupContextPicker';

/** Les seuls types qu'un participant pose (`SujetsDuFil::typesPosables()`, API). */
export type TypePosable = 'property' | 'property_visit';

/**
 * TCK-2964 (ADR-0128 § 4) — poser un objet : `POST /api/conversations/{id}/cards` avec POUR SEUL CORPS
 * `{object: {type, id}}`. Le serveur pose le code, `data` et le contenu ; le fil se relit au succès.
 * Idempotent (la route porte `idempotent`) : un double envoi ne pose pas deux cartes.
 */
export function usePoserUneCarte(conversationId: number) {
  return useApiMutation<unknown, { readonly type: TypePosable; readonly id: number }>(
    {
      path: () => cheminApi`/api/conversations/${conversationId}/cards`,
      method: 'POST',
      body: ({ type, id }) => ({ object: { type, id } }),
    },
    { idempotence: true, invalidate: [messagesInfiniteQueryKey(conversationId), nouveauxMessagesQueryKey(conversationId)] },
  );
}

interface PoserDansLeFilOptions {
  readonly conversationId: number;
  /** Le personnel de l'agence, dans le fil d'un client (pas un groupe, pas une salle). */
  readonly actif: boolean;
}

/**
 * TCK-2964 — les deux entrées du composeur, « Partager un bien » et « Proposer un créneau de visite ».
 *
 * `entrees` : les éléments du menu du trombone (`BoutonDePieceJointe`, prop `entrees`), `null` hors du
 * personnel. `feuilles` : les deux feuilles qu'elles ouvrent, à monter HORS du menu (qui se démonte à la
 * fermeture) — dans le `dessus` du composeur. Aucune feuille ne porte de `<form>` : montée dans le
 * composeur, un `submit` remonterait par l'arbre React jusqu'au formulaire du message.
 */
export function usePoserDansLeFil({ conversationId, actif }: PoserDansLeFilOptions): { readonly entrees: ReactNode; readonly feuilles: ReactNode } {
  const t = useTranslations('messaging.poser');
  const [ouverte, setOuverte] = useState<'bien' | 'creneau' | null>(null);
  // Une feuille n'est montée qu'à sa première ouverture, puis le reste (son animation de fermeture) :
  // ses requêtes ne partent pas pour un fil où personne ne l'ouvre, et le composeur se rend sans client
  // React Query tant qu'aucune n'a été ouverte.
  const [montees, setMontees] = useState<{ readonly bien: boolean; readonly creneau: boolean }>({ bien: false, creneau: false });

  if (!actif) return { entrees: null, feuilles: null };

  const ouvrir = (quoi: 'bien' | 'creneau') => {
    setMontees((m) => (m[quoi] ? m : { ...m, [quoi]: true }));
    setOuverte(quoi);
  };
  const changer = (quoi: 'bien' | 'creneau') => (o: boolean) => setOuverte(o ? quoi : null);
  return {
    entrees: (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => ouvrir('bien')} data-testid="poser-un-bien">
          <House className="size-4 text-muted-foreground stroke-[1.75]" aria-hidden="true" />
          {t('partagerUnBien')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ouvrir('creneau')} data-testid="poser-un-creneau">
          <CalendarClock className="size-4 text-muted-foreground stroke-[1.75]" aria-hidden="true" />
          {t('proposerUnCreneau')}
        </DropdownMenuItem>
      </>
    ),
    feuilles: (
      <>
        {montees.bien ? <PartagerUnBien conversationId={conversationId} open={ouverte === 'bien'} onOpenChange={changer('bien')} /> : null}
        {montees.creneau ? (
          <ProposerUnCreneau conversationId={conversationId} open={ouverte === 'creneau'} onOpenChange={changer('creneau')} />
        ) : null}
      </>
    ),
  };
}

interface FeuilleProps {
  readonly conversationId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** « Partager un bien » : un bien de son portefeuille (`GET /api/conversations/context/properties`), posé en carte. */
export function PartagerUnBien({ conversationId, open, onOpenChange }: FeuilleProps) {
  const t = useTranslations('messaging.poser');
  const messageErreur = useMessageErreurApi();
  const poser = usePoserUneCarte(conversationId);
  const [bien, setBien] = useState<GroupContextOption | null>(null);
  const idChamp = useId();

  const fermer = (o: boolean) => {
    if (!o) {
      setBien(null);
      poser.reset();
    }
    onOpenChange(o);
  };
  const envoyer = () => {
    if (!bien || poser.isPending) return;
    poser.mutate({ type: 'property', id: bien.id }, { onSuccess: () => fermer(false) });
  };

  return (
    <FeuilleDuBas
      open={open}
      onOpenChange={fermer}
      titre={t('partagerUnBien')}
      pied={
        <Button type="button" size="lg" className="w-full" disabled={!bien || poser.isPending} aria-busy={poser.isPending || undefined} onClick={envoyer}>
          {t('bien.envoyer')}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{t('bien.texte')}</p>
        <label htmlFor={idChamp} className="block text-sm font-medium">
          {t('bien.champ')}
        </label>
        <GroupPropertyPicker inputId={idChamp} value={bien} onChange={setBien} />
        {poser.error ? (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(poser.error, t('echec'))}
          </p>
        ) : null}
      </div>
    </FeuilleDuBas>
  );
}

/** Ce que la création rend et que la feuille relit : la visite, sa fiche et son statut. */
type VisiteCreee = { readonly id: number; readonly status?: string | null; readonly customer_id?: number | null };

/**
 * « Proposer un créneau de visite » : la visite est d'abord créée par SA route (`POST /api/property-visits`,
 * pour la fiche du client, que seul le personnel lit dans `…/context`), puis sa carte est posée. La visite
 * créée par l'agence naît confirmée (son SMS part) : le client la déplace depuis la carte s'il le faut.
 *
 * Si la carte échoue après la visite, la visite n'est JAMAIS recréée : la feuille garde son identifiant et
 * ne rejoue que la pose.
 */
export function ProposerUnCreneau({ conversationId, open, onOpenChange }: FeuilleProps) {
  const t = useTranslations('messaging.poser');
  const messageErreur = useMessageErreurApi();
  const contexte = useConversationContext(conversationId, { enabled: open });
  const ficheId = contexte.data?.data.customer?.id ?? null;
  const sansFiche = contexte.isSuccess && ficheId === null;
  const [bien, setBien] = useState<GroupContextOption | null>(null);
  const [moment, setMoment] = useState('');
  const [visite, setVisite] = useState<VisiteCreee | null>(null);
  const [horsAgence, setHorsAgence] = useState(false);
  const idBien = useId();
  const idMoment = useId();

  const creer = useApiMutation<ApiResponse<VisiteCreee>, { readonly property_id: number; readonly customer_id: number; readonly scheduled_at: string }>(
    { path: '/api/property-visits', method: 'POST' },
    { invalidate: [['visits', 'list']] },
  );
  const poser = usePoserUneCarte(conversationId);

  const { instants, passes } = lireLesCreneaux([moment], new Date());
  const enCours = creer.isPending || poser.isPending;
  const pret = visite !== null || (!horsAgence && bien !== null && ficheId !== null && instants.length === 1 && passes === 0);

  const fermer = (o: boolean) => {
    if (!o) {
      setBien(null);
      setMoment('');
      setVisite(null);
      setHorsAgence(false);
      creer.reset();
      poser.reset();
    }
    onOpenChange(o);
  };
  const poserLaCarte = (id: number) =>
    poser.mutate({ type: 'property_visit', id }, { onSuccess: () => fermer(false) });
  const envoyer = () => {
    if (!pret || enCours) return;
    if (visite !== null) {
      poserLaCarte(visite.id);
      return;
    }
    creer.mutate(
      { property_id: bien!.id, customer_id: ficheId!, scheduled_at: instants[0]! },
      {
        onSuccess: (reponse) => {
          // L'API ne planifie pour la fiche que sur un bien de l'agence ; ailleurs, elle réserve au nom de
          // l'agent (`StorePropertyVisitRequest::managesProperty`). Une telle visite n'est pas posée.
          if (reponse.data.status !== 'confirmed' || reponse.data.customer_id !== ficheId) {
            setHorsAgence(true);
            return;
          }
          setVisite({ id: reponse.data.id });
          poserLaCarte(reponse.data.id);
        },
      },
    );
  };
  const erreur = poser.error ?? creer.error;

  return (
    <FeuilleDuBas
      open={open}
      onOpenChange={fermer}
      titre={t('proposerUnCreneau')}
      pied={
        <Button type="button" size="lg" className="w-full" disabled={!pret || enCours} aria-busy={enCours || undefined} onClick={envoyer}>
          {visite !== null ? t('creneau.reposer') : t('creneau.envoyer')}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{t('creneau.texte')}</p>
        {sansFiche ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('creneau.sansFiche')}
          </p>
        ) : null}
        {visite === null ? (
          <>
            <label htmlFor={idBien} className="block text-sm font-medium">
              {t('bien.champ')}
            </label>
            <GroupPropertyPicker
              inputId={idBien}
              value={bien}
              onChange={(b) => {
                setBien(b);
                setHorsAgence(false);
              }}
            />
            <label htmlFor={idMoment} className="block text-sm font-medium">
              {t('creneau.moment')}
            </label>
            <DateTimePicker id={idMoment} value={moment} onValueChange={setMoment} />
            {passes > 0 ? (
              <p role="alert" className="text-xs text-destructive">
                {t('creneau.passe')}
              </p>
            ) : null}
          </>
        ) : (
          <p role="status" className="text-sm text-foreground">
            {t('creneau.visiteCreee')}
          </p>
        )}
        {horsAgence ? (
          <p role="alert" className="text-xs text-destructive">
            {t('creneau.horsAgence')}
          </p>
        ) : null}
        {erreur ? (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(erreur, t('echec'))}
          </p>
        ) : null}
      </div>
    </FeuilleDuBas>
  );
}
