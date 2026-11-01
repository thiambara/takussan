'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, Link2Off, Loader2, SearchX, Clock, Hourglass } from 'lucide-react';

import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { hrefConnexion } from '@/components/auth/lien-connexion';
import { EmptyState, ErrorState } from '@/components/feedback';
import { FormGlobalError } from '@/components/forms/FormError';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EDITEUR } from '@/content/legal/editeur';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { Locale } from '@/i18n/config';
import { ApiError } from '@/lib/api';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { cn } from '@/lib/utils';
import {
  confirmRadarClaim,
  fetchRadarClaim,
  requestRadarClaimCode,
  type RadarClaim,
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
 */
export function RadarClaimReception({ token: jeton }: RadarClaimReceptionProps) {
  const t = useTranslations('radarClaim');
  const locale = useLocale() as Locale;
  const messageErreur = useMessageErreurApi();
  const { token, openSession, logout } = useAuth();

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
  const champCode = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fait) return;
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
    // page ne relit rien après la confirmation.
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

  if (fait) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center" data-testid="claim-done">
        <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden="true" />
        <h2 className="font-display text-xl font-semibold text-foreground" role="status">
          {t('doneTitle')}
        </h2>
        {fait.publiees > 0 || fait.reprises === 0 ? (
          <p className="bg-card text-sm leading-relaxed text-muted-foreground text-pretty">
            {t('doneBody', { count: fait.publiees, space: fait.espace })}
          </p>
        ) : null}
        {fait.reprises > 0 ? (
          <p className="bg-card text-sm leading-relaxed text-muted-foreground text-pretty" data-testid="claim-done-take-back">
            {t('doneTakeBack', { count: fait.reprises, space: fait.espace })}
          </p>
        ) : null}
        <Link href="/app" className={cn(buttonVariants(), 'h-11 w-full rounded-full text-base font-semibold')}>
          {t('openSpace')}
        </Link>
      </div>
    );
  }

  if (etat.kind === 'loading') {
    return (
      <p className="flex items-center justify-center gap-2 bg-background py-16 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t('loading')}
      </p>
    );
  }

  if (etat.kind === 'expired' || etat.kind === 'revoked') {
    return (
      <EmptyState
        data-testid={`claim-${etat.kind}`}
        icon={<Link2Off className="size-8" aria-hidden="true" />}
        title={t(`${etat.kind}Title`)}
        description={t(`${etat.kind}Description`)}
      />
    );
  }

  if (etat.kind === 'notFound') {
    return (
      <EmptyState
        data-testid="claim-not-found"
        icon={<SearchX className="size-8" aria-hidden="true" />}
        title={t('notFoundTitle')}
        description={t('notFoundDescription')}
      />
    );
  }

  if (etat.kind === 'unavailable') {
    return (
      <EmptyState
        data-testid="claim-unavailable"
        icon={<Clock className="size-8" aria-hidden="true" />}
        title={t('unavailableTitle')}
        description={t('unavailableDescription')}
      />
    );
  }

  if (etat.kind === 'error') {
    return <ErrorState message={t('error')} onRetry={recharger} retryLabel={t('retry')} />;
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

  return (
    <div className="space-y-8" data-testid="claim-ready">
      <div className="space-y-2">
        <p className="font-display text-lg font-semibold text-foreground">
          {nom ? t('greeting', { name: nom }) : t('greetingAnonymous')}
        </p>
        <p className="bg-background text-sm leading-relaxed text-muted-foreground text-pretty">
          {reprise ? t('introMandate', { phone: telephone }) : t('intro', { phone: telephone })}
        </p>
      </div>

      {reprise ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4" aria-labelledby="claim-mandate" data-testid="claim-mandate">
          <h2 id="claim-mandate" className="font-display text-base font-semibold text-foreground">
            {t('mandateTitle')}
          </h2>
          <p className="bg-card text-sm leading-relaxed text-muted-foreground text-pretty">
            {t('mandateBody', { count: mandat.properties_count })}
          </p>
        </section>
      ) : null}

      {claim.published.length > 0 ? (
        <section className="space-y-2" aria-labelledby="claim-published">
          <h2 id="claim-published" className="font-display text-base font-semibold text-foreground">
            {t('publishedTitle')}
          </h2>
          <ul className="space-y-1 text-sm">
            {claim.published.map((p) => (
              <li key={p.public_url}>
                <a href={p.public_url} className="font-medium text-primary underline-offset-4 hover:underline">
                  {p.title ?? t('untitled')}
                </a>
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
          <p className="bg-background text-sm text-muted-foreground text-pretty">{t('publishingHint')}</p>
          <ul className="space-y-1 text-sm">
            {enCours.map((l) => (
              <li key={l.id} className="flex items-center gap-2 bg-background text-foreground">
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
          <p className="bg-background text-sm text-muted-foreground text-pretty">{t('awaitingReviewHint')}</p>
          <ul className="space-y-1 text-sm">
            {claim.awaiting_review.map((l) => (
              <li key={l.id} className="flex items-center gap-2 bg-background text-foreground">
                <Hourglass className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{l.title ?? t('untitled')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {blocage ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted p-4" data-testid={`claim-${blocage}`}>
          <h2 className="font-display text-base font-semibold text-foreground">{t(`${blocage}Title`)}</h2>
          <p className="bg-muted text-sm text-muted-foreground text-pretty">{t(`${blocage}Body`, { phone: telephone, email: EDITEUR.courriels.contact })}</p>
          {blocage === 'existingLogin' ? (
            <Link
              href={hrefConnexion(`/${locale}/claim/${encodeURIComponent(jeton)}`)}
              className={cn(buttonVariants(), 'h-11 w-full rounded-full text-base font-semibold')}
            >
              {t('login')}
            </Link>
          ) : null}
          {blocage === 'otherAccount' ? (
            <Button variant="outline" className="h-11 w-full rounded-full text-base" onClick={() => void logout()}>
              {t('logout')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {claim.listings.length > 0 ? (
        <section className="space-y-3" aria-labelledby="claim-listings">
          <div>
            <h2 id="claim-listings" className="font-display text-base font-semibold text-foreground">
              {t('listingsTitle')}
            </h2>
            <p className="bg-background text-sm text-muted-foreground">{t('listingsHint')}</p>
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
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground" data-testid="claim-empty">
          {t('noListings')}
        </p>
      ) : null}

      {blocage === null && (confirmable || claim.listings.length > 0) ? (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void (codeEnvoye ? confirmer() : envoyerCode());
          }}
        >
          {compteNeuf ? (
            <section className="space-y-4" aria-labelledby="claim-space">
              <h2 id="claim-space" className="font-display text-base font-semibold text-foreground">
                {t('spaceTitle')}
              </h2>
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
                  className="h-11"
                />
                {prenomRefuse ? (
                  <p id="claim-first-name-error" role="alert" className="bg-background text-xs font-medium text-destructive">
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
                  className="h-11"
                />
                {espaceRefuse ? (
                  <p id="claim-space-name-error" role="alert" className="bg-background text-xs font-medium text-destructive">
                    {t('errors.spaceNameContainsPhone')}
                  </p>
                ) : null}
                <p id="claim-space-name-hint" className="bg-background text-xs text-muted-foreground">
                  {t('spaceHint')}
                </p>
              </div>
            </section>
          ) : account.space ? (
            <p className="bg-background text-sm text-muted-foreground" data-testid="claim-existing-space">
              {t('existingSpace', { name: account.space.name })}
            </p>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
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

          {erreur ? <FormGlobalError>{erreur}</FormGlobalError> : null}

          {codeEnvoye ? (
            <div className="space-y-4">
              <p className="bg-background text-sm text-muted-foreground" role="status">
                {t('codeSentTo', { phone: telephone })}
              </p>
              <div className="space-y-1.5">
                <label htmlFor="claim-code" className="block text-sm font-medium">
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
                  className="h-11 tabular-nums tracking-widest"
                  required
                  ref={champCode}
                />
              </div>
              <CodeDePreproduction code={apercu} onUtiliser={setCode} />
              <Button
                type="submit"
                disabled={envoi || code.length !== 6 || !conditions || !confirmable}
                className="h-11 w-full rounded-full text-base font-semibold"
              >
                {envoi ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {t('confirming')}
                  </>
                ) : reprise ? (
                  t('confirmTakeBack', { count: retenues.length })
                ) : (
                  t('confirm', { count: retenues.length })
                )}
              </Button>
              <button
                type="button"
                className="-ml-2 min-h-11 rounded-lg bg-background px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:no-underline"
                disabled={envoi || attente > 0}
                onClick={() => void envoyerCode()}
              >
                {attente > 0 ? t('resendIn', { seconds: attente }) : t('resend')}
              </button>
            </div>
          ) : (
            <Button
              type="submit"
              disabled={envoi || !conditions || !confirmable}
              className="h-11 w-full rounded-full text-base font-semibold"
            >
              {envoi ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t('sending')}
                </>
              ) : (
                t('sendCode')
              )}
            </Button>
          )}
          {!confirmable ? (
            <p className="bg-background text-sm text-muted-foreground" role="status">
              {t('errors.nothingSelected')}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
