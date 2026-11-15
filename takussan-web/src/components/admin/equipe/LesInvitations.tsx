'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, Mail, RefreshCw } from 'lucide-react';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { Pagination } from '@/components/console/Pagination';
import { ErrorState } from '@/components/feedback';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { formaterTelephone } from '@/lib/phone';
import {
  agencyInvitationKeys,
  fetchPendingAgencyInvitations,
  purgeExpiredAgencyInvitations,
  resendInvitation,
  revokeInvitation,
  type PendingAgencyInvitation,
} from '@/lib/queries/agency-invitations';
import { cn } from '@/lib/utils';

import { FormulaireDInvitation } from './FormulaireDInvitation';

/**
 * TCK-2668 — l'écran des invitations de l'Équipe (maquette `app-equipe`, a, « Inviter et
 * invitations ») : « En cours · N » (destinataire, rôle en clair, envoyée le, expire le, « Relancer »,
 * « Annuler »), « Expirées · N » repliées avec « Tout effacer », et « Inviter un membre ». Au bureau,
 * les listes à gauche et le formulaire à droite dès `xl` (dessous en deçà : la maquette le dit pour
 * 1024) ; au téléphone, le formulaire en tête et son envoi dans la barre du bas.
 *
 * Remplace `PendingInvitationsSection` (TCK-368) et en garde les gestes : relancer (sans
 * confirmation : un doublon dans une boîte de réception se défait), annuler (confirmé : le lien parti
 * cesse de fonctionner), la pagination, la double authentification. Une invitation expirée se
 * relance encore depuis sa ligne — l'API la ressuscite au lieu d'en créer une voisine.
 *
 * Les invitations de locataires n'y sont plus (`ROLES_D_EQUIPE`) : elles se suivent sur la fiche du
 * client. Une invitation partie par SMS n'a pas d'adresse : son numéro la nomme.
 */
const PAR_PAGE = 10;
const EXPIREES_REPLIEES = { telephone: 3, bureau: 5 } as const;
const EXPIREES_DEPLIEES = 20;

interface LesInvitationsProps {
  readonly agencyId: number;
  /** `team.invite` (ou admin) : relancer, annuler, effacer. La lecture reste ouverte sans. */
  readonly peutGerer: boolean;
  /** Le formulaire « Inviter un membre » existe. */
  readonly peutInviter: boolean;
  readonly telephone: boolean;
  /** Change à chaque « Inviter un membre » de l'en-tête : le premier champ prend le focus. */
  readonly appelALInvitation?: number;
}

export function LesInvitations({ agencyId, peutGerer, peutInviter, telephone, appelALInvitation = 0 }: LesInvitationsProps) {
  const t = useTranslations('admin.team.equipe.invitations');
  const tI = useTranslations('admin.team.invitations');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const garde = useGardeDoubleFacteur();
  const { jourMois } = useFormatteurs();
  const formulaireId = 'inviter-un-membre';

  const [pageEnCours, setPageEnCours] = useState(1);
  const [deplie, setDeplie] = useState(false);
  const [pageExpirees, setPageExpirees] = useState(1);
  const [aAnnuler, setAAnnuler] = useState<PendingAgencyInvitation | null>(null);
  const [effacer, setEffacer] = useState(false);

  const parPageExpirees = deplie ? EXPIREES_DEPLIEES : telephone ? EXPIREES_REPLIEES.telephone : EXPIREES_REPLIEES.bureau;
  const enCours = useQuery({
    queryKey: agencyInvitationKeys.liste(agencyId, 'sent', pageEnCours, PAR_PAGE),
    queryFn: () => fetchPendingAgencyInvitations(token ?? '', { statut: 'sent', page: pageEnCours, perPage: PAR_PAGE }),
    enabled: Boolean(token),
    staleTime: 15_000,
  });
  const expirees = useQuery({
    queryKey: agencyInvitationKeys.liste(agencyId, 'expired', pageExpirees, parPageExpirees),
    queryFn: () => fetchPendingAgencyInvitations(token ?? '', { statut: 'expired', page: pageExpirees, perPage: parPageExpirees }),
    enabled: Boolean(token),
    staleTime: 15_000,
  });
  const nbEnCours = enCours.data?.meta.total ?? 0;
  const nbExpirees = expirees.data?.meta.total ?? 0;

  useEffect(() => {
    if (appelALInvitation > 0) document.getElementById(`${formulaireId}-first_name`)?.focus();
  }, [appelALInvitation]);

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: agencyInvitationKeys.all });
  const echec = (error: ApiError) => toast.add({ title: tI('toasts.errorTitle'), description: messageErreur(error), type: 'error' });
  const nomme = (i: PendingAgencyInvitation) => i.email ?? (i.phone ? formaterTelephone(i.phone) : '—');
  const role = (r: string) => (tI.has(`roles.${r}`) ? tI(`roles.${r}`) : r);

  const relancer = useMutation<unknown, ApiError, PendingAgencyInvitation>({
    mutationFn: (i) => avecGardeDoubleFacteur(() => resendInvitation(token ?? '', i.id), garde),
    onSuccess: (_d, i) => {
      toast.add({ title: tI('toasts.resendSuccess', { email: nomme(i) }), type: 'success' });
      void rafraichir();
    },
    onError: echec,
  });
  const annuler = useMutation<unknown, ApiError, PendingAgencyInvitation>({
    mutationFn: (i) => avecGardeDoubleFacteur(() => revokeInvitation(token ?? '', i.id), garde),
    onSuccess: (_d, i) => {
      setAAnnuler(null);
      toast.add({ title: tI('toasts.revokeSuccess', { email: nomme(i) }), type: 'success' });
      // La dernière ligne d'une page annulée ne laisse pas l'admin sur une page qui n'existe plus.
      if ((enCours.data?.data.length ?? 0) === 1 && pageEnCours > 1) setPageEnCours(pageEnCours - 1);
      void rafraichir();
    },
    onError: (e) => {
      setAAnnuler(null);
      echec(e);
    },
  });
  const purger = useMutation<number, ApiError, void>({
    mutationFn: () => avecGardeDoubleFacteur(() => purgeExpiredAgencyInvitations(token ?? ''), garde),
    onSuccess: (n) => {
      setEffacer(false);
      setPageExpirees(1);
      setDeplie(false);
      toast.add({ title: t('effacees', { n }), type: 'success' });
      void rafraichir();
    },
    onError: (e) => {
      setEffacer(false);
      echec(e);
    },
  });

  const occupe = (i: PendingAgencyInvitation) =>
    (relancer.isPending && relancer.variables?.id === i.id) || (annuler.isPending && annuler.variables?.id === i.id);

  /* ── Les lignes ──────────────────────────────────────────────────────────────────────────── */

  const ligneEnCours = (i: PendingAgencyInvitation) => (
    <li
      key={i.id}
      data-testid={`invitation-en-cours-${i.id}`}
      className={cn('flex gap-3 border-b border-border/70 px-4 py-3.5 last:border-b-0', telephone ? 'flex-col' : 'items-center')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-muted text-encre-douce">
          <Mail className="size-icone" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-corps font-semibold">{nomme(i)}</p>
          <p className="text-ui text-muted-foreground">
            {[
              role(i.role),
              i.created_at ? t('envoyeeLe', { date: jourMois(i.created_at) }) : null,
              i.expires_at ? t(i.is_expired ? 'expireeLe' : 'expireLe', { date: jourMois(i.expires_at) }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>
      {peutGerer ? (
        <div className="flex flex-none gap-2">
          <Button
            variant="outline"
            size={telephone ? 'lg' : 'sm'}
            className={cn(telephone && 'flex-1')}
            disabled={occupe(i)}
            onClick={() => relancer.mutate(i)}
          >
            {relancer.isPending && relancer.variables?.id === i.id ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            {tI('actions.resend')}
          </Button>
          <Button
            variant="outline"
            size={telephone ? 'lg' : 'sm'}
            className={cn(telephone && 'flex-1')}
            disabled={occupe(i)}
            onClick={() => setAAnnuler(i)}
          >
            {tI('actions.revoke')}
          </Button>
        </div>
      ) : null}
    </li>
  );

  const ligneExpiree = (i: PendingAgencyInvitation) => (
    <li
      key={i.id}
      data-testid={`invitation-expiree-${i.id}`}
      className="flex min-h-12 items-center gap-3 border-b border-border/70 px-4 py-2 text-sm"
    >
      <span className="min-w-0 flex-1 truncate text-encre-douce">{nomme(i)}</span>
      <span className="flex-none text-ui text-muted-foreground">
        {role(i.role)}
        {i.expires_at ? ` · ${t('expireeLe', { date: jourMois(i.expires_at) })}` : null}
      </span>
      {peutGerer ? (
        <button
          type="button"
          onClick={() => relancer.mutate(i)}
          disabled={occupe(i)}
          aria-label={t('relancerLExpiree', { nom: nomme(i) })}
          className="flex-none rounded-sm text-ui font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {tI('actions.resend')}
        </button>
      ) : null}
    </li>
  );

  /* ── Les deux listes ─────────────────────────────────────────────────────────────────────── */

  const effacerToutes =
    peutGerer && nbExpirees > 0 ? (
      <button
        type="button"
        onClick={() => setEffacer(true)}
        className="flex-none rounded-sm text-ui font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t('toutEffacer')}
      </button>
    ) : null;

  const listeEnCours = enCours.isError ? (
    <div className="p-4">
      <ErrorState message={messageErreur(enCours.error, tI('error'))} onRetry={() => void enCours.refetch()} retryLabel={t('reessayer')} />
    </div>
  ) : enCours.isLoading ? (
    <Skeleton className="m-4 h-10" aria-hidden="true" data-testid="invitations-chargement" />
  ) : nbEnCours === 0 ? (
    <p className="px-4 py-3.5 text-ui text-muted-foreground">{t('aucuneEnCours')}</p>
  ) : (
    <>
      <ul>{enCours.data?.data.map(ligneEnCours)}</ul>
      <Pagination
        className="px-4 pb-3"
        page={enCours.data?.meta.current_page ?? pageEnCours}
        lastPage={enCours.data?.meta.last_page ?? 1}
        onChange={setPageEnCours}
      />
    </>
  );

  const restantes = Math.max(nbExpirees - (expirees.data?.data.length ?? 0), 0);
  const listeExpirees = expirees.isError ? (
    <div className="p-4">
      <ErrorState message={messageErreur(expirees.error, tI('error'))} onRetry={() => void expirees.refetch()} retryLabel={t('reessayer')} />
    </div>
  ) : (
    <>
      <ul>{expirees.data?.data.map(ligneExpiree)}</ul>
      {deplie ? (
        <Pagination
          className="px-4 py-3"
          page={expirees.data?.meta.current_page ?? pageExpirees}
          lastPage={expirees.data?.meta.last_page ?? 1}
          onChange={setPageExpirees}
        />
      ) : restantes > 0 ? (
        <button
          type="button"
          onClick={() => setDeplie(true)}
          className="block w-full px-4 py-3 text-left text-ui text-muted-foreground hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        >
          {t('autres', { n: restantes })}
        </button>
      ) : null}
    </>
  );

  const note = <p className={cn('text-ui text-muted-foreground', telephone && 'px-4 py-5')}>{t('locataires')}</p>;

  const dialogues = (
    <>
      <Dialog open={aAnnuler !== null} onOpenChange={(o) => (o ? null : setAAnnuler(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tI('revokeDialog.title')}</DialogTitle>
            <DialogDescription>{aAnnuler ? tI('revokeDialog.description', { email: nomme(aAnnuler) }) : null}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAAnnuler(null)} disabled={annuler.isPending}>
              {tI('revokeDialog.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => aAnnuler && annuler.mutate(aAnnuler)} disabled={annuler.isPending}>
              {annuler.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {tI('revokeDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={effacer} onOpenChange={(o) => (o ? null : setEffacer(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('effacerTitre', { n: nbExpirees })}</DialogTitle>
            <DialogDescription>{t('effacerDetail')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEffacer(false)} disabled={purger.isPending}>
              {t('conserver')}
            </Button>
            <Button variant="destructive" onClick={() => purger.mutate()} disabled={purger.isPending}>
              {purger.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {t('effacerConfirmer', { n: nbExpirees })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  /* ── Téléphone ───────────────────────────────────────────────────────────────────────────── */

  if (telephone) {
    return (
      <div data-slot="invitations-telephone">
        {peutInviter ? (
          <div className="p-4">
            <CarteInvitations titre={t('inviterUnMembre')}>
              <div className="p-4">
                <FormulaireDInvitation id={formulaireId} agencyId={agencyId} onEnvoyee={() => void rafraichir()} />
              </div>
            </CarteInvitations>
          </div>
        ) : null}
        <TitreBloc className={peutInviter ? 'pt-1' : undefined}>{t('enCours', { n: nbEnCours })}</TitreBloc>
        <div className="border-y border-border/70 bg-card">{listeEnCours}</div>
        {nbExpirees > 0 ? (
          <>
            <TitreBloc droite={effacerToutes}>{t('expirees', { n: nbExpirees })}</TitreBloc>
            <div className="border-y border-border/70 bg-card">{listeExpirees}</div>
          </>
        ) : null}
        {note}
        {peutInviter ? (
          <BarreDAction>
            <Button type="submit" form={formulaireId} size="xl" className="flex-1">
              {t('envoyer')}
            </Button>
          </BarreDAction>
        ) : null}
        {dialogues}
      </div>
    );
  }

  /* ── Bureau ──────────────────────────────────────────────────────────────────────────────── */

  return (
    <div className="flex items-start gap-6 max-xl:flex-col" data-slot="invitations-bureau">
      <div className="min-w-0 flex-1 space-y-5 max-xl:w-full">
        <CarteInvitations titre={t('enCours', { n: nbEnCours })}>{listeEnCours}</CarteInvitations>
        {nbExpirees > 0 ? (
          <CarteInvitations titre={t('expirees', { n: nbExpirees })} action={effacerToutes}>
            {listeExpirees}
          </CarteInvitations>
        ) : null}
        {note}
      </div>
      {peutInviter ? (
        <CarteInvitations titre={t('inviterUnMembre')} className="w-[25rem] flex-none max-xl:w-full">
          <div className="p-4">
            <FormulaireDInvitation
              id={formulaireId}
              agencyId={agencyId}
              onEnvoyee={() => void rafraichir()}
              envoi={(envoiEnCours) => (
                <div className="pt-1">
                  <Button type="submit" className="w-full" disabled={envoiEnCours}>
                    {envoiEnCours ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                    {t('envoyer')}
                  </Button>
                </div>
              )}
            />
          </div>
        </CarteInvitations>
      ) : null}
      {dialogues}
    </div>
  );
}

function CarteInvitations({
  titre,
  action,
  className,
  children,
}: {
  readonly titre: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-corps font-semibold">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TitreBloc({ children, droite, className }: { readonly children: ReactNode; readonly droite?: ReactNode; readonly className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 px-4 pt-5 pb-2', className)}>
      <h2 className="min-w-0 flex-1 text-ui font-semibold text-muted-foreground">{children}</h2>
      {droite}
    </div>
  );
}
