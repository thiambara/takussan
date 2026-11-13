'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Loader2, LockKeyhole, Mail, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DeclarerEntree } from '@/components/entree/CoqueDEntree';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { FormCheckbox, FormGlobalError, FormInput } from '@/components/forms';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useApiForm } from '@/hooks/useApiForm';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useCurrentLocale } from '@/i18n/hooks';
import { isTwoFactorChallenge, login, register, type LoginResponse } from '@/lib/auth';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { avecRedirection } from '@/lib/redirection-interne';
import { loginSchema, registerSchema, type LoginFormValues, type RegisterFormValues } from '@/lib/schemas/auth';
import { cn } from '@/lib/utils';

import { AutresVoies } from './AutresVoies';
import { BOUTON_D_ENTREE, BoutonCollant } from './BoutonCollant';
import { BASCULE_MOT_DE_PASSE } from './cibles';
import { BarreDuBien, PanneauDuBien, avecBien, useTitreDeLaBarre, type IntentionAffichee } from './IntentionDEntree';
import type { ActionDEntree } from './lien-connexion';
import { cheminDEntree } from './liens-de-l-entree';
import { TitreDEntree } from './PiecesDuCourriel';
import { RetourAuth } from './RetourAuth';

/**
 * TCK-2606 — la voie e-mail en deux onglets (maquette `app-entree-connexion`, écrans a-3 et a-4) :
 * « J'ai un compte » et « Créer un compte », sous « Avec votre e-mail ».
 *
 * - **Se connecter** : l'adresse, le mot de passe (œil, « Mot de passe oublié ? » qui garde
 *   l'intention), puis le second facteur s'il est demandé ; le bandeau « Mot de passe modifié »
 *   (`?reset=1`) et les échecs Google lus dans l'URL restent.
 * - **Créer** : trois contrôles — l'adresse, le mot de passe (l'œil remplace la confirmation, la
 *   règle reste écrite SOUS le champ pendant la frappe), les conditions. Envoie `{email, password}`
 *   (TCK-2605) ; le prénom est demandé après (`/onboarding/intention`), et la vérification de
 *   l'adresse vient d'abord (`/auth/verify-email`, intention gardée).
 *
 * Google n'y paraît que si la voie téléphone est fermée : la voie e-mail est alors la porte.
 */
export type OngletEmail = 'connexion' | 'creation';

interface VoieEmailProps {
  readonly intention: IntentionAffichee | null;
  /** `?redirect=`, brut : chaque relais l'assainit. */
  readonly redirect: string | null;
  readonly action: ActionDEntree | null;
  readonly ongletInitial: OngletEmail;
  /** La voie téléphone, quand elle est ouverte : « Utiliser plutôt mon numéro ». */
  readonly onTelephone?: () => void;
  readonly erreurOAuth: string | null;
  readonly motDePasseModifie: boolean;
}

export function VoieEmail({ intention, redirect, action, ongletInitial, onTelephone, erreurOAuth, motDePasseModifie }: VoieEmailProps) {
  const t = useTranslations('auth.voieEmail');
  const tPorte = useTranslations('auth.porte');
  const [onglet, setOnglet] = useState<OngletEmail>(ongletInitial);
  const [doubleFacteur, setDoubleFacteur] = useState<{ email: string; password: string } | null>(null);
  const decalage = useDecalageDuClavier();
  const origine = { redirect, action };

  const bien = avecBien(intention) ? intention : null;
  const titreDeLaBarre = useTitreDeLaBarre(bien);
  // « Utiliser plutôt mon numéro » : sous les champs au téléphone (le bouton est posé sur le clavier),
  // sous le bouton au bureau — d'où sa place DANS le formulaire, après le bouton (`BoutonCollant`
  // passe en dernier au téléphone). La cible de 44 px déborde la ligne (`-my-3`) : le texte reste où la
  // maquette le pose.
  const versLeNumero = onTelephone ? (
    <p className={cn('flex items-center justify-center gap-2 text-sm lg:mt-5', onglet === 'creation' ? 'mt-3.5' : 'mt-6')}>
      <Smartphone className="size-4 flex-none text-primary lg:hidden" strokeWidth={1.75} aria-hidden="true" />
      <button
        type="button"
        onClick={onTelephone}
        className="-my-3 min-h-11 rounded-lg font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        {t('utiliserLeNumero')}
      </button>
    </p>
  ) : null;
  const declaration = bien ? (
    <DeclarerEntree
      titreDeBureau={titreDeLaBarre}
      enTete={
        onTelephone ? (
          <BarreDuBien intention={bien} libelleRetour={t('versLeNumero')} onRetour={onTelephone} />
        ) : undefined
      }
      panneau={<PanneauDuBien intention={bien} />}
      retourBureau={<RetourAuth libelle={tPorte('retourALAnnonce')} className="h-9 border border-border bg-card px-3.5 text-foreground hover:bg-muted" />}
    />
  ) : null;

  if (doubleFacteur) {
    return (
      <>
        {declaration}
        <DoubleFacteur identifiants={doubleFacteur} redirect={redirect} onAnnuler={() => setDoubleFacteur(null)} />
      </>
    );
  }

  return (
    <div data-voie-email="">
      {declaration}
      {/* Sous la barre du bien, la maquette pose le titre à 16 px (la coque en laisse 20). */}
      <TitreDEntree className={bien && onTelephone ? 'max-lg:-mt-1' : undefined}>{t('titre')}</TitreDEntree>
      <OngletsSegmentes
        className="mt-4 lg:mt-5"
        libelle={t('titre')}
        actif={onglet}
        onChange={setOnglet}
        onglets={[
          { id: 'connexion', libelle: t('onglets.connexion') },
          { id: 'creation', libelle: t('onglets.creation') },
        ]}
        panneau={(id) =>
          id === 'connexion' ? (
            <FormulaireConnexionEmail
              origine={origine}
              decalage={decalage}
              erreurOAuth={erreurOAuth}
              motDePasseModifie={motDePasseModifie}
              onDoubleFacteur={setDoubleFacteur}
              suite={versLeNumero}
            />
          ) : (
            <FormulaireCreationEmail origine={origine} decalage={decalage} suite={versLeNumero} />
          )
        }
      />
      {/* Sans la voie téléphone, la voie e-mail est la porte : le fournisseur reste joignable. */}
      {onTelephone ? null : <AutresVoies redirect={redirect} className="mt-6" />}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

interface Onglet {
  readonly id: OngletEmail;
  readonly libelle: string;
}

/**
 * Le contrôle segmenté de la maquette (`Segmente`) : une piste `bg-muted` en pilule, l'onglet actif
 * en carte. Onglets ARIA (flèches gauche/droite), le panneau actif seul monté.
 */
function OngletsSegmentes({
  onglets,
  actif,
  onChange,
  libelle,
  panneau,
  className,
}: {
  readonly onglets: readonly Onglet[];
  readonly actif: OngletEmail;
  readonly onChange: (id: OngletEmail) => void;
  readonly libelle: string;
  readonly panneau: (id: OngletEmail) => ReactNode;
  readonly className?: string;
}) {
  const base = useId();
  const refs = useRef<Partial<Record<OngletEmail, HTMLButtonElement | null>>>({});

  function auClavier(evenement: KeyboardEvent<HTMLButtonElement>, index: number) {
    const pas = evenement.key === 'ArrowRight' ? 1 : evenement.key === 'ArrowLeft' ? -1 : 0;
    if (pas === 0) return;
    evenement.preventDefault();
    const suivant = onglets[(index + pas + onglets.length) % onglets.length];
    onChange(suivant.id);
    refs.current[suivant.id]?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={libelle} className="flex rounded-full bg-muted p-1">
        {onglets.map((o, index) => {
          const selectionne = o.id === actif;
          return (
            <button
              key={o.id}
              ref={(el) => {
                refs.current[o.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-onglet-${o.id}`}
              aria-selected={selectionne}
              aria-controls={`${base}-panneau-${o.id}`}
              tabIndex={selectionne ? 0 : -1}
              onClick={() => onChange(o.id)}
              onKeyDown={(e) => auClavier(e, index)}
              className={cn(
                'inline-flex h-10 flex-1 items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
                selectionne
                  ? 'bg-card text-foreground shadow-[0_1px_3px_color-mix(in_oklab,var(--shadow-color)_18%,transparent)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.libelle}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panneau-${actif}`} aria-labelledby={`${base}-onglet-${actif}`}>
        {panneau(actif)}
      </div>
    </div>
  );
}

/** Une icône posée dans le champ, au téléphone (la maquette ne les montre pas au bureau). */
function IconeDeChamp({ icone: I }: { readonly icone: typeof Mail }) {
  return (
    <I
      className="pointer-events-none absolute left-3.5 top-[1.375rem] z-10 size-[18px] -translate-y-1/2 text-muted-foreground lg:hidden"
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}

function BasculeDuMotDePasse({ visible, onClick }: { readonly visible: boolean; readonly onClick: () => void }) {
  const t = useTranslations('auth.voieEmail');
  return (
    <button type="button" onClick={onClick} className={cn(BASCULE_MOT_DE_PASSE, '-mr-1')} aria-label={visible ? t('masquer') : t('afficher')}>
      {visible ? <EyeOff className="size-[18px]" strokeWidth={1.5} /> : <Eye className="size-[18px]" strokeWidth={1.5} />}
    </button>
  );
}

const LIEN = 'font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary';

/* ── J'ai un compte ─────────────────────────────────────────────────────────────────────────── */

function FormulaireConnexionEmail({
  origine,
  decalage,
  erreurOAuth,
  motDePasseModifie,
  onDoubleFacteur,
  suite,
}: {
  readonly origine: { readonly redirect: string | null; readonly action: ActionDEntree | null };
  readonly decalage: number;
  readonly erreurOAuth: string | null;
  readonly motDePasseModifie: boolean;
  readonly onDoubleFacteur: (identifiants: { email: string; password: string }) => void;
  readonly suite: ReactNode;
}) {
  const t = useTranslations('auth.voieEmail');
  const tLogin = useTranslations('auth.login');
  const router = useRouter();
  const locale = useCurrentLocale();
  // TCK-509 — `openSession`, seul chemin vers le cookie et le jeton du contexte.
  const { openSession } = useAuth();
  const [visible, setVisible] = useState(false);
  // TCK-624 — une seule porte de sortie : `/onboarding/intention` juge ce qui manque, puis rend la main.
  const sortie = avecRedirection('/onboarding/intention', origine.redirect);

  const { form, isSubmitting, globalError, handleSubmit } = useApiForm<LoginFormValues, LoginResponse>({
    schema: loginSchema,
    defaultValues: { email: '', password: '' },
    formOptions: { mode: 'onTouched' },
    onSubmit: (values) => login(values, locale),
    onSuccess: async (resultat, values) => {
      if (isTwoFactorChallenge(resultat)) {
        onDoubleFacteur({ email: values.email, password: values.password });
        return;
      }
      await openSession(resultat.token, resultat.user, resultat.expires_at);
      router.push(sortie);
    },
  });

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 flex flex-col lg:mt-6" noValidate>
      {motDePasseModifie ? (
        <div role="status" className="mb-5 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {tLogin('resetSuccess')}
        </div>
      ) : null}
      {erreurOAuth ? <FormGlobalError className="mb-5">{erreurOAuth}</FormGlobalError> : null}
      <FormGlobalError>{globalError}</FormGlobalError>

      <label htmlFor="voie-email-adresse" className="mb-1.5 self-start text-sm font-medium">
        {t('email')}
      </label>
      <div className="relative">
        <IconeDeChamp icone={Mail} />
        <FormInput<LoginFormValues>
          name="email"
          control={form.control}
          id="voie-email-adresse"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          className="max-lg:pl-10"
          required
        />
      </div>

      <div className="mb-1.5 mt-4 flex items-baseline justify-between gap-3">
        <label htmlFor="voie-email-mot-de-passe" className="text-sm font-medium">
          {t('motDePasse')}
        </label>
        <Link href={cheminDEntree('/auth/forgot-password', origine)} className={cn(LIEN, 'text-[13px]')}>
          {t('oublie')}
        </Link>
      </div>
      <div className="relative">
        <IconeDeChamp icone={LockKeyhole} />
        <FormInput<LoginFormValues>
          name="password"
          control={form.control}
          id="voie-email-mot-de-passe"
          type={visible ? 'text' : 'password'}
          autoComplete="current-password"
          className="max-lg:pl-10"
          required
          trailing={<BasculeDuMotDePasse visible={visible} onClick={() => setVisible((v) => !v)} />}
        />
      </div>

      <BoutonCollant decalage={decalage} className="mt-6 max-lg:order-last">
        <Button type="submit" disabled={isSubmitting} className={BOUTON_D_ENTREE}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {tLogin('submitting')}
            </>
          ) : (
            t('seConnecter')
          )}
        </Button>
      </BoutonCollant>
      {suite}
    </form>
  );
}

/* ── Créer un compte ────────────────────────────────────────────────────────────────────────── */

function FormulaireCreationEmail({
  origine,
  decalage,
  suite,
}: {
  readonly origine: { readonly redirect: string | null; readonly action: ActionDEntree | null };
  readonly decalage: number;
  readonly suite: ReactNode;
}) {
  const t = useTranslations('auth.voieEmail');
  const tRegister = useTranslations('auth.register');
  const router = useRouter();
  const { openSession } = useAuth();
  const [visible, setVisible] = useState(false);

  const { form, isSubmitting, globalError, handleSubmit } = useApiForm<RegisterFormValues, Awaited<ReturnType<typeof register>>>({
    schema: registerSchema,
    defaultValues: { email: '', password: '', accept_cgu: false },
    // La règle du mot de passe est écrite sous le champ : l'erreur ne vient qu'à la sortie du champ.
    formOptions: { mode: 'onTouched' },
    // `accept_cgu` reste dans le navigateur : l'API n'attend que l'adresse et le mot de passe.
    onSubmit: ({ email, password }) => register({ email, password }),
    onSuccess: async ({ token, user, expires_at: expiresAt }) => {
      // TCK-589 — jamais sans jeton : `set-token` reçu vide EFFACE le cookie.
      if (!token) {
        router.push(cheminDEntree('/auth/login', origine, { voie: 'email' }));
        return;
      }
      await openSession(token, user, expiresAt);
      router.push(cheminDEntree('/auth/verify-email', origine));
    },
  });

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 flex flex-col lg:mt-6" noValidate>
      <FormGlobalError>{globalError}</FormGlobalError>

      <label htmlFor="voie-email-nouvelle-adresse" className="mb-1.5 self-start text-sm font-medium">
        {t('email')}
      </label>
      <div className="relative">
        <IconeDeChamp icone={Mail} />
        <FormInput<RegisterFormValues>
          name="email"
          control={form.control}
          id="voie-email-nouvelle-adresse"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          className="max-lg:pl-10"
          required
        />
      </div>

      <label htmlFor="voie-email-nouveau-mot-de-passe" className="mb-1.5 mt-4 self-start text-sm font-medium">
        {t('motDePasse')}
      </label>
      <div className="relative">
        <IconeDeChamp icone={LockKeyhole} />
        {/* Sans argument de type écrit : il se déduit de `control`, et `<FormInput<…>` cachait la balise au
            relevé des classes (check:classes-emises lisait l'`aria-describedby` comme deux classes). */}
        <FormInput
          name="password"
          control={form.control}
          id="voie-email-nouveau-mot-de-passe"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          className="max-lg:pl-10"
          aria-describedby="voie-email-regle voie-email-nouveau-mot-de-passe-error"
          required
          trailing={<BasculeDuMotDePasse visible={visible} onClick={() => setVisible((v) => !v)} />}
        />
      </div>
      {/* La règle, PERMANENTE sous le champ (plus en `placeholder`, qui disparaît à la première lettre). */}
      <p id="voie-email-regle" className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
        {t('regle')}
      </p>

      <div className="mt-4">
        <FormCheckbox<RegisterFormValues>
          name="accept_cgu"
          control={form.control}
          required
          label={tRegister.rich('acceptTerms', {
            terms: (chunks) => (
              <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" rel="noopener" className="text-foreground underline underline-offset-2">
                {chunks}
              </LienLocalise>
            ),
            privacy: (chunks) => (
              <LienLocalise href={ROUTES_LEGALES.privacy} target="_blank" rel="noopener" className="text-foreground underline underline-offset-2">
                {chunks}
              </LienLocalise>
            ),
          })}
        />
      </div>
      {/* Deux phrases, comme la maquette : la plus courte tient sur une ligne au téléphone. */}
      <p className="mt-3 text-[13px] leading-snug text-muted-foreground lg:mt-4">
        <span className="lg:hidden">{t('prenomEnsuiteCourt')}</span>
        <span className="max-lg:hidden">{t('prenomEnsuite')}</span>
      </p>

      <BoutonCollant decalage={decalage} className="mt-6 max-lg:order-last">
        <Button type="submit" disabled={isSubmitting} className={BOUTON_D_ENTREE}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {tRegister('submitting')}
            </>
          ) : (
            t('creer')
          )}
        </Button>
      </BoutonCollant>
      {suite}
    </form>
  );
}

/* ── Second facteur ─────────────────────────────────────────────────────────────────────────── */

/**
 * TCK-069 — après le mot de passe, le code de l'application ou un code de récupération ; le
 * formulaire renvoie les identifiants avec le code. « Annuler » revient au mot de passe.
 */
function DoubleFacteur({
  identifiants,
  redirect,
  onAnnuler,
}: {
  readonly identifiants: { readonly email: string; readonly password: string };
  readonly redirect: string | null;
  readonly onAnnuler: () => void;
}) {
  const t2fa = useTranslations('auth.twoFactorChallenge');
  const messageErreur = useMessageErreurApi();
  const router = useRouter();
  const locale = useCurrentLocale();
  const { openSession } = useAuth();
  const [recuperation, setRecuperation] = useState(false);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function envoyer(evenement: React.FormEvent) {
    evenement.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const resultat = await login(
        { ...identifiants, ...(recuperation ? { recovery_code: code } : { two_factor_code: code }) },
        locale,
      );
      if (isTwoFactorChallenge(resultat)) {
        setErreur(resultat.message ?? t2fa('invalidCode'));
        return;
      }
      await openSession(resultat.token, resultat.user, resultat.expires_at);
      router.push(avecRedirection('/onboarding/intention', redirect));
    } catch (err) {
      setErreur(messageErreur(err, t2fa('invalidCode')));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div>
      <TitreDEntree sous={recuperation ? t2fa('recoveryIntro') : t2fa('appIntro')}>{t2fa('title')}</TitreDEntree>
      {erreur ? <FormGlobalError className="mt-5">{erreur}</FormGlobalError> : null}
      <form onSubmit={(e) => void envoyer(e)} className="mt-6 space-y-5">
        <div>
          <label htmlFor="two-factor-code" className="mb-1.5 block text-sm font-medium">
            {recuperation ? t2fa('recoveryLabel') : t2fa('codeLabel')}
          </label>
          <Input
            id="two-factor-code"
            value={code}
            onChange={(e) =>
              setCode(recuperation ? e.target.value.toUpperCase().slice(0, 11) : e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            inputMode={recuperation ? 'text' : 'numeric'}
            pattern={recuperation ? undefined : '\\d{6}'}
            autoComplete="one-time-code"
            placeholder={recuperation ? t2fa('recoveryPlaceholder') : t2fa('codePlaceholder')}
            className="tabular-nums tracking-widest"
            required
          />
        </div>
        <Button type="submit" disabled={envoi || code.length < (recuperation ? 11 : 6)} className={BOUTON_D_ENTREE}>
          {envoi ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t2fa('verifying')}
            </>
          ) : (
            t2fa('verify')
          )}
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between gap-2 text-sm">
        <button
          type="button"
          className="-ml-2 min-h-11 rounded-lg px-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
          onClick={() => {
            setRecuperation((v) => !v);
            setCode('');
            setErreur(null);
          }}
        >
          {recuperation ? t2fa('useApp') : t2fa('useRecovery')}
        </button>
        <button
          type="button"
          className="-mr-2 min-h-11 rounded-lg px-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
          onClick={onAnnuler}
        >
          {t2fa('cancel')}
        </button>
      </div>
    </div>
  );
}
