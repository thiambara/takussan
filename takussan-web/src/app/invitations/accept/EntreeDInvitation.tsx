'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Check, CircleAlert, Loader2, LogIn, UserCheck } from 'lucide-react';

import { BoutonCollant } from '@/components/auth/BoutonCollant';
import { CasesDuCode, LONGUEUR_DU_CODE } from '@/components/auth/CasesDuCode';
import { hrefConnexionPour } from '@/components/auth/lien-connexion';
import { Logo } from '@/components/brand/Logo';
import { useDrapeauConnexionParTelephone } from '@/components/bookings/useIdentiteParTelephone';
import { DeclarerEntree } from '@/components/entree/CoqueDEntree';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button } from '@/components/ui/button';
import { fieldDensityScope } from '@/components/ui/field-density';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/context/AuthContext';
import { initialesDe, nomCompletDe } from '@/lib/identite';
import type { ApercuDInvitation } from '@/lib/invitation-apercu';
import type { NomsPreremplis } from '@/lib/invitation-prerempli';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { formaterTelephone, numeroComposable } from '@/lib/phone';
import { cn } from '@/lib/utils';

import { AccepterInvitation } from './AccepterInvitation';
import { BOUTON_D_INVITATION, BlocAgence, CeQuiVousAttend, LogoDeLAgence, EncadreDeTest, PanneauDeLAgence, PhraseDInvitation, PourQui, cleDuRole } from './PiecesDeLInvitation';
import { useEntreeParInvitation, type EntreeParInvitation } from './useEntreeParInvitation';

/**
 * TCK-2611 (ADR-0094) — une invitation valide : l'agence, la personne qui invite et le rôle en tête,
 * puis l'entrée par code (maquette `app-entree-invitation`, approche a, écrans « Invitation valide »,
 * « Code », « Déjà inscrit »).
 *
 * - **Déconnecté, drapeau `phone_login` allumé** : prénom et nom préremplis par l'agence, le numéro
 *   (celui de l'invitation par SMS, masqué ; à saisir pour une invitation par e-mail), « Continuer avec
 *   mon numéro » collé au-dessus du clavier ; la voie mot de passe repliée derrière « Utiliser un mot de
 *   passe ».
 * - **Déconnecté, drapeau éteint** : la voie mot de passe ouverte, seule — la page d'avant (TCK-626).
 *   Drapeau pas encore lu : ni l'une ni l'autre, la place du bouton gardée.
 * - **Connecté** : le compte, « Rejoindre Dakar Immo » en un geste, « Ce n'est pas moi — changer de
 *   compte » (déconnecte, puis la page se relit sans session).
 *
 * ⚠ **Aucune requête qui accepte au rendu** : l'acceptation est un geste (contrainte 2 de TCK-610).
 *
 * Bureau large (≥ 1280) : l'agence à gauche (`PanneauDeLAgence`, l'objet de la coque), le formulaire de
 * 400 px à droite, titré « Rejoignez Dakar Immo ». En dessous, l'agence est dite dans la colonne.
 */
interface EntreeDInvitationProps {
  readonly jeton: string;
  readonly connecte: boolean;
  readonly apercu: ApercuDInvitation;
  /** Connecté et sans nom (TCK-2281) : le nom de l'invitation, à confirmer. */
  readonly prerempliDuCompte?: NomsPreremplis | null;
}

const LIEN_PRIMAIRE =
  'inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-primary underline decoration-1 underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';
const LIEN_DISCRET =
  'inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-muted-foreground underline decoration-1 underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';
const TITRE = 'font-display text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em] xl:text-[2rem] xl:leading-[1.12] xl:tracking-[-0.025em]';

/** « 77 123 45 67 » : l'indicatif du Sénégal se tait ; un numéro étranger le garde. */
function numeroAffiche(telephone: string): string {
  return formaterTelephone(telephone).replace(/^\+221 /, '');
}

/** Le numéro d'un compte, masqué comme l'API masque celui d'une invitation (`Masking::phone`). */
export function numeroMasque(telephone: string | null | undefined): string | null {
  if (!telephone) return null;
  let chiffres = telephone.replace(/\D+/g, '');
  if (chiffres.length === 12 && chiffres.startsWith('221')) chiffres = chiffres.slice(3);
  if (chiffres.length < 8) return '••••';
  return `${chiffres.slice(0, 2)} ••• ${chiffres.slice(-4, -2)} ${chiffres.slice(-2)}`;
}

function minutes(secondes: number): string {
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
}

export function EntreeDInvitation({ jeton, connecte, apercu, prerempliDuCompte = null }: EntreeDInvitationProps) {
  const t = useTranslations('invitationAccept');
  const router = useRouter();
  const { logout } = useAuth();
  const drapeau = useDrapeauConnexionParTelephone();
  const [voie, setVoie] = useState<'code' | 'mot-de-passe'>('code');
  const [prenom, setPrenom] = useState(apercu.prerempli.prenom);
  const [nom, setNom] = useState(apercu.prerempli.nom);
  const parSms = apercu.destinataire?.canal === 'phone';
  const entree = useEntreeParInvitation({ jeton, parSms, noms: () => ({ prenom, nom }), onMotDePasse: () => setVoie('mot-de-passe') });

  const agence = apercu.agence?.nom ?? null;
  const rejoindre = agence ? t('rejoindre', { agence }) : t('accept');
  const lienConnexion = hrefConnexionPour(`/invitations/accept?token=${encodeURIComponent(jeton)}`, 'invitation');

  async function changerDeCompte() {
    await logout();
    router.refresh();
  }

  const objet = <DeclarerEntree objet={<PanneauDeLAgence apercu={apercu} />} objetAGauche />;

  if (connecte) {
    return (
      <>
        {objet}
        <EnTeteValide apercu={apercu} />
        <CompteConnecte className="mt-5 xl:mt-7" />
        {/* Au bureau, le geste seul suit la carte à 18 px (son propre `lg:mt-5`) ; les noms à confirmer gardent l'écart. */}
        <div className={prerempliDuCompte ? 'mt-5' : 'mt-5 lg:mt-0'}>
          <AccepterInvitation
            jeton={jeton}
            connecte
            prerempli={prerempliDuCompte}
            libelleAccepter={rejoindre}
            aideDuNom={agence ? t('connecte.sansNom', { agence }) : undefined}
            collant
            onChangerDeCompte={() => void changerDeCompte()}
            apres={
              <p className="flex justify-center lg:mt-1">
                <button type="button" onClick={() => void changerDeCompte()} className={LIEN_DISCRET}>
                  {t('connecte.pasMoi')}
                </button>
              </p>
            }
          />
        </div>
      </>
    );
  }

  if (entree.etape === 'code') return <>{objet}<EcranDuCode apercu={apercu} entree={entree} parSms={parSms} rejoindre={rejoindre} /></>;
  if (entree.etape === 'conditions') return <>{objet}<EcranDesConditions entree={entree} /></>;
  if (entree.etape === 'double-facteur') return <>{objet}<EcranDuSecondFacteur entree={entree} /></>;

  const motDePasse = drapeau === false || voie === 'mot-de-passe';

  return (
    <>
      {objet}
      <EnTeteValide apercu={apercu} />
      {motDePasse ? (
        <div className="mt-6 xl:mt-7">
          <AccepterInvitation
            jeton={jeton}
            connecte={false}
            prerempli={{ prenom, nom }}
            autreVoie={
              drapeau ? (
                <button type="button" onClick={() => setVoie('code')} className={LIEN_PRIMAIRE}>
                  {t('voies.code')}
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <FormulaireDuNumero
          apercu={apercu}
          entree={entree}
          parSms={parSms}
          drapeauLu={drapeau !== null}
          prenom={prenom}
          nom={nom}
          setPrenom={setPrenom}
          setNom={setNom}
          lienConnexion={lienConnexion}
          onMotDePasse={() => setVoie('mot-de-passe')}
        />
      )}
    </>
  );
}

/**
 * L'en-tête de l'invitation : au téléphone, l'agence, « Aïssatou vous invite comme bailleur » et ce qui
 * attend ; au bureau large, « Rejoignez Dakar Immo » (l'agence et la phrase sont dans le panneau).
 *
 * ⚠ **Un seul `h1`**, dont le texte visible change à 1280 : son nom accessible porte toujours le prénom
 * de qui invite, le rôle et l'agence (AC2) — le complément manquant en `sr-only`.
 */
function EnTeteValide({ apercu }: { readonly apercu: ApercuDInvitation }) {
  const t = useTranslations('invitationAccept');
  const agence = apercu.agence?.nom ?? null;
  const rejoignez = agence ? t('titre.rejoignez', { agence }) : t('accept');
  return (
    <>
      <BlocAgence apercu={apercu} className="mb-5 xl:hidden" />
      <h1 className={cn(TITRE, 'text-balance')}>
        <span className="xl:hidden">
          <PhraseDInvitation apercu={apercu} />
          {agence ? <span className="sr-only"> {t('titre.chez', { agence })}</span> : null}
        </span>
        <span className="hidden xl:inline">
          {rejoignez}
          <span className="sr-only">
            {' — '}
            <PhraseDInvitation apercu={apercu} texteSeul />
          </span>
        </span>
      </h1>
      <CeQuiVousAttend apercu={apercu} className="mt-5 xl:hidden" />
      <PourQui apercu={apercu} className="mt-3" />
    </>
  );
}

function ChampsDuNom({
  apercu,
  prenom,
  nom,
  setPrenom,
  setNom,
  figes,
}: {
  readonly apercu: ApercuDInvitation;
  readonly prenom: string;
  readonly nom: string;
  readonly setPrenom: (v: string) => void;
  readonly setNom: (v: string) => void;
  readonly figes: boolean;
}) {
  const t = useTranslations('invitationAccept');
  const prerempli = apercu.prerempli.prenom !== '' || apercu.prerempli.nom !== '';
  const agence = apercu.agence?.nom ?? null;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="invitation-prenom" className="leading-(--text-sm--line-height)">{t('firstName')}</Label>
          <Input id="invitation-prenom" autoComplete="given-name" maxLength={100} value={prenom} onChange={(e) => setPrenom(e.target.value)} disabled={figes} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="invitation-nom" className="leading-(--text-sm--line-height)">{t('noms.nom')}</Label>
          <Input id="invitation-nom" autoComplete="family-name" maxLength={100} value={nom} onChange={(e) => setNom(e.target.value)} disabled={figes} />
        </div>
      </div>
      {prerempli ? <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{agence ? t('noms.aide', { agence }) : t('noms.aideSans')}</p> : null}
    </div>
  );
}

function Alerte({ entree, lienConnexion }: { readonly entree: EntreeParInvitation; readonly lienConnexion?: string }) {
  const t = useTranslations('invitationAccept');
  if (!entree.erreur) return null;
  return (
    <div role="alert" className="mt-4 flex flex-col gap-1 text-sm text-destructive">
      <p className="text-pretty">{entree.erreur}</p>
      {entree.connexionDemandee && lienConnexion ? (
        <Link href={lienConnexion} className="w-fit font-medium text-primary underline-offset-4 hover:underline">
          {t('meConnecter')}
        </Link>
      ) : null}
    </div>
  );
}

function FormulaireDuNumero({
  apercu,
  entree,
  parSms,
  drapeauLu,
  prenom,
  nom,
  setPrenom,
  setNom,
  lienConnexion,
  onMotDePasse,
}: {
  readonly apercu: ApercuDInvitation;
  readonly entree: EntreeParInvitation;
  readonly parSms: boolean;
  readonly drapeauLu: boolean;
  readonly prenom: string;
  readonly nom: string;
  readonly setPrenom: (v: string) => void;
  readonly setNom: (v: string) => void;
  readonly lienConnexion: string;
  readonly onMotDePasse: () => void;
}) {
  const t = useTranslations('invitationAccept');
  const decalage = useDecalageDuClavier();
  const agence = apercu.agence?.nom ?? null;
  const pret = parSms ? apercu.destinataire !== null : numeroComposable(entree.telephone);

  return (
    <form
      {...fieldDensityScope()}
      noValidate
      className="mt-6 flex flex-col xl:mt-7"
      onSubmit={(e) => {
        e.preventDefault();
        if (pret) void entree.envoyerCode();
      }}
    >
      <ChampsDuNom apercu={apercu} prenom={prenom} nom={nom} setPrenom={setPrenom} setNom={setNom} figes={entree.envoi} />

      <div className="mt-4">
        {parSms && apercu.destinataire ? (
          <>
            <p id="invitation-numero-libelle" className="mb-1.5 text-sm font-medium">
              {t('numero.libelle')}
            </p>
            <p
              aria-labelledby="invitation-numero-libelle"
              aria-describedby="invitation-numero-aide"
              className="flex h-11 items-center rounded-lg border border-border bg-card px-3 text-[0.9375rem] tabular-nums"
            >
              {apercu.destinataire.masque}
            </p>
            <p id="invitation-numero-aide" className="mt-1.5 text-[0.8125rem] text-muted-foreground">
              {agence ? t('numero.aideSms', { agence }) : t('numero.aideSmsSans')}
            </p>
          </>
        ) : (
          <>
            <Label htmlFor="invitation-telephone" className="mb-1.5 block leading-(--text-sm--line-height)">
              {t('numero.libelle')}
            </Label>
            <PhoneInput
              id="invitation-telephone"
              value={entree.telephone}
              onValueChange={entree.setTelephone}
              autoComplete="tel-national"
              aria-describedby="invitation-numero-aide"
              // L'aide de la page (ci-dessous) dit le numéro ; celle de l'indicatif serait une seconde ligne.
              aide={false}
              required
            />
            <p id="invitation-numero-aide" className="mt-1.5 text-[0.8125rem] text-muted-foreground">
              {t('numero.aideEmail')}
            </p>
          </>
        )}
      </div>

      <Alerte entree={entree} lienConnexion={lienConnexion} />

      {apercu.compteExistant && apercu.destinataire?.canal === 'email' ? (
        <div className="mt-5 rounded-xl border border-border bg-card p-3 max-lg:order-2">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
            <span>{t('compteExistant')}</span>
          </p>
          <Link
            href={lienConnexion}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-foreground/20 bg-card px-5 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <LogIn className="size-4" aria-hidden="true" />
            {t('meConnecter')}
          </Link>
        </div>
      ) : null}

      {/* DOM : le bouton, puis les autres voies — l'ordre du bureau et de la tabulation. Au téléphone, le bouton
          se colle en bas et les voies remontent sous le numéro (`order`), comme la maquette. */}
      {drapeauLu ? (
        <>
          <BoutonCollant decalage={decalage} className="max-lg:order-3 max-lg:mt-4 lg:mt-6">
            <Button type="submit" disabled={entree.envoi || !pret} className={BOUTON_D_INVITATION}>
              {entree.envoi ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {t('envoi')}
                </>
              ) : (
                t('continuer')
              )}
            </Button>
            <p className="pt-1 text-center text-xs text-muted-foreground lg:mt-2 lg:pt-0 lg:text-[0.8125rem] lg:leading-normal">{t('continuerAide')}</p>
          </BoutonCollant>
          <div aria-hidden="true" className="h-5 flex-none lg:hidden max-lg:order-4" />
        </>
      ) : (
        <div aria-hidden="true" className="h-12 flex-none max-lg:order-3 lg:mt-6" />
      )}

      <div className="mt-4 flex flex-col items-center max-lg:order-1 lg:flex-row lg:justify-center lg:gap-6 lg:border-t lg:border-border lg:pt-3">
        <button type="button" onClick={onMotDePasse} className={LIEN_PRIMAIRE}>
          {t('voies.motDePasse')}
        </button>
        <Link href={lienConnexion} className={LIEN_DISCRET}>
          {t('haveAccount')}
        </Link>
      </div>
    </form>
  );
}

function EcranDuCode({
  apercu,
  entree,
  parSms,
  rejoindre,
}: {
  readonly apercu: ApercuDInvitation;
  readonly entree: EntreeParInvitation;
  readonly parSms: boolean;
  readonly rejoindre: string;
}) {
  const t = useTranslations('invitationAccept');
  const tCommun = useTranslations('common');
  const decalage = useDecalageDuClavier();
  const agence = apercu.agence;
  const numero = parSms ? (apercu.destinataire?.masque ?? '') : numeroAffiche(entree.telephone);
  const biens = cleDuRole(apercu.role) === 'owner' ? (apercu.attente.biens ?? 0) : 0;
  const fort = (morceaux: ReactNode) => <span className="font-semibold text-foreground">{morceaux}</span>;

  return (
    <div>
      {/* Au téléphone, la barre de l'écran du code : la flèche de retour au numéro, la marque. */}
      <DeclarerEntree
        enTete={
          <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border/70 bg-background px-1">
            <button
              type="button"
              onClick={entree.revenirAuNumero}
              aria-label={t('code.retour')}
              className="inline-flex size-11 flex-none items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </button>
            <Link href="/" className="inline-flex rounded-md py-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring">
              <Logo nom={tCommun('appName')} />
            </Link>
          </header>
        }
      />
      {agence ? (
        <div className="flex items-center gap-2.5 rounded-full bg-secondary/70 py-1.5 pl-1.5 pr-4 xl:hidden">
          {/* Le logo de l'agence, ou ses initiales (« DI »), en pastille de 32 px. */}
          <LogoDeLAgence nom={agence.nom} logo={agence.logo} taille="xs" className="rounded-full" />
          <p className="min-w-0 truncate text-sm">
            {t.rich('code.pastille', { agence: agence.nom, role: t(`roles.${cleDuRole(apercu.role)}`), fort: (m) => <span className="font-semibold">{m}</span> })}
          </p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={entree.revenirAuNumero}
        className="hidden items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring xl:-mt-2 xl:inline-flex"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('code.retour')}
      </button>
      <h1 className={cn(TITRE, 'mt-5 xl:mt-3')}>{t('code.titre')}</h1>
      <p className="mt-3 text-[0.9375rem] xl:mt-4 xl:text-base">
        {t.rich('code.envoye', { numero, fort: (m) => <span className="font-semibold tabular-nums">{m}</span> })}
        {parSms ? null : (
          <>
            {' · '}
            <button type="button" onClick={entree.revenirAuNumero} className="rounded font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring">
              {t('code.modifier')}
            </button>
          </>
        )}
      </p>
      <form
        className="mt-4 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void entree.verifier(false);
        }}
      >
        <label htmlFor="invitation-code" className="sr-only">
          {t('code.libelle')}
        </label>
        <CasesDuCode
          id="invitation-code"
          valeur={entree.code}
          onChange={entree.saisirCode}
          erreur={entree.codeRefuse}
          figee={entree.envoi}
          aria-describedby={entree.erreur ? 'invitation-code-erreur' : undefined}
        />
        {entree.erreur ? (
          <p id="invitation-code-erreur" role="alert" className="mt-3 text-sm text-destructive text-pretty">
            {entree.erreur}
          </p>
        ) : null}
        <p className="mt-3 flex flex-wrap items-center gap-x-1 text-[0.8125rem] text-muted-foreground">
          {t('code.rienRecu')}{' '}
          {entree.attente > 0 ? (
            <span className="tabular-nums">{t('code.renvoyerDans', { temps: minutes(entree.attente) })}</span>
          ) : (
            <button
              type="button"
              disabled={entree.envoi}
              onClick={() => void entree.envoyerCode()}
              className="-my-3 min-h-11 rounded-lg font-medium text-primary underline decoration-primary/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              {t('code.renvoyer')}
            </button>
          )}
        </p>
        <EncadreDeTest code={entree.apercu} className="mt-5" />
        <p className="mt-6 flex items-start gap-2.5 rounded-2xl bg-muted/70 p-3.5 text-[0.8125rem] leading-snug text-encre-douce xl:hidden">
          <UserCheck className="mt-0.5 size-4 flex-none text-muted-foreground" aria-hidden="true" />
          <span>{biens > 0 ? t.rich('code.ensuiteBiens', { n: biens, fort }) : t.rich('code.ensuite', { fort })}</span>
        </p>
        <BoutonCollant decalage={decalage} className="max-lg:mt-6 lg:mt-6">
          <Button type="submit" disabled={entree.envoi || entree.code.length !== LONGUEUR_DU_CODE} className={BOUTON_D_INVITATION}>
            {entree.envoi ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t('code.verification')}
              </>
            ) : (
              rejoindre
            )}
          </Button>
        </BoutonCollant>
      </form>
    </div>
  );
}

function EcranDesConditions({ entree }: { readonly entree: EntreeParInvitation }) {
  const t = useTranslations('invitationAccept.conditions');
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        entree.accepterConditions();
      }}
    >
      <div>
        <h1 className={TITRE}>{t('titre')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{t('intro')}</p>
      </div>
      {entree.erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {entree.erreur}
        </p>
      ) : null}
      <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={entree.caseConditions}
          disabled={entree.envoi}
          onChange={(e) => entree.setCaseConditions(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-input accent-primary"
        />
        <span className="text-pretty">
          {t.rich('accepter', {
            lien: (m) => (
              <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" rel="noopener" className="font-medium text-primary underline-offset-4 hover:underline">
                {m}
              </LienLocalise>
            ),
          })}
        </span>
      </label>
      <Button type="submit" disabled={entree.envoi || !entree.caseConditions} className={BOUTON_D_INVITATION}>
        {entree.envoi ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {t('continuer')}
      </Button>
    </form>
  );
}

function EcranDuSecondFacteur({ entree }: { readonly entree: EntreeParInvitation }) {
  const t = useTranslations('invitationAccept.secondFacteur');
  const secours = entree.codeDeSecours;
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void entree.verifier(true);
      }}
    >
      <div>
        <h1 className={TITRE}>{t('titre')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{secours ? t('introSecours') : t('intro')}</p>
      </div>
      {entree.erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {entree.erreur}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invitation-second-facteur">{secours ? t('libelleSecours') : t('libelle')}</Label>
        <Input
          id="invitation-second-facteur"
          value={entree.secondFacteur}
          onChange={(e) =>
            entree.setSecondFacteur(secours ? e.target.value.toUpperCase().slice(0, 11) : e.target.value.replace(/\D/g, '').slice(0, 6))
          }
          inputMode={secours ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          className="tabular-nums tracking-widest"
          required
        />
      </div>
      <Button type="submit" disabled={entree.envoi || entree.secondFacteur.length < (secours ? 11 : 6)} className={BOUTON_D_INVITATION}>
        {entree.envoi ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {t('verifier')}
      </Button>
      <button type="button" onClick={entree.basculerCodeDeSecours} className={cn(LIEN_PRIMAIRE, 'w-fit')}>
        {secours ? t('utiliserApp') : t('utiliserSecours')}
      </button>
    </form>
  );
}

/** « Compte connecté · Moussa Ndiaye (77 ••• 45 67) » — le compte qui va rejoindre l'agence. */
function CompteConnecte({ className }: { readonly className?: string }) {
  const t = useTranslations('invitationAccept.connecte');
  const { user } = useAuth();
  if (!user) return null;
  const nomComplet = nomCompletDe(user);
  const numero = numeroMasque(user.phone);
  const initiales = initialesDe(user);
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border border-border bg-card p-4', className)}>
      <span aria-hidden="true" className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
        {initiales || '·'}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[0.8125rem] text-muted-foreground">{t('compte')}</p>
        <p className="mt-0.5 truncate text-[0.9375rem] font-semibold">
          {nomComplet || numero || user.email}
          {nomComplet && numero ? <span className="font-normal tabular-nums text-muted-foreground"> ({numero})</span> : null}
        </p>
      </div>
      <Check className="size-5 flex-none text-success" strokeWidth={2.25} aria-hidden="true" />
    </div>
  );
}
