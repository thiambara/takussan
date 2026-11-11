'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, BellOff, BellRing, CalendarClock, CircleCheck, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { BasDeLien } from '@/components/lien-public/BasDeLien';
import { CarteDeLien } from '@/components/lien-public/CarteDeLien';
import { EnTeteDeLien } from '@/components/lien-public/EnTeteDeLien';
import { IssuesDuLien, LienMort } from '@/components/lien-public/LienMort';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { requeteDesCriteres } from '@/lib/favoris-suivi';
import {
  confirmPublicSearchAlert,
  fetchPublicSearchAlertByToken,
  lireLienDeCompte,
  unsubscribeAccountSearch,
  unsubscribePublicSearchAlert,
  updatePublicSearchAlertFrequency,
  type AlerteDuLien,
} from '@/lib/queries/public-search-alerts';
import { cn } from '@/lib/utils';

import { CriteresDAlerte, usePucesDAlerte } from './CriteresDAlerte';

/** La forme d'un jeton émis par `AlertSubscriber::newToken()` : base64url de 32 octets. */
const FORME_DU_JETON = /^[A-Za-z0-9_-]{20,128}$/;

interface SearchAlertLinkActionProps {
  readonly mode: 'confirm' | 'unsubscribe';
  readonly token?: string | null;
  readonly search?: string | null;
  readonly expires?: string | null;
  readonly signature?: string | null;
}

type Action =
  | { readonly kind: 'confirm'; readonly token: string }
  | { readonly kind: 'contact'; readonly token: string }
  | { readonly kind: 'account'; readonly link: NonNullable<ReturnType<typeof lireLienDeCompte>> };

function actionDuLien(props: SearchAlertLinkActionProps): Action | null {
  if (props.mode === 'unsubscribe' && props.search != null) {
    const link = lireLienDeCompte(props);
    return link ? { kind: 'account', link } : null;
  }
  if (!props.token || !FORME_DU_JETON.test(props.token)) return null;
  return props.mode === 'confirm' ? { kind: 'confirm', token: props.token } : { kind: 'contact', token: props.token };
}

type Etat = 'lecture' | 'idle' | 'working' | 'done' | 'weekly' | 'invalid' | 'error';

/** Le geste en cours : le bouton qui tourne, et lui seul. */
type Geste = 'principal' | 'semaine';

/**
 * TCK-599 (ADR-0050 §4) — les pages où mènent les liens d'un e-mail d'alerte : confirmer une
 * alerte sans compte, ou s'en désinscrire (sans compte, ou l'alerte d'un compte par son lien
 * signé). TCK-2514 : « la carte au centre », dans la coque de lien nue.
 *
 * ⚠ Rien ne part au chargement : l'action est un `POST`, déclenché par UN bouton. Un scanneur
 * de liens qui ouvre la page — et parfois exécute son JavaScript — ne confirme ni ne désinscrit
 * personne. La seule requête du chargement est la LECTURE de l'alerte (`GET by-token`, TCK-2513),
 * qui ne consomme rien : elle donne les critères et le compte de biens, ou dit que le lien ne
 * sert plus. Les paramètres viennent de l'URL, donc de n'importe qui : un lien qui n'a pas la
 * forme attendue rend l'écran « lien mort » sans appeler l'API.
 *
 * La désinscription sans compte arrête TOUTES les alertes du contact et l'efface : son titre le
 * dit. Elle propose d'abord d'espacer (« Plutôt une fois par semaine », `POST frequency`, l'abonné
 * reste inscrit), puis de couper — les deux visibles.
 */
export function SearchAlertLinkAction(props: SearchAlertLinkActionProps) {
  const t = useTranslations('search.alertPages');
  const tL = useTranslations('lienPublic.alerte');
  const tCoque = useTranslations('lienPublic.coque');
  const pucesDe = usePucesDAlerte();
  const action = actionDuLien(props);
  const avecLecture = action !== null && action.kind !== 'account';
  const [etat, setEtat] = useState<Etat>(action ? (avecLecture ? 'lecture' : 'idle') : 'invalid');
  const [geste, setGeste] = useState<Geste>('principal');
  const [alerte, setAlerte] = useState<AlerteDuLien | null>(null);

  const jeton = action && action.kind !== 'account' ? action.token : null;
  const attendu = action?.kind === 'confirm' ? 'confirm' : 'unsubscribe';

  useEffect(() => {
    if (!jeton) return;
    let annule = false;
    fetchPublicSearchAlertByToken(jeton)
      .then((lue) => {
        if (annule) return;
        // Un jeton de désinscription sur la page de confirmation (ou l'inverse) ne servirait à
        // rien : le `POST` répondrait sans agir. Il est dit mort, comme un jeton inconnu.
        if (lue.kind !== attendu) {
          setEtat('invalid');
          return;
        }
        setAlerte(lue);
        setEtat('idle');
      })
      .catch((err: unknown) => {
        if (annule) return;
        // 404 : inconnu, expiré, déjà servi — le même pour tous. Toute autre panne de la lecture
        // n'empêche pas d'agir : la page reste, sans critères ni compte.
        setEtat(err instanceof ApiError && err.status === 404 ? 'invalid' : 'idle');
      });
    return () => {
      annule = true;
    };
  }, [jeton, attendu]);

  const enTete = <EnTeteDeLien />;

  if (etat === 'invalid' || !action) {
    return (
      <>
        {enTete}
        <LienMort data-testid="search-alert-invalid" titre={t('invalidTitle')}>
          {t('invalidBody')}
        </LienMort>
      </>
    );
  }

  if (etat === 'lecture') {
    return (
      <>
        {enTete}
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {tCoque('chargement')}
        </p>
      </>
    );
  }

  const puces = alerte ? pucesDe(alerte.criteria) : [];
  // Le compte n'est dit que quand le moteur l'a rendu : `null` n'est pas zéro.
  const compte = alerte && typeof alerte.matches === 'number' ? alerte.matches : null;
  const criteres =
    puces.length > 0 || compte !== null ? (
      <div className="mt-5 space-y-3 px-5">
        <CriteresDAlerte puces={puces} />
        {compte !== null ? (
          <p className="text-center text-sm tabular-nums text-muted-foreground" data-testid="alerte-compte">
            {compte > 0 ? tL('dejaEnLigne', { count: compte }) : tL('aucunEnLigne')}
          </p>
        ) : null}
      </div>
    ) : null;

  if (etat === 'weekly') {
    return (
      <>
        {enTete}
        <CarteDeLien
          data-testid="search-alert-weekly"
          className="pb-8"
          ton="succes"
          icone={<CalendarClock />}
          titre={tL('hebdoFaitTitre')}
          actions={<IssuesDuLien />}
        >
          <span role="status">{tL('hebdoFaitTexte')}</span>
        </CarteDeLien>
      </>
    );
  }

  if (etat === 'done') {
    const corps =
      action.kind === 'confirm'
        ? t('confirm.doneBody')
        : action.kind === 'contact'
          ? t('unsubscribe.doneContact')
          : t('unsubscribe.doneAccount');
    const voir =
      action.kind === 'confirm' && alerte && compte !== null && compte > 0 ? (
        <>
          <LienLocalise
            href={`/properties?${requeteDesCriteres(alerte.criteria)}`}
            className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
          >
            {tL('voirLesBiens', { count: compte })}
            <ArrowRight aria-hidden="true" />
          </LienLocalise>
          <LienLocalise href="/properties" className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full')}>
            {tL('autreRecherche')}
          </LienLocalise>
        </>
      ) : null;
    return (
      <>
        {enTete}
        <CarteDeLien
          data-testid="search-alert-done"
          className="pb-8"
          ton="succes"
          icone={<CircleCheck />}
          titre={action.kind === 'confirm' ? t('confirm.doneTitle') : t('unsubscribe.doneTitle')}
          actions={voir ?? <IssuesDuLien />}
        >
          <span role="status">{corps}</span>
        </CarteDeLien>
        {action.kind === 'confirm' ? criteres : null}
      </>
    );
  }

  async function agir(choix: Geste) {
    if (!action) return;
    setGeste(choix);
    setEtat('working');
    try {
      if (choix === 'semaine' && action.kind === 'contact') {
        await updatePublicSearchAlertFrequency(action.token, 'weekly');
        setEtat('weekly');
        return;
      }
      if (action.kind === 'confirm') await confirmPublicSearchAlert({ token: action.token });
      else if (action.kind === 'contact') await unsubscribePublicSearchAlert(action.token);
      else await unsubscribeAccountSearch(action.link);
      setEtat('done');
    } catch (err) {
      // 422 : jeton inconnu, servi ou expiré ; 403 : signature fausse ou expirée ; 404 : la
      // recherche n'existe plus. Tous disent la même chose à la personne : ce lien ne sert plus.
      const status = err instanceof ApiError ? err.status : 0;
      setEtat(status === 422 || status === 403 || status === 404 ? 'invalid' : 'error');
    }
  }

  const enCours = etat === 'working';
  const titre =
    action.kind === 'confirm' ? t('confirm.title') : action.kind === 'contact' ? tL('desinscrireTitre') : t('unsubscribe.title');
  const corps =
    action.kind === 'confirm'
      ? t('confirm.body')
      : action.kind === 'contact'
        ? tL('desinscrireTexte')
        : t('unsubscribe.bodyAccount');
  // Espacer n'a de sens que pour l'abonné sans compte (le jeton de désinscription), et que si
  // l'alerte n'est pas déjà hebdomadaire.
  const proposerLaSemaine = action.kind === 'contact' && alerte?.frequency !== 'weekly';
  const page = action.kind === 'confirm' ? 'confirm' : 'unsubscribe';

  return (
    <>
      {enTete}
      <CarteDeLien
        data-testid="search-alert-action"
        icone={action.kind === 'confirm' ? <BellRing /> : <BellOff />}
        ton={action.kind === 'confirm' ? 'alerte' : 'neutre'}
        titre={titre}
      >
        {corps}
      </CarteDeLien>
      {criteres}
      <div className="h-8" aria-hidden="true" />
      <BasDeLien>
        {etat === 'error' ? <ErrorState message={t('error')} /> : null}
        {proposerLaSemaine ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-full text-[0.9375rem]"
            disabled={enCours}
            onClick={() => void agir('semaine')}
          >
            {enCours && geste === 'semaine' ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {tL('uneFoisParSemaine')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="lg"
          className={cn(
            'h-12 w-full text-[0.9375rem] font-semibold',
            action.kind !== 'confirm' && 'bg-foreground text-background hover:bg-foreground/90',
          )}
          disabled={enCours}
          onClick={() => void agir('principal')}
        >
          {enCours && geste === 'principal' ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {enCours && geste === 'principal' ? t(`${page}.working`) : t(`${page}.button`)}
        </Button>
      </BasDeLien>
    </>
  );
}
