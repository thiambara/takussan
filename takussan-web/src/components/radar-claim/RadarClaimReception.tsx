'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck, CircleCheck, CircleSlash, Clock, Hourglass, Loader2, Lock, MessageSquareOff, Pencil, SearchX, ShieldCheck, TrendingUp } from 'lucide-react';

import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { hrefConnexion } from '@/components/auth/lien-connexion';
import { ErrorState } from '@/components/feedback';
import { FormGlobalError } from '@/components/forms/FormError';
import { BasDeLien } from '@/components/lien-public/BasDeLien';
import { CarteDeLien } from '@/components/lien-public/CarteDeLien';
import { EnTeteDeLien } from '@/components/lien-public/EnTeteDeLien';
import { FeuilleDeLien } from '@/components/lien-public/FeuilleDeLien';
import { LienMort } from '@/components/lien-public/LienMort';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldDensityScope } from '@/components/ui/field-density';
import { EDITEUR } from '@/content/legal/editeur';
import { useAuth } from '@/context/AuthContext';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { Locale } from '@/i18n/config';
import { ApiError } from '@/lib/api';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { REQUETE_BARRE_PUBLIQUE } from '@/lib/navigation/barre-publique';
import { cn } from '@/lib/utils';
import {
  confirmRadarClaim,
  declineRadarClaim,
  fetchRadarClaim,
  requestRadarClaimCode,
  type RadarClaim,
  type RadarClaimDeclineReason,
  type RadarClaimSelection,
} from '@/lib/queries/radar-claim';

import { brouillonDe, ClaimListingCard, type ClaimListingDraft } from './ClaimListingCard';
import { ERREURS_RECLAMATION_RADAR, REFUS_DU_CODE } from './codes-reclamation';

type Etat =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly claim: RadarClaim }
  | { readonly kind: 'expired' }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'error' };

interface Fait {
  readonly publiees: number;
  /** TCK-2421 — les biens sous mandat repris dans son espace. */
  readonly reprises: number;
  readonly espace: string;
}

/** Le jeton que l'API remplace par `[TELEPHONE]` : une correction qui le garde est refusée (422). */
const JETON_MASQUE = '[TELEPHONE]';

type ChampDeNom = 'first_name' | 'space_name';

/**
 * Huit chiffres d'affilée, séparés au plus d'un espace, d'un point ou d'un tiret : un numéro, à
 * coup sûr (un numéro sénégalais en compte neuf). L'avertissement avant le SMS seulement — le
 * masqueur de l'API juge (`radar.claim.name_contains_phone`), et ce motif ne prétend pas l'égaler.
 */
const NUMERO_PROBABLE = /(?:\d[\s.-]?){7}\d/;

/** Les champs que l'API nomme dans un refus `radar.claim.name_contains_phone`. */
function champsDuRefus(err: unknown): ChampDeNom[] {
  if (codeDe(err) !== 'radar.claim.name_contains_phone') return [];
  const champs = (err as ApiError).data as { fields?: unknown } | null;
  const liste = Array.isArray(champs?.fields) ? champs.fields : [];
  return liste.filter((c): c is ChampDeNom => c === 'first_name' || c === 'space_name');
}

function codeDe(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const code = (err.data as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

/** Les états de la page qu'une erreur de l'API nomme : le lien ne sert pas, ou plus. */
function etatDeLErreur(err: unknown): Etat | null {
  if (!(err instanceof ApiError)) return null;
  const code = codeDe(err);
  if (err.status === 410) return { kind: code === 'radar.claim.revoked' ? 'revoked' : 'expired' };
  if (err.status === 404) return { kind: 'notFound' };
  if (err.status === 503 && code === 'radar.claim.unavailable') return { kind: 'unavailable' };
  // Un jeton que `cheminApi` refuse (`/`, `?`, `#`, `..`) ne désigne aucun lien : aucun appel n'est parti.
  if (err.status === 400 && code === 'invalid_path') return { kind: 'notFound' };
  return null;
}


interface RadarClaimReceptionProps {
  readonly token: string;
}

/**
 * TCK-2390 (ADR-0077 §3) — la page `/claim/{jeton}` : l'annonceur que le Radar a contacté lit les
 * annonces que Takussan propose de publier, décoche ou corrige, accepte les conditions, puis
 * confirme par le code reçu par SMS à SON numéro — que la page ne connaît que masqué.
 *
 * Le code ouvre le compte (neuf, ou celui que le Radar a préparé) et la session de ce navigateur.
 * Un numéro déjà vérifié sur un compte ne s'ouvre pas ici : la page envoie se connecter d'abord
 * (mot de passe, second facteur), puis revenir — l'API refuse de toute façon (409).
 *
 * TCK-2421 (ADR-0079) — sous mandat, Takussan diffuse déjà ses biens pour son compte : la page le
 * dit, et le même code les lui fait reprendre dans son espace, sans annonce à cocher.
 *
 * TCK-2512 (« La promesse, puis la liste ») — dans la coque de lien nue : la promesse d'abord (et la
 * demande du quartier, en RECHERCHES, quand l'API la rend), les annonces à cocher, puis un bouton
 * « Publier mes N annonces » collé sous le pouce, qui ouvre deux feuilles successives — l'espace,
 * puis le code. En bureau, le même formulaire tient dans une colonne collante. « Ce n'est pas moi ·
 * Ne plus me contacter » reste en bas de page dans tous les états du lien, 503 compris : le refus
 * (`decline`, effet d'un STOP) ne dépend pas de la connexion par téléphone (TCK-2511).
 */
export function RadarClaimReception({ token: jeton }: RadarClaimReceptionProps) {
  const t = useTranslations('radarClaim');
  const tL = useTranslations('lienPublic.reclamation');
  const locale = useLocale() as Locale;
  const messageErreur = useMessageErreurApi();
  const { token, openSession, logout } = useAuth();
  const surTelephone = useMatchesMedia(REQUETE_BARRE_PUBLIQUE);
  const idFormulaire = useId();

  const [etat, setEtat] = useState<Etat>({ kind: 'loading' });
  const [tentative, setTentative] = useState(0);
  const [brouillons, setBrouillons] = useState<Record<number, ClaimListingDraft>>({});
  const [prenom, setPrenom] = useState('');
  const [nomEspace, setNomEspace] = useState('');
  const [conditions, setConditions] = useState(false);
  const [codeEnvoye, setCodeEnvoye] = useState(false);
  const [code, setCode] = useState('');
  const [apercu, setApercu] = useState<string | null>(null);
  const [attente, setAttente] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nomsRefuses, setNomsRefuses] = useState<readonly ChampDeNom[]>([]);
  const [fait, setFait] = useState<Fait | null>(null);
  const [feuillePublier, setFeuillePublier] = useState(false);
  const [refus, setRefus] = useState<{ readonly ouvert: boolean; readonly motif: RadarClaimDeclineReason }>({ ouvert: false, motif: 'not_me' });
  const [refusEnCours, setRefusEnCours] = useState(false);
  const [erreurRefus, setErreurRefus] = useState<string | null>(null);
  const [refuse, setRefuse] = useState<RadarClaimDeclineReason | null>(null);
  const champCode = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fait || refuse) return;
    let annule = false;
    fetchRadarClaim(jeton, token)
      .then((claim) => {
        if (annule) return;
        setEtat({ kind: 'ready', claim });
        setBrouillons(Object.fromEntries(claim.listings.map((l) => [l.id, brouillonDe(l)])));
        setPrenom(claim.advertiser.first_name ?? '');
        setNomEspace(claim.account.space_name);
      })
      .catch((err: unknown) => {
        if (!annule) setEtat(etatDeLErreur(err) ?? { kind: 'error' });
      });
    return () => {
      annule = true;
    };
    // `fait` n'est pas une dépendance : la session que la confirmation ouvre change `token`, et la
    // page ne relit rien après la confirmation (ni après un refus).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jeton, token, tentative]);

  // Le code envoyé, la saisie suit : le champ prend le focus (le lecteur d'écran l'annonce avec lui).
  useEffect(() => {
    if (codeEnvoye) champCode.current?.focus();
  }, [codeEnvoye]);

  // Compte à rebours du renvoi : `retry_after` est la seule source, jamais une durée supposée.
  useEffect(() => {
    if (attente <= 0) return;
    const minuterie = window.setTimeout(() => setAttente((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(minuterie);
  }, [attente]);

  function messageDuRefus(err: unknown): string {
    const nomme = codeDe(err);
    const cle = nomme ? (ERREURS_RECLAMATION_RADAR[nomme] ?? REFUS_DU_CODE[nomme]) : undefined;
    if (cle) return t(`errors.${cle}`);
    if (err instanceof ApiError && err.status === 429) return t('errors.tooMany');
    return messageErreur(err, t('failed'));
  }

  function recharger() {
    setEtat({ kind: 'loading' });
    setCodeEnvoye(false);
    setCode('');
    setErreur(null);
    setTentative((n) => n + 1);
  }

  /** TCK-2511 — le refus part au clic de « Confirmer », une fois ; l'écran final ne propose plus rien. */
  async function refuser(): Promise<void> {
    if (refusEnCours) return;
    setRefusEnCours(true);
    setErreurRefus(null);
    try {
      await declineRadarClaim(jeton, refus.motif, token);
      setRefus((r) => ({ ...r, ouvert: false }));
      setRefuse(refus.motif);
    } catch (err) {
      const nomme = etatDeLErreur(err);
      if (nomme && nomme.kind !== 'unavailable') {
        setRefus((r) => ({ ...r, ouvert: false }));
        setEtat(nomme);
      } else if (codeDe(err) === 'radar.advertiser.busy') setErreurRefus(tL('refus.occupe'));
      else if (err instanceof ApiError && err.status === 429) setErreurRefus(t('errors.tooMany'));
      else setErreurRefus(tL('refus.echec'));
    } finally {
      setRefusEnCours(false);
    }
  }

  const enTete = (
    <EnTeteDeLien
      large
      mention={
        <>
          <Lock className="size-3.5" aria-hidden="true" /> {tL('lienPersonnel')}
        </>
      }
    />
  );

  const enLigne = etat.kind === 'ready' ? etat.claim.published.length : 0;
  const opposition = (
    <>
      <p className="pt-2 text-center text-[13px] text-muted-foreground lg:text-left" data-testid="claim-opposition">
        <button
          type="button"
          className="min-h-11 px-1 underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setRefus({ ouvert: true, motif: 'not_me' })}
        >
          {tL('opposition.pasMoi')}
        </button>
        <span aria-hidden="true"> · </span>
        <button
          type="button"
          className="min-h-11 px-1 underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setRefus({ ouvert: true, motif: 'stop_contact' })}
        >
          {tL('opposition.neplus')}
        </button>
      </p>
      <FeuilleDeLien
        ouverte={refus.ouvert}
        surChangement={(ouvert) => {
          if (!refusEnCours) setRefus((r) => ({ ...r, ouvert }));
        }}
        titre={tL('refus.titre')}
        description={tL('refus.intro')}
        bas={
          <Button
            type="button"
            size="lg"
            className="h-12 w-full bg-foreground text-[15px] font-semibold text-background hover:bg-foreground/90"
            disabled={refusEnCours}
            onClick={() => void refuser()}
          >
            {refusEnCours ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {tL('refus.envoi')}
              </>
            ) : (
              tL('refus.confirmer')
            )}
          </Button>
        }
      >
        <fieldset className="space-y-3" data-testid="claim-decline">
          <legend className="sr-only">{tL('refus.intro')}</legend>
          <ChoixDuRefus
            nom="motif-refus"
            valeur="not_me"
            coche={refus.motif === 'not_me'}
            surChoix={() => setRefus((r) => ({ ...r, motif: 'not_me' }))}
            icone={<CircleSlash className="size-5" />}
            titre={tL('refus.pasMoiTitre')}
            detail={tL('refus.pasMoiDetail')}
          />
          <ChoixDuRefus
            nom="motif-refus"
            valeur="stop_contact"
            coche={refus.motif === 'stop_contact'}
            surChoix={() => setRefus((r) => ({ ...r, motif: 'stop_contact' }))}
            icone={<MessageSquareOff className="size-5" />}
            titre={tL('refus.neplusTitre')}
            detail={tL('refus.neplusDetail')}
          />
        </fieldset>
        <p className="mt-4 text-[15px] text-foreground">{tL('refus.effet')}</p>
        {enLigne > 0 ? <p className="mt-2 text-[15px] text-foreground">{tL('refus.effetEnLigne')}</p> : null}
        <p className="mt-3 text-[13px] text-muted-foreground">
          {tL.rich('refus.confidentialite', {
            privacy: (morceaux) => (
              <LienLocalise href={ROUTES_LEGALES.privacy} target="_blank" rel="noopener" className="underline underline-offset-4">
                {morceaux}
              </LienLocalise>
            ),
          })}
        </p>
        {erreurRefus ? <ErrorState className="mt-4" message={erreurRefus} /> : null}
      </FeuilleDeLien>
    </>
  );

  if (refuse) {
    return (
      <>
        {enTete}
        <CarteDeLien
          data-testid="claim-declined"
          className="pb-10"
          ton="succes"
          icone={<CircleCheck />}
          titre={tL('refus.faitTitre')}
        >
          <p role="status">{refuse === 'not_me' ? tL('refus.faitPasMoi') : tL('refus.faitNeplus')}</p>
        </CarteDeLien>
      </>
    );
  }

  if (fait) {
    return (
      <>
        {enTete}
        <CarteDeLien
          data-testid="claim-done"
          className="pb-10"
          ton="succes"
          icone={<BadgeCheck />}
          titre={t('doneTitle')}
          actions={
            <Link href="/app" className={cn(buttonVariants({ size: 'lg' }), 'h-12 w-full text-[15px] font-semibold')}>
              {t('openSpace')}
            </Link>
          }
        >
          <div role="status" className="space-y-2">
            {fait.publiees > 0 || fait.reprises === 0 ? <p>{t('doneBody', { count: fait.publiees, space: fait.espace })}</p> : null}
            {fait.reprises > 0 ? (
              <p data-testid="claim-done-take-back">{t('doneTakeBack', { count: fait.reprises, space: fait.espace })}</p>
            ) : null}
          </div>
        </CarteDeLien>
      </>
    );
  }

  if (etat.kind === 'loading') {
    return (
      <>
        {enTete}
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t('loading')}
        </p>
      </>
    );
  }

  if (etat.kind === 'expired' || etat.kind === 'revoked') {
    return (
      <>
        {enTete}
        <LienMort data-testid={`claim-${etat.kind}`} titre={t(`${etat.kind}Title`)}>
          {t(`${etat.kind}Description`)}
        </LienMort>
      </>
    );
  }

  if (etat.kind === 'notFound') {
    return (
      <>
        {enTete}
        <LienMort data-testid="claim-not-found" icone={<SearchX />} titre={t('notFoundTitle')}>
          {t('notFoundDescription')}
        </LienMort>
      </>
    );
  }

  if (etat.kind === 'unavailable') {
    // Le refus reste ouvert : le droit de s'opposer ne se ferme pas avec la publication (TCK-2511).
    return (
      <>
        {enTete}
        <CarteDeLien data-testid="claim-unavailable" icone={<Clock />} titre={t('unavailableTitle')}>
          {t('unavailableDescription')}
        </CarteDeLien>
        <div className="mx-auto w-full max-w-[22rem] px-5 pb-6 pt-6 lg:text-center">{opposition}</div>
      </>
    );
  }

  if (etat.kind === 'error') {
    return (
      <>
        {enTete}
        <div className="px-5 py-10">
          <ErrorState message={t('error')} onRetry={recharger} retryLabel={t('retry')} />
        </div>
      </>
    );
  }

  const { claim } = etat;
  const { account } = claim;
  const telephone = claim.advertiser.phone_masked;
  const compteNeuf = account.state === 'new' || account.state === 'activation';
  const retenues = claim.listings.filter((l) => brouillons[l.id]?.retenue);
  const enCours = claim.publishing;
  // TCK-2421 — sous mandat, des biens en ligne à reprendre dans son espace.
  const mandat = claim.mandate;
  const reprise = mandat !== null && mandat.properties_count > 0;
  // Rien à publier ne se confirme que pour ouvrir le compte que le Radar a préparé, ou pour reprendre ses biens sous
  // mandat (l'API refuse sinon).
  const confirmable = retenues.length > 0 || account.state === 'activation' || reprise;

  // Les cas où la page ne peut pas confirmer : deux comptes pour ce numéro, que seul le support
  // réunit (décision 5a) ; un compte que la page ne peut pas ouvrir ; hors mandat, un espace qui
  // n'est pas actif (TCK-2446) ; un autre compte connecté ; le compte du numéro à ouvrir d'abord
  // par la connexion. Dans l'ordre des refus de l'API à l'envoi du code.
  const blocage =
    account.state === 'support'
      ? 'support'
      : account.state === 'mandate_support'
      ? 'mandateSupport'
      : account.state === 'unavailable'
      ? 'unavailableAccount'
      : account.space_unavailable
      ? 'spaceUnavailable'
      : account.viewer_is_other
        ? 'otherAccount'
        : account.state === 'existing' && !account.viewer_is_owner
          ? 'existingLogin'
          : null;
  const formulaireOuvert = blocage === null && (confirmable || claim.listings.length > 0);

  function selection(): RadarClaimSelection[] | string {
    const lignes: RadarClaimSelection[] = [];
    for (const listing of retenues) {
      const brouillon = brouillons[listing.id]!;
      const ligne: { id: number; title?: string; price?: number; description?: string } = { id: listing.id };
      // Seul ce qui a changé part : un texte laissé tel quel garde son numéro masqué côté serveur.
      if (brouillon.title !== (listing.title ?? '')) ligne.title = brouillon.title;
      if (brouillon.description !== (listing.description ?? '')) ligne.description = brouillon.description;
      if (brouillon.price !== (listing.price === null ? '' : String(listing.price))) {
        const prix = Number(brouillon.price);
        if (!Number.isInteger(prix) || prix < 1) return t('errors.price');
        ligne.price = prix;
      }
      if ((ligne.title ?? '').includes(JETON_MASQUE) || (ligne.description ?? '').includes(JETON_MASQUE)) {
        return t('errors.phoneToken');
      }
      lignes.push(ligne);
    }
    return lignes;
  }

  /** Prévient avant le SMS : un nom qui porte un numéro serait refusé à la confirmation. */
  function nomsAvecNumero(): ChampDeNom[] {
    if (!compteNeuf) return [];
    const champs: ChampDeNom[] = [];
    if (NUMERO_PROBABLE.test(prenom)) champs.push('first_name');
    if (NUMERO_PROBABLE.test(nomEspace)) champs.push('space_name');
    return champs;
  }

  async function envoyerCode(): Promise<void> {
    const refuses = nomsAvecNumero();
    setNomsRefuses(refuses);
    if (refuses.length > 0) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const demande = await requestRadarClaimCode(jeton, token);
      setAttente(demande.attente);
      setApercu(demande.codeApercu);
      setCode('');
      setCodeEnvoye(true);
    } catch (err) {
      const nomme = etatDeLErreur(err);
      if (nomme) setEtat(nomme);
      else setErreur(messageDuRefus(err));
    } finally {
      setEnvoi(false);
    }
  }

  async function confirmer(): Promise<void> {
    const lignes = selection();
    if (typeof lignes === 'string') {
      setErreur(lignes);
      return;
    }
    setEnvoi(true);
    setErreur(null);
    setNomsRefuses([]);
    try {
      const resultat = await confirmRadarClaim(
        jeton,
        {
          code,
          terms_version: claim.terms_version,
          listings: lignes,
          ...(compteNeuf ? { first_name: prenom.trim(), space_name: nomEspace.trim() } : {}),
        },
        token,
      );
      setFeuillePublier(false);
      setFait({
        publiees: resultat.claim.listing_ids.length,
        reprises: resultat.claim.taken_back_property_ids.length,
        espace: resultat.claim.agency.name,
      });
      if (resultat.session) {
        await openSession(resultat.session.token, resultat.session.user, resultat.session.expires_at).catch(() => undefined);
      }
    } catch (err) {
      const nomme = etatDeLErreur(err);
      const champs = champsDuRefus(err);
      if (nomme) setEtat(nomme);
      else if (champs.length > 0 && compteNeuf) setNomsRefuses(champs);
      else setErreur(messageDuRefus(err));
    } finally {
      setEnvoi(false);
    }
  }

  const nom = claim.advertiser.first_name;
  const prenomRefuse = nomsRefuses.includes('first_name');
  const espaceRefuse = nomsRefuses.includes('space_name');

  /** Le geste de la barre et de la colonne : « Publier mes N annonces » — N suit les cases cochées. */
  const libelleDuGeste = reprise
    ? t('confirmTakeBack', { count: retenues.length })
    : retenues.length === 0 && account.state !== 'activation'
      ? tL('publierAucune')
      : t('confirm', { count: retenues.length });

  const boutonDEnvoi = (
    <Button
      type="submit"
      form={idFormulaire}
      size="lg"
      disabled={codeEnvoye ? envoi || code.length !== 6 || !conditions || !confirmable : envoi || !conditions || !confirmable}
      className="h-12 w-full text-[15px] font-semibold"
    >
      {envoi ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {codeEnvoye ? t('confirming') : t('sending')}
        </>
      ) : codeEnvoye ? (
        reprise ? (
          t('confirmTakeBack', { count: retenues.length })
        ) : (
          t('confirm', { count: retenues.length })
        )
      ) : (
        t('sendCode')
      )}
    </Button>
  );

  const renvoi = codeEnvoye ? (
    <button
      type="button"
      className="mx-auto block min-h-11 rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:no-underline"
      disabled={envoi || attente > 0}
      onClick={() => void envoyerCode()}
    >
      {attente > 0 ? t('resendIn', { seconds: attente }) : t('resend')}
    </button>
  ) : (
    <p className="text-center text-[13px] text-muted-foreground">{tL('codeArriveAu', { phone: telephone })}</p>
  );

  const champsDeLEspace = (
    <section className="space-y-4" aria-labelledby={`${idFormulaire}-espace`}>
      <h3 id={`${idFormulaire}-espace`} className={cn('font-display text-base font-semibold text-foreground', surTelephone && 'sr-only')}>
        {t('spaceTitle')}
      </h3>
      <div className="space-y-1.5">
        <label htmlFor="claim-first-name" className="block text-sm font-medium">
          {t('fieldFirstName')}
        </label>
        <Input
          id="claim-first-name"
          value={prenom}
          maxLength={60}
          autoComplete="given-name"
          disabled={envoi}
          aria-invalid={prenomRefuse || undefined}
          aria-describedby={prenomRefuse ? 'claim-first-name-error' : undefined}
          onChange={(e) => {
            setPrenom(e.target.value);
            setNomsRefuses((c) => c.filter((x) => x !== 'first_name'));
          }}
        />
        {prenomRefuse ? (
          <p id="claim-first-name-error" role="alert" className="text-xs font-medium text-destructive">
            {t('errors.firstNameContainsPhone')}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="claim-space-name" className="block text-sm font-medium">
          {t('fieldSpaceName')}
        </label>
        <Input
          id="claim-space-name"
          value={nomEspace}
          maxLength={120}
          aria-describedby={[espaceRefuse ? 'claim-space-name-error' : null, 'claim-space-name-hint'].filter(Boolean).join(' ')}
          aria-invalid={espaceRefuse || undefined}
          disabled={envoi}
          onChange={(e) => {
            setNomEspace(e.target.value);
            setNomsRefuses((c) => c.filter((x) => x !== 'space_name'));
          }}
        />
        {espaceRefuse ? (
          <p id="claim-space-name-error" role="alert" className="text-xs font-medium text-destructive">
            {t('errors.spaceNameContainsPhone')}
          </p>
        ) : null}
        <p id="claim-space-name-hint" className="text-xs text-muted-foreground">
          {t('spaceHint')}
        </p>
      </div>
    </section>
  );

  const formulaire = (
    <form
      id={idFormulaire}
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void (codeEnvoye ? confirmer() : envoyerCode());
      }}
    >
      {!codeEnvoye ? (
        <>
          {compteNeuf ? (
            champsDeLEspace
          ) : account.space ? (
            <p className="text-sm text-muted-foreground" data-testid="claim-existing-space">
              {t('existingSpace', { name: account.space.name })}
            </p>
          ) : null}
          <label className="flex cursor-pointer items-start gap-3 text-[15px] text-foreground">
            <input
              type="checkbox"
              checked={conditions}
              disabled={envoi}
              onChange={(e) => setConditions(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-input accent-primary"
            />
            <span className="text-pretty">
              {t.rich('terms', {
                terms: (chunks) => (
                  <LienLocalise
                    href={ROUTES_LEGALES.terms}
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {chunks}
                  </LienLocalise>
                ),
              })}
            </span>
          </label>
        </>
      ) : (
        <div className="space-y-4">
          {/* Un nom refusé par l'API à la confirmation se corrige ici, sans renvoyer de code. */}
          {compteNeuf && nomsRefuses.length > 0 ? champsDeLEspace : null}
          <p className="text-[15px] text-muted-foreground" role="status">
            {t('codeSentTo', { phone: telephone })}
          </p>
          <div className="space-y-1.5">
            <label htmlFor="claim-code" className={cn('block text-sm font-medium', surTelephone && 'sr-only')}>
              {t('codeLabel')}
            </label>
            <Input
              id="claim-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="123456"
              className="text-center font-display text-2xl tabular-nums tracking-[0.5em]"
              required
              ref={champCode}
            />
          </div>
          <CodeDePreproduction code={apercu} onUtiliser={setCode} />
        </div>
      )}

      {erreur ? <FormGlobalError>{erreur}</FormGlobalError> : null}

      {!surTelephone ? (
        <div className="space-y-2">
          {boutonDEnvoi}
          {renvoi}
        </div>
      ) : null}
      {!confirmable ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t('errors.nothingSelected')}
        </p>
      ) : null}
    </form>
  );

  const carteDeBlocage = blocage ? (
    <div className="space-y-3 rounded-2xl border border-border bg-muted p-4" data-testid={`claim-${blocage}`}>
      <h2 className="font-display text-base font-semibold text-foreground">{t(`${blocage}Title`)}</h2>
      <p className="text-sm text-muted-foreground text-pretty">{t(`${blocage}Body`, { phone: telephone, email: EDITEUR.courriels.contact })}</p>
      {blocage === 'existingLogin' ? (
        <Link
          href={hrefConnexion(`/${locale}/claim/${encodeURIComponent(jeton)}`)}
          className={cn(buttonVariants({ size: 'lg' }), 'h-12 w-full text-[15px] font-semibold')}
        >
          {t('login')}
        </Link>
      ) : null}
      {blocage === 'otherAccount' ? (
        <Button variant="outline" size="lg" className="h-12 w-full text-[15px]" onClick={() => void logout()}>
          {t('logout')}
        </Button>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      {enTete}
      <div
        {...fieldDensityScope()}
        className="mx-auto w-full lg:grid lg:max-w-[1120px] lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12 lg:px-8 lg:pt-10"
        data-testid="claim-ready"
      >
        <div className="space-y-7 px-4 pb-6 pt-6 lg:px-0 lg:pt-0">
          <section className="space-y-4" aria-labelledby={`${idFormulaire}-promesse`}>
            <div className="space-y-2">
              <h1
                id={`${idFormulaire}-promesse`}
                className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-balance text-foreground"
              >
                {nom ? t('greeting', { name: nom }) : t('greetingAnonymous')}
              </h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                {reprise ? t('introMandate', { phone: telephone }) : t('intro', { phone: telephone })}
              </p>
            </div>
            {/* TCK-2511 — un compte de RECHERCHES, jamais de personnes ; rien sous le seuil (`null`). */}
            {claim.demand ? (
              <p className="flex items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3.5 text-[15px] leading-snug text-foreground" data-testid="claim-demand">
                <TrendingUp className="size-5 flex-none text-primary-deep" aria-hidden="true" />
                <span>
                  {tL.rich('demande', {
                    count: claim.demand.searches_30d,
                    quartier: claim.demand.quarter,
                    strong: (morceaux) => <span className="font-semibold tabular-nums">{morceaux}</span>,
                  })}
                </span>
              </p>
            ) : null}
            {!reprise ? (
              <ul className="space-y-2.5 text-[15px] text-foreground">
                <Avantage icone={<BadgeCheck className="size-[18px]" />}>{tL('avantageGratuit')}</Avantage>
                <Avantage icone={<ShieldCheck className="size-[18px]" />}>{tL('avantageNumero')}</Avantage>
                <Avantage icone={<Pencil className="size-[18px]" />}>{tL('avantageCorriger')}</Avantage>
              </ul>
            ) : null}
          </section>

          {reprise ? (
            <section className="space-y-2 rounded-2xl border border-border bg-card p-4" aria-labelledby="claim-mandate" data-testid="claim-mandate">
              <h2 id="claim-mandate" className="font-display text-base font-semibold text-foreground">
                {t('mandateTitle')}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                {t('mandateBody', { count: mandat.properties_count })}
              </p>
            </section>
          ) : null}

          {surTelephone ? carteDeBlocage : null}

          {claim.listings.length > 0 ? (
            <section className="space-y-3" aria-labelledby="claim-listings">
              <div>
                <h2 id="claim-listings" className="font-display text-lg font-semibold tracking-[-0.02em] text-foreground">
                  {tL('aPublierTitre')}
                </h2>
                <p className="text-sm text-muted-foreground">{t('listingsHint')}</p>
              </div>
              <ul className="space-y-3">
                {claim.listings.map((listing) => (
                  <ClaimListingCard
                    key={listing.id}
                    listing={listing}
                    brouillon={brouillons[listing.id] ?? brouillonDe(listing)}
                    disabled={envoi || blocage !== null}
                    onChange={(b) => setBrouillons((tous) => ({ ...tous, [listing.id]: b }))}
                  />
                ))}
              </ul>
            </section>
          ) : account.state !== 'activation' && !reprise && enCours.length === 0 && claim.awaiting_review.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="claim-empty">
              {t('noListings')}
            </p>
          ) : null}

          {claim.published.length > 0 ? (
            <section className="space-y-2" aria-labelledby="claim-published" data-testid="claim-published">
              <h2 id="claim-published" className="font-display text-base font-semibold text-foreground">
                {t('publishedTitle')}
              </h2>
              <ul className="divide-y divide-border rounded-2xl border border-border">
                {claim.published.map((p) => (
                  <li key={p.public_url} className="flex min-h-12 items-center gap-3 px-4 py-2">
                    <span className="inline-flex size-2.5 flex-none rounded-full bg-success" aria-hidden="true" />
                    <a href={p.public_url} className="min-w-0 flex-1 text-sm font-medium text-foreground underline-offset-4 hover:underline">
                      {p.title ?? t('untitled')}
                    </a>
                    <span className="flex-none text-sm font-medium text-muted-foreground" aria-hidden="true">
                      {tL('voir')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {enCours.length > 0 ? (
            <section className="space-y-2" aria-labelledby="claim-publishing" data-testid="claim-publishing">
              <h2 id="claim-publishing" className="font-display text-base font-semibold text-foreground">
                {t('publishingTitle')}
              </h2>
              <p className="text-sm text-muted-foreground text-pretty">{t('publishingHint')}</p>
              <ul className="space-y-1 text-sm">
                {enCours.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-foreground">
                    <Clock className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate">{l.title ?? t('untitled')}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* TCK-2413 — réclamées, mais laissées à l'équipe : la page ne promet plus « quelques minutes », ni ne dit pourquoi. */}
          {claim.awaiting_review.length > 0 ? (
            <section className="space-y-2" aria-labelledby="claim-awaiting-review" data-testid="claim-awaiting-review">
              <h2 id="claim-awaiting-review" className="font-display text-base font-semibold text-foreground">
                {t('awaitingReviewTitle')}
              </h2>
              <p className="text-sm text-muted-foreground text-pretty">{t('awaitingReviewHint')}</p>
              <ul className="space-y-1 text-sm">
                {claim.awaiting_review.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-foreground">
                    <Hourglass className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate">{l.title ?? t('untitled')}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {opposition}
        </div>

        {!surTelephone && (carteDeBlocage || formulaireOuvert) ? (
          <aside className="mx-4 mb-6 self-start rounded-2xl border border-border bg-card p-5 shadow-[0_24px_48px_-28px_color-mix(in_oklab,var(--shadow-color)_40%,transparent)] lg:sticky lg:top-24 lg:mx-0">
            {carteDeBlocage ?? (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-foreground">{libelleDuGeste}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{tL('barreSousTitre')}</p>
                </div>
                {formulaire}
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {surTelephone && formulaireOuvert ? (
        <>
          <BasDeLien data-testid="claim-publish-bar">
            <Button
              type="button"
              size="lg"
              className="h-12 w-full text-[15px] font-semibold"
              disabled={!confirmable}
              onClick={() => setFeuillePublier(true)}
            >
              {libelleDuGeste}
            </Button>
            <p className="text-center text-[13px] text-muted-foreground">
              {confirmable ? tL('barreSousTitre') : t('errors.nothingSelected')}
            </p>
          </BasDeLien>
          <FeuilleDeLien
            ouverte={feuillePublier}
            surChangement={(ouverte) => {
              if (!envoi) setFeuillePublier(ouverte);
            }}
            titre={codeEnvoye ? t('codeLabel') : compteNeuf || account.space ? t('spaceTitle') : tL('avantPublierTitre')}
            bas={
              <>
                {boutonDEnvoi}
                {renvoi}
              </>
            }
          >
            {formulaire}
          </FeuilleDeLien>
        </>
      ) : null}
    </>
  );
}

function Avantage({ icone, children }: { readonly icone: ReactNode; readonly children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex-none text-primary-deep" aria-hidden="true">
        {icone}
      </span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}

function ChoixDuRefus({
  nom,
  valeur,
  coche,
  surChoix,
  icone,
  titre,
  detail,
}: {
  readonly nom: string;
  readonly valeur: RadarClaimDeclineReason;
  readonly coche: boolean;
  readonly surChoix: () => void;
  readonly icone: ReactNode;
  readonly titre: string;
  readonly detail: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-2xl border-2 bg-card p-3.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
        coche ? 'border-foreground' : 'border-border',
      )}
    >
      <span className="mt-0.5 flex-none text-foreground" aria-hidden="true">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{titre}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
      <input type="radio" name={nom} value={valeur} checked={coche} onChange={surChoix} className="mt-1 size-5 flex-none accent-foreground" />
    </label>
  );
}
