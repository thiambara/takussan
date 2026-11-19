'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarCheck, CircleCheck, CircleSlash, ClipboardSignature, Clock3, KeyRound, Link2Off, Loader2, MapPin, SearchX, ShieldCheck, TriangleAlert, Wrench } from 'lucide-react';

import { ErrorState } from '@/components/feedback';
import { SignaturePad } from '@/components/inventory/SignaturePad';
import { BasDeLien } from '@/components/lien-public/BasDeLien';
import { CarteDeLien } from '@/components/lien-public/CarteDeLien';
import { EnTeteDeLien } from '@/components/lien-public/EnTeteDeLien';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  GESTES_DU_LIEN,
  demanderLeCode,
  faireLeGeste,
  lienMortDe,
  lireLienDAction,
  type CauseDuLienMort,
  type GesteDuLien,
  type LienDAction,
  type ObjetDuLien,
  type ParametresDuGeste,
} from '@/lib/queries/lien-d-action';
import { cn } from '@/lib/utils';

/**
 * TCK-2983 (ADR-0132 § 5, maquette `fil-pont` D) — la page `/{langue}/fil/a/{jeton}` : la personne jointe
 * par WhatsApp ou par SMS fait UN geste sur UN objet, sans se connecter.
 *
 * - Un seul geste par page, un bouton principal : ni « Proposer un autre créneau » ni « Je ne peux pas
 *   intervenir » (un lien fait un geste ; le reste se dit dans la conversation WhatsApp).
 * - Rien n'est affiché que la réponse ne porte : chaque ligne du récapitulatif lit une clé de `object`.
 * - Un lien mort ne dit RIEN de l'objet, ni de l'agence, ni d'une date : son état ne porte que sa cause
 *   (`CauseDuLienMort`), jamais la réponse — la non-fuite tient au type (AC2).
 * - Le geste part une fois : le bouton se désactive pendant l'envoi, et un verrou (`enCours`) écarte le
 *   second clic du même instant, que `disabled` ne voit pas encore.
 */
type Etat =
  | { readonly kind: 'chargement' }
  | { readonly kind: 'geste'; readonly lien: LienDAction }
  | { readonly kind: 'fait'; readonly geste: GesteDuLien; readonly objet: ObjetDuLien }
  | { readonly kind: 'mort'; readonly cause: CauseDuLienMort }
  | { readonly kind: 'tropDeTentatives' }
  | { readonly kind: 'erreur' };

/** La clé i18n de chaque geste du registre (`lienPublic.action.gestes.*`). */
const CLE_DU_GESTE: Readonly<Record<GesteDuLien, 'visite' | 'intervention' | 'etatDesLieux'>> = {
  'property_visit.confirm': 'visite',
  'maintenance_request.accept': 'intervention',
  'inventory.sign': 'etatDesLieux',
};

const ICONE_DU_GESTE: Readonly<Record<GesteDuLien, ReactNode>> = {
  'property_visit.confirm': <CalendarCheck className="size-3.5" strokeWidth={1.75} aria-hidden="true" />,
  'maintenance_request.accept': <Wrench className="size-3.5" strokeWidth={1.75} aria-hidden="true" />,
  'inventory.sign': <ClipboardSignature className="size-3.5" strokeWidth={1.75} aria-hidden="true" />,
};

const ICONE_DU_LIEN_MORT: Readonly<Record<CauseDuLienMort, ReactNode>> = {
  expired: <Clock3 />,
  used: <CircleSlash />,
  revoked: <Link2Off />,
  notFound: <SearchX />,
};

function estUnGeste(g: unknown): g is GesteDuLien {
  return typeof g === 'string' && (GESTES_DU_LIEN as readonly string[]).includes(g);
}

export function PageDuLienDAction({ jeton }: { readonly jeton: string }) {
  const t = useTranslations('lienPublic.action');
  const tCoque = useTranslations('lienPublic.coque');
  const [etat, setEtat] = useState<Etat>({ kind: 'chargement' });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    let annule = false;
    lireLienDAction(jeton)
      .then((lien) => {
        if (annule) return;
        if (!estUnGeste(lien.gesture)) return setEtat({ kind: 'erreur' });
        setEtat(lien.state === 'done' ? { kind: 'fait', geste: lien.gesture, objet: lien.object ?? {} } : { kind: 'geste', lien });
      })
      .catch((err: unknown) => {
        if (annule) return;
        const cause = lienMortDe(err);
        if (cause) return setEtat({ kind: 'mort', cause });
        setEtat(err instanceof ApiError && err.status === 429 ? { kind: 'tropDeTentatives' } : { kind: 'erreur' });
      });
    return () => {
      annule = true;
    };
  }, [jeton, tentative]);

  const mention = (
    <>
      <ShieldCheck className="size-3.5" aria-hidden="true" /> {t('mention')}
    </>
  );
  const reessayer = () => {
    setEtat({ kind: 'chargement' });
    setTentative((n) => n + 1);
  };

  if (etat.kind === 'chargement') {
    return (
      <>
        <EnTeteDeLien mention={mention} />
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {tCoque('chargement')}
        </p>
      </>
    );
  }

  if (etat.kind === 'mort') {
    // Ni émetteur, ni objet, ni date : seulement quoi faire.
    return (
      <>
        <EnTeteDeLien mention={mention} />
        <CarteDeLien data-testid={`lien-mort-${etat.cause}`} icone={ICONE_DU_LIEN_MORT[etat.cause]} titre={t(`mort.${etat.cause}.titre`)} className="pb-10">
          {t(`mort.${etat.cause}.texte`)}
        </CarteDeLien>
      </>
    );
  }

  if (etat.kind === 'tropDeTentatives') {
    return (
      <>
        <EnTeteDeLien mention={mention} />
        <CarteDeLien
          data-testid="lien-trop-de-tentatives"
          ton="alerte"
          icone={<TriangleAlert />}
          titre={t('tropDeTentatives.titre')}
          actions={
            <Button variant="outline" size="lg" className="w-full" onClick={reessayer}>
              {tCoque('reessayer')}
            </Button>
          }
        >
          {t('tropDeTentatives.texte')}
        </CarteDeLien>
      </>
    );
  }

  if (etat.kind === 'erreur') {
    return (
      <>
        <EnTeteDeLien mention={mention} />
        <div className="px-5 py-10" data-testid="lien-erreur">
          <ErrorState message={t('erreur')} onRetry={reessayer} retryLabel={tCoque('reessayer')} />
        </div>
      </>
    );
  }

  if (etat.kind === 'fait') {
    return (
      <>
        <EnTeteDeLien mention={mention} />
        <GesteFait geste={etat.geste} objet={etat.objet} />
      </>
    );
  }

  return (
    <>
      <EnTeteDeLien mention={mention} />
      <Geste
        jeton={jeton}
        lien={etat.lien}
        onFait={(objet) => setEtat({ kind: 'fait', geste: etat.lien.gesture, objet })}
        onMort={(cause) => setEtat({ kind: 'mort', cause })}
      />
    </>
  );
}

/** Une ligne du récapitulatif, seulement quand la réponse porte sa valeur. */
function LigneRecap({ libelle, children }: { readonly libelle: string; readonly children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5 text-sm">
      <dt className="w-24 flex-none text-muted-foreground">{libelle}</dt>
      <dd className="min-w-0 flex-1 font-medium text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** Les morceaux non vides, joints ; `null` s'il n'en reste aucun. */
function joindre(...morceaux: (string | null | undefined)[]): string | null {
  const pleins = morceaux.map((m) => m?.trim()).filter((m): m is string => !!m);
  return pleins.length > 0 ? pleins.join(', ') : null;
}

function Recapitulatif({ objet, apres = false }: { readonly objet: ObjetDuLien; readonly apres?: boolean }) {
  const t = useTranslations('lienPublic.action.recap');
  const f = useFormatteurs();
  const lignes: { cle: string; libelle: string; valeur: string }[] = [];
  const pousser = (cle: string, valeur: string | null | undefined) => {
    if (typeof valeur === 'string' && valeur.trim() !== '') lignes.push({ cle, libelle: t(cle), valeur: valeur.trim() });
  };
  pousser('motif', objet.title);
  pousser('bien', objet.property_title ?? objet.property?.title);
  if (apres) {
    // Après le geste seulement : ce que la ressource de l'objet ouvre à ce compte (ADR-0122).
    pousser('adresse', joindre(objet.access?.street, objet.access?.quarter, objet.access?.city) ?? objet.property?.address?.line);
    pousser('surPlace', objet.access?.instructions);
    pousser('contact', objet.access?.requester_phone);
  } else {
    pousser('quartier', joindre(objet.quarter, objet.city));
  }
  const creneau = objet.scheduled_at ? f.dateTime(objet.scheduled_at) : null;
  if (!creneau && lignes.length === 0) return null;
  return (
    <div className="mt-5 rounded-xl border border-border bg-card p-4" data-testid="recap-du-lien">
      {creneau ? (
        <p className="flex items-center gap-2 text-[1.0625rem] font-semibold">
          <Clock3 className="size-5 flex-none text-primary" strokeWidth={1.75} aria-hidden="true" />
          {creneau}
        </p>
      ) : null}
      {lignes.length > 0 ? (
        <dl className={cn('divide-y divide-border/70', creneau && 'mt-2')}>
          {lignes.map((l) => (
            <LigneRecap key={l.cle} libelle={l.libelle}>
              {l.valeur}
            </LigneRecap>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function Geste({
  jeton,
  lien,
  onFait,
  onMort,
}: {
  readonly jeton: string;
  readonly lien: LienDAction;
  readonly onFait: (objet: ObjetDuLien) => void;
  readonly onMort: (cause: CauseDuLienMort) => void;
}) {
  const t = useTranslations('lienPublic.action');
  const messageErreur = useMessageErreurApi();
  const cle = CLE_DU_GESTE[lien.gesture];
  const objet = lien.object ?? {};
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Le verrou du double clic : `disabled` ne s'applique qu'au rendu suivant.
  const enCours = useRef(false);

  async function agir(parametres: ParametresDuGeste) {
    if (enCours.current) return;
    enCours.current = true;
    setEnvoi(true);
    setErreur(null);
    try {
      const rendu = await faireLeGeste(jeton, parametres);
      onFait(rendu.object ?? {});
    } catch (err) {
      const cause = lienMortDe(err);
      if (cause) return onMort(cause);
      // Un refus (politique, machine d'état, validation) ne consomme pas le lien : le geste reste possible.
      setErreur(messageErreur(err, t('refus')));
    } finally {
      enCours.current = false;
      setEnvoi(false);
    }
  }

  return (
    <>
      <div className="px-5 pt-6 lg:pt-5" data-testid={`geste-${cle}`}>
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {ICONE_DU_GESTE[lien.gesture]}
          {t(`gestes.${cle}.surtitre`)}
        </p>
        <h1 className="mt-1.5 font-display text-[1.375rem] font-semibold leading-tight tracking-[-0.02em]">{t(`gestes.${cle}.titre`)}</h1>
        <Recapitulatif objet={objet} />
        {lien.gesture === 'maintenance_request.accept' ? (
          <p className="mt-4 flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-[0.8125rem] leading-snug text-muted-foreground">
            <MapPin className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
            {t('gestes.intervention.adresseApres')}
          </p>
        ) : null}
        {lien.gesture === 'inventory.sign' ? <Signature jeton={jeton} envoi={envoi} onSigner={(signature, code) => void agir({ signature, code })} /> : null}
        {erreur ? (
          <p role="alert" className="mt-4 rounded-lg border border-destructive px-3 py-2.5 text-sm text-destructive" data-testid="refus-du-geste">
            {erreur}
          </p>
        ) : null}
        <p className="mt-5 pb-4 text-[0.8125rem] leading-relaxed text-muted-foreground">{t('pied')}</p>
      </div>
      {lien.gesture === 'inventory.sign' ? null : (
        <BasDeLien>
          <Button
            size="lg"
            className="h-12 w-full text-base"
            disabled={envoi}
            aria-busy={envoi || undefined}
            onClick={() => void agir(lien.gesture === 'maintenance_request.accept' && objet.scheduled_at ? { scheduled_at: objet.scheduled_at } : {})}
          >
            {envoi ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t(`gestes.${cle}.bouton`)}
          </Button>
        </BasDeLien>
      )}
    </>
  );
}

/** La signature par lien : un code à 6 chiffres reçu au numéro du lien, puis le tracé (ADR-0098). */
function Signature({ jeton, envoi, onSigner }: { readonly jeton: string; readonly envoi: boolean; readonly onSigner: (signature: string, code: string) => void }) {
  const t = useTranslations('lienPublic.action.signature');
  const messageErreur = useMessageErreurApi();
  const [code, setCode] = useState('');
  const [codeEnvoye, setCodeEnvoye] = useState(false);
  const [demande, setDemande] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const codeComplet = /^\d{6}$/.test(code);

  async function demander() {
    if (demande) return;
    setDemande(true);
    setErreur(null);
    try {
      await demanderLeCode(jeton);
      setCodeEnvoye(true);
    } catch (err) {
      setErreur(messageErreur(err, t('codeNonEnvoye')));
    } finally {
      setDemande(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 flex-none text-primary" strokeWidth={1.75} aria-hidden="true" />
          {t('codeTitre')}
        </p>
        {codeEnvoye ? (
          <>
            <Input
              className="mt-2 text-center text-xl font-semibold tracking-[0.4em] tabular-nums"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-label={t('codeAria')}
              data-testid="code-de-signature"
            />
            <p className="mt-2 text-[0.8125rem] text-muted-foreground">{t('codeEnvoye')}</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-[0.8125rem] text-muted-foreground">{t('codeAide')}</p>
            <Button variant="outline" size="lg" className="mt-3 w-full" disabled={demande} onClick={() => void demander()}>
              {demande ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {t('recevoirLeCode')}
            </Button>
          </>
        )}
        {erreur ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
      </div>
      <SignaturePad
        label={t('traceTitre')}
        helperText={t('traceAide')}
        confirmLabel={t('signer')}
        clearLabel={t('effacer')}
        disabled={!codeComplet || envoi}
        pending={envoi}
        onConfirm={(signature) => onSigner(signature, code)}
      />
    </div>
  );
}

/** Le geste fait : une coche, ce que la réponse rend, et l'invitation douce à créer son mot de passe. */
function GesteFait({ geste, objet }: { readonly geste: GesteDuLien; readonly objet: ObjetDuLien }) {
  const t = useTranslations('lienPublic.action');
  return (
    <div className="px-5 pb-6" data-testid="geste-fait">
      <CarteDeLien ton="succes" icone={<CircleCheck />} titre={t('fait.titre')} className="px-0 pt-8">
        {t(`gestes.${CLE_DU_GESTE[geste]}.fait`)}
      </CarteDeLien>
      <Recapitulatif objet={objet} apres />
      <div className="mt-5 rounded-xl bg-secondary/60 p-4" data-testid="invitation-compte">
        <p className="text-[0.9375rem] font-semibold">{t('fait.compteTitre')}</p>
        <p className="mt-1 text-[0.8125rem] leading-snug text-muted-foreground">{t('fait.compteTexte')}</p>
        {/* Le parcours existant (hors `[locale]`) ; le jeton ne part jamais dans un `redirect=`. */}
        <NextLink href="/auth/forgot-password" className={cn(buttonVariants({ variant: 'default' }), 'mt-3')}>
          {t('fait.compteBouton')}
        </NextLink>
      </div>
      <p className="mt-5 text-[0.8125rem] leading-relaxed text-muted-foreground">{t('fait.pied')}</p>
    </div>
  );
}
