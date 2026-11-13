'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { updateContactPreferencesAction, type PreferencesDeContact } from '@/app/actions/contact-preferences';
import { CasesDuCode, LONGUEUR_DU_CODE } from '@/components/auth/CasesDuCode';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { useEntreeParTelephone } from '@/components/auth/useEntreeParTelephone';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/context/AuthContext';
import type { AuthResponse } from '@/lib/auth';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { formaterTelephone, numeroComposable } from '@/lib/phone';

/**
 * TCK-2601 — la feuille de compte SANS compte (`/publish`, ADR-0093) : le numéro, le code, le prénom et
 * le nom, puis l'annonce en ligne. L'entrée est celle de la porte (`useEntreeParTelephone`) : code
 * faux, numéro refusé (422), trop de demandes (429), verrou (423), compte suspendu, conditions d'un
 * compte né du Radar, second facteur, code affiché hors production, renvoi au rebours, changer de
 * numéro — tous servis ici, dans la feuille.
 *
 * Le code se vérifie au geste « Publier mon annonce », qui porte aussi le prénom et le nom : la
 * session s'ouvre (`openSession`), puis le profil s'écrit, puis l'assistant publie (`onPublier`).
 *
 * ⚠ Avant le code, rien ne dit si le numéro a déjà un compte (l'API répond pareil). Le prénom, le nom
 * et la case WhatsApp sont donc demandés à tous, mais seul ce qui MANQUE au compte rendu par la
 * vérification s'écrit : un compte existant ne voit jamais son nom ni sa réponse WhatsApp réécrits.
 */
interface FeuilleSansCompteProps {
  readonly ouverte: boolean;
  readonly onFermer: () => void;
  readonly rappel: ReactNode;
  /** L'assistant écrit (espace, création, photos, publication) : le bouton attend. */
  readonly envoi: boolean;
  /** Le drapeau `phone_login` s'est éteint entre l'affichage et l'envoi (404) : la voie e-mail. */
  readonly onEmail: () => void;
  readonly onPublier: () => void | Promise<void>;
}

type Compte = AuthResponse['user'];

/** Ce que le compte rendu par la vérification n'a pas encore — et rien d'autre. */
export function profilAEcrire(compte: Partial<Compte>, saisie: { prenom: string; nom: string; whatsapp: boolean }): PreferencesDeContact {
  return {
    ...(!compte.first_name?.trim() && saisie.prenom.trim() ? { first_name: saisie.prenom.trim() } : {}),
    ...(!compte.last_name?.trim() && saisie.nom.trim() ? { last_name: saisie.nom.trim() } : {}),
    ...(compte.phone_whatsapp === null || compte.phone_whatsapp === undefined ? { phone_whatsapp: saisie.whatsapp } : {}),
  };
}

export function FeuilleSansCompte({ ouverte, onFermer, rappel, envoi, onEmail, onPublier }: FeuilleSansCompteProps) {
  const t = useTranslations('property.wizard.feuille');
  const tContact = useTranslations('property.form.publishContact');
  const tEntree = useTranslations('auth.phoneLogin');
  const t2fa = useTranslations('auth.twoFactorChallenge');
  const { setUser } = useAuth();

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [whatsapp, setWhatsapp] = useState(false);
  // La session ouverte par le code : un second geste ne revérifie pas un code consommé, il rejoue la suite.
  const [compte, setCompte] = useState<Compte | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function continuer(rendu: Compte) {
    setErreur(null);
    setEnCours(true);
    try {
      const profil = profilAEcrire(rendu, { prenom, nom, whatsapp });
      if (Object.keys(profil).length > 0) {
        const r = await updateContactPreferencesAction(profil);
        if (!r.ok) {
          setErreur(r.message);
          return;
        }
        setUser(r.user);
        setCompte(r.user as Compte);
      }
      await onPublier();
    } finally {
      setEnCours(false);
    }
  }

  const entree = useEntreeParTelephone({
    auSixiemeChiffre: false,
    onEmail,
    onConnecte: async (_nouveau, rendu) => {
      setCompte(rendu);
      await continuer(rendu);
    },
  });

  const occupe = enCours || envoi || entree.envoi;
  const nomsPrets = prenom.trim() !== '' && nom.trim() !== '';
  const message = erreur ?? entree.erreur;

  let pied: ReactNode;
  if (compte) {
    pied = (
      <Button type="button" className="w-full md:w-auto" disabled={occupe} onClick={() => void continuer(compte)}>
        {t('publier')}
      </Button>
    );
  } else if (entree.etape === 'numero') {
    pied = (
      <Button type="button" className="w-full md:w-auto" disabled={occupe || !numeroComposable(entree.telephone)} onClick={() => void entree.envoyerCode()}>
        {entree.envoi ? tEntree('sending') : tContact('sendCode')}
      </Button>
    );
  } else if (entree.etape === 'code') {
    pied = (
      <Button
        type="button"
        className="w-full md:w-auto"
        disabled={occupe || entree.code.length !== LONGUEUR_DU_CODE || !nomsPrets}
        onClick={() => void entree.verifier(false)}
      >
        {t('publier')}
      </Button>
    );
  } else if (entree.etape === 'conditions') {
    pied = (
      <Button type="button" className="w-full md:w-auto" disabled={occupe || !entree.caseConditions} onClick={entree.accepterConditions}>
        {tEntree('termsContinue')}
      </Button>
    );
  } else {
    pied = (
      <Button
        type="button"
        className="w-full md:w-auto"
        disabled={occupe || entree.secondFacteur.length < (entree.codeDeSecours ? 11 : 6)}
        onClick={() => void entree.verifier(true)}
      >
        {t2fa('verify')}
      </Button>
    );
  }

  const lienSecondaire =
    'min-h-11 rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:no-underline';
  const renvoi = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button type="button" className={`-ml-2 ${lienSecondaire}`} disabled={occupe || entree.attente > 0} onClick={() => void entree.envoyerCode()}>
        {entree.attente > 0 ? tEntree('resendIn', { seconds: entree.attente }) : tEntree('resend')}
      </button>
    </div>
  );

  return (
    <FeuilleDuBas
      open={ouverte}
      onOpenChange={(suivante) => {
        if (!suivante && !occupe) onFermer();
      }}
      titre={t('titre')}
      pied={
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row-reverse">
          {pied}
          <Button type="button" variant="ghost" className="w-full md:w-auto" disabled={occupe} onClick={onFermer}>
            {t('revenir')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5" data-feuille-sans-compte="">
        <div className="rounded-xl border border-border bg-background p-3">{rappel}</div>

        {entree.etape === 'numero' && !compte ? (
          <section className="space-y-3">
            <h3 className="font-display text-base font-semibold text-foreground">{t('numeroTitre')}</h3>
            <p className="text-sm text-muted-foreground text-pretty">{t('numeroTexteSansCompte')}</p>
            <label htmlFor="feuille-telephone" className="sr-only">
              {tContact('phoneLabel')}
            </label>
            <PhoneInput id="feuille-telephone" value={entree.telephone} onValueChange={entree.setTelephone} autoComplete="tel-national" disabled={occupe} />
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={whatsapp}
                disabled={occupe}
                onChange={(e) => setWhatsapp(e.target.checked)}
                className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
              />
              {tContact('whatsapp')}
            </label>
            {/* TCK-624 — le premier code d'un numéro inconnu ouvre un compte : la mention est montrée avant. */}
            <p className="text-xs text-muted-foreground text-pretty" data-testid="phrase-cgu-feuille">
              {tEntree.rich('termsNotice', {
                terms: (morceau) => (
                  <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" rel="noopener" className="underline underline-offset-2">
                    {morceau}
                  </LienLocalise>
                ),
                privacy: (morceau) => (
                  <LienLocalise href={ROUTES_LEGALES.privacy} target="_blank" rel="noopener" className="underline underline-offset-2">
                    {morceau}
                  </LienLocalise>
                ),
              })}
            </p>
          </section>
        ) : null}

        {entree.etape === 'code' && !compte ? (
          <section className="space-y-3">
            <p className="text-sm text-foreground">
              {t('codeEnvoyeAu', { phone: formaterTelephone(entree.telephone) })}{' '}
              <button
                type="button"
                disabled={occupe}
                onClick={entree.revenirAuNumero}
                className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary disabled:text-muted-foreground disabled:no-underline"
              >
                {t('modifier')}
              </button>
            </p>
            <label htmlFor="feuille-code" className="sr-only">
              {tContact('codeAria')}
            </label>
            <CasesDuCode id="feuille-code" valeur={entree.code} onChange={entree.saisirCode} erreur={entree.codeRefuse} figee={occupe} />
            <CodeDePreproduction code={entree.apercu} onUtiliser={entree.saisirCode} />
            {renvoi}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="feuille-prenom" className="text-xs font-semibold text-muted-foreground">
                  {tContact('firstNameLabel')}
                </label>
                <Input id="feuille-prenom" value={prenom} maxLength={100} autoComplete="given-name" disabled={occupe} onChange={(e) => setPrenom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label htmlFor="feuille-nom" className="text-xs font-semibold text-muted-foreground">
                  {tContact('lastNameLabel')}
                </label>
                <Input id="feuille-nom" value={nom} maxLength={100} autoComplete="family-name" disabled={occupe} onChange={(e) => setNom(e.target.value)} />
              </div>
            </div>
          </section>
        ) : null}

        {entree.etape === 'conditions' && !compte ? (
          <section className="space-y-3">
            <h3 className="font-display text-base font-semibold text-foreground">{tEntree('termsTitle')}</h3>
            <p className="text-sm text-muted-foreground text-pretty">{tEntree('termsIntro')}</p>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={entree.caseConditions}
                disabled={occupe}
                onChange={(e) => entree.setCaseConditions(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-input accent-primary"
              />
              <span className="text-pretty">
                {tEntree.rich('termsAccept', {
                  terms: (morceau) => (
                    <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" rel="noopener" className="font-medium text-primary underline-offset-4 hover:underline">
                      {morceau}
                    </LienLocalise>
                  ),
                })}
              </span>
            </label>
            {renvoi}
          </section>
        ) : null}

        {entree.etape === 'double-facteur' && !compte ? (
          <section className="space-y-3">
            <h3 className="font-display text-base font-semibold text-foreground">{t2fa('title')}</h3>
            <p className="text-sm text-muted-foreground text-pretty">{entree.codeDeSecours ? t2fa('recoveryIntro') : t2fa('appIntro')}</p>
            <label htmlFor="feuille-second-facteur" className="block text-sm font-medium">
              {entree.codeDeSecours ? t2fa('recoveryLabel') : t2fa('codeLabel')}
            </label>
            <Input
              id="feuille-second-facteur"
              value={entree.secondFacteur}
              onChange={(e) =>
                entree.setSecondFacteur(
                  entree.codeDeSecours ? e.target.value.toUpperCase().slice(0, 11) : e.target.value.replace(/\D/g, '').slice(0, 6),
                )
              }
              inputMode={entree.codeDeSecours ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              placeholder={entree.codeDeSecours ? t2fa('recoveryPlaceholder') : t2fa('codePlaceholder')}
              className="tabular-nums tracking-widest"
            />
            <button type="button" className={`-ml-2 ${lienSecondaire}`} onClick={entree.basculerCodeDeSecours}>
              {entree.codeDeSecours ? t2fa('useApp') : t2fa('useRecovery')}
            </button>
          </section>
        ) : null}

        {message ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : null}
      </div>
    </FeuilleDuBas>
  );
}
