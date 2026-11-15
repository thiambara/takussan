'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { updateContactPreferencesAction, type PreferencesDeContact } from '@/app/actions/contact-preferences';
import { BOUTON_D_ENTREE } from '@/components/auth/BoutonCollant';
import { CasesDuCode, LONGUEUR_DU_CODE } from '@/components/auth/CasesDuCode';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { useEntreeParTelephone } from '@/components/auth/useEntreeParTelephone';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { fieldDensityScope } from '@/components/ui/field-density';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/context/AuthContext';
import type { AuthResponse } from '@/lib/auth';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { formaterTelephone, numeroComposable } from '@/lib/phone';
import { cn } from '@/lib/utils';

import { CadreDeLaFeuille, usePanneauDeBureau } from './CadreDeLaFeuille';
import { ContinuerAvecGoogle } from './ContinuerAvecGoogle';

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
  /** TCK-2601 (AC5) — la colonne de l'assistant où la feuille devient panneau dès 1280 px. */
  readonly cible?: HTMLElement | null;
  /**
   * TCK-2777 — écrit l'annonce dans ce navigateur avant le départ chez Google. Absent (l'annonce ne
   * survivrait pas à la navigation : brouillon en mémoire), « Continuer avec Google » ne paraît pas.
   */
  readonly avantLeDepartGoogle?: () => Promise<boolean>;
  /** TCK-2777 — rouverte après un aller-retour Google annulé ou refusé : ce qu'elle dit d'abord. */
  readonly alerte?: string | null;
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

export function FeuilleSansCompte({
  ouverte, onFermer, rappel, envoi, onEmail, onPublier, cible = null, avantLeDepartGoogle, alerte = null,
}: FeuilleSansCompteProps) {
  const t = useTranslations('property.wizard.feuille');
  const tContact = useTranslations('property.form.publishContact');
  const tEntree = useTranslations('auth.phoneLogin');
  const t2fa = useTranslations('auth.twoFactorChallenge');
  const tPorte = useTranslations('auth.porte');
  const { setUser } = useAuth();
  const bureau = usePanneauDeBureau(cible);

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [whatsapp, setWhatsapp] = useState(false);
  // La session ouverte par le code : un second geste ne revérifie pas un code consommé, il rejoue la suite.
  const [compte, setCompte] = useState<Compte | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // TCK-2777 — le départ chez Google : la feuille se fige jusqu'à la navigation (ou son échec).
  const [depart, setDepart] = useState(false);

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

  const occupe = enCours || envoi || entree.envoi || depart;
  const nomsPrets = prenom.trim() !== '' && nom.trim() !== '';
  const message = erreur ?? entree.erreur ?? (entree.etape === 'numero' ? alerte : null);

  // Le geste des écrans d'entrée (48 px, pilule — maquette a-6 / a-7), à sa largeur dès `md`.
  const GESTE = cn(BOUTON_D_ENTREE, 'md:w-auto');
  let pied: ReactNode;
  if (compte) {
    pied = (
      <Button type="button" className={GESTE} disabled={occupe} onClick={() => void continuer(compte)}>
        {t('publier')}
      </Button>
    );
  } else if (entree.etape === 'numero') {
    pied = (
      <>
        <Button type="button" className={GESTE} disabled={occupe || !numeroComposable(entree.telephone)} onClick={() => void entree.envoyerCode()}>
          {entree.envoi ? tEntree('sending') : tContact('sendCode')}
        </Button>
        {/*
          TCK-2777 — maquette a-6 : discret, secondaire au numéro. Au téléphone, une ligne de 44 px centrée
          sous « Recevoir un code » ; dans le panneau du bureau, à côté du geste (la rangée `gap-4`).
        */}
        {avantLeDepartGoogle ? (
          <ContinuerAvecGoogle
            occupe={occupe}
            avantLeDepart={avantLeDepartGoogle}
            surDepart={(enCours) => {
              if (enCours) setErreur(null);
              setDepart(enCours);
            }}
            surEchec={setErreur}
            // Dans la rangée du panneau latéral (`md`, avant 1280), centrée sur la hauteur du geste, sans marge.
            className={bureau ? undefined : 'self-center max-md:mt-1'}
          />
        ) : null}
      </>
    );
  } else if (entree.etape === 'code') {
    pied = (
      <Button
        type="button"
        className={GESTE}
        disabled={occupe || entree.code.length !== LONGUEUR_DU_CODE || !nomsPrets}
        onClick={() => void entree.verifier(false)}
      >
        {t('publier')}
      </Button>
    );
  } else if (entree.etape === 'conditions') {
    pied = (
      <Button type="button" className={GESTE} disabled={occupe || !entree.caseConditions} onClick={entree.accepterConditions}>
        {tEntree('termsContinue')}
      </Button>
    );
  } else {
    pied = (
      <Button
        type="button"
        className={GESTE}
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
    <CadreDeLaFeuille
      ouverte={ouverte}
      onFermer={onFermer}
      occupe={occupe}
      bureau={bureau}
      cible={cible}
      // Maquette a-6 / a-7 : « Dernière étape : votre numéro » en titre de la feuille, aux deux états.
      titre={t('titreDuPanneau')}
      titreDuPanneau={t('titreDuPanneau')}
      rappel={rappel}
      action={pied}
      mention={
        entree.etape === 'code' && !compte ? (
          <p className="text-xs leading-relaxed text-muted-foreground text-pretty" data-testid="mention-publication">
            {t.rich('mention', {
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
        ) : null
      }
      // « Gratuit, sans commission » n'est pas écrit : la commission dépend de l'abonnement de
      // l'espace qui publiera (plan `pro` à 3 %, dérogation du super-admin), inconnu avant le code.
      assurances={[t('assurances.motDePasse'), t('assurances.retirable')]}
    >
      <div className="space-y-5" data-feuille-sans-compte="">
        {entree.etape === 'numero' && !compte ? (
          <section>
            <p className="text-corps leading-snug text-muted-foreground text-pretty">{t('numeroTexteSansCompte')}</p>
            {/* Le titre de la feuille dit « votre numéro » ; le champ garde son libellé visible (maquette a-6). */}
            <label htmlFor="feuille-telephone" className="mt-5 mb-1.5 block w-fit text-sm font-medium text-foreground">
              {tPorte('numero')}
            </label>
            <PhoneInput
              id="feuille-telephone"
              value={entree.telephone}
              onValueChange={entree.setTelephone}
              autoComplete="tel-national"
              aideNationale={tPorte('aideIndicatif')}
              // Au bureau, le champ des écrans d'entrée (indicatif et saisie à 16 px, aide à 13 px — maquette
              // a-6, comme la porte TCK-2604) ; au téléphone, le champ courant de 44 px (la maquette n'y
              // dessine pas le grand champ de la porte).
              taille={bureau ? 'grand' : 'normal'}
              className="h-11"
              disabled={occupe}
            />
            {/* La case de 18 px (ui/checkbox) ; la ligne qui la porte fait la cible de 44 px sans pousser le reste. */}
            <label className="mt-1 -mb-3 flex cursor-pointer items-start gap-3 py-3 text-sm leading-snug text-foreground">
              <Checkbox checked={whatsapp} disabled={occupe} onCheckedChange={(coche) => setWhatsapp(coche === true)} className="mt-px" />
              <span>{tContact('whatsapp')}</span>
            </label>
            {/* TCK-624 — le premier code d'un numéro inconnu ouvre un compte : la mention est montrée avant. */}
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground text-pretty" data-testid="phrase-cgu-feuille">
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
          <section>
            <p className="text-corps text-muted-foreground">
              {t.rich('codeEnvoyeAu', {
                // « 77 123 45 67 » : l'indicatif du Sénégal se tait, comme dans le champ et à la porte (TCK-2604).
                phone: formaterTelephone(entree.telephone).replace(/^\+221 /, ''),
                b: (morceau) => <span className="font-semibold text-foreground tabular-nums">{morceau}</span>,
              })}{' '}
              ·{' '}
              <button
                type="button"
                disabled={occupe}
                onClick={entree.revenirAuNumero}
                className="leading-[1.25rem] font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary disabled:text-muted-foreground disabled:no-underline"
              >
                {t('modifier')}
              </button>
            </p>
            <label htmlFor="feuille-code" className="sr-only">
              {tContact('codeAria')}
            </label>
            <CasesDuCode id="feuille-code" className="mt-4 justify-start" valeur={entree.code} onChange={entree.saisirCode} erreur={entree.codeRefuse} figee={occupe} />
            <CodeDePreproduction code={entree.apercu} onUtiliser={entree.saisirCode} />
            {/* « Renvoyer le code dans 54 s » : une ligne de 13 px (maquette a-7), la cible de 44 px sans pousser. */}
            <p className="mt-3 text-ui text-muted-foreground tabular-nums">
              <button
                type="button"
                className="-my-3 min-h-11 rounded-lg font-medium tabular-nums enabled:text-primary enabled:underline enabled:decoration-primary/40 enabled:underline-offset-4 disabled:font-normal disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
                disabled={occupe || entree.attente > 0}
                onClick={() => void entree.envoyerCode()}
              >
                {entree.attente > 0 ? tEntree('resendIn', { seconds: entree.attente }) : tEntree('resend')}
              </button>
            </p>
            {/* Prénom ET nom côte à côte (décision 1a), libellés visibles, et ce qu'ils deviennent dessous. */}
            {/* La hauteur des champs vient de la portée de densité (44 px, 39,6 au bureau) — jamais de l'appelant (TCK-2460). */}
            <div className="mt-6 grid grid-cols-2 gap-3" {...fieldDensityScope()}>
              <div>
                <label htmlFor="feuille-prenom" className="mb-1.5 block w-fit text-sm font-medium text-foreground">
                  {tContact('firstNameLabel')}
                </label>
                <Input id="feuille-prenom" className="lg:text-action" value={prenom} maxLength={100} autoComplete="given-name" disabled={occupe} onChange={(e) => setPrenom(e.target.value)} />
              </div>
              <div>
                <label htmlFor="feuille-nom" className="mb-1.5 block w-fit text-sm font-medium text-foreground">
                  {tContact('lastNameLabel')}
                </label>
                <Input id="feuille-nom" className="lg:text-action" value={nom} maxLength={100} autoComplete="family-name" disabled={occupe} onChange={(e) => setNom(e.target.value)} />
              </div>
            </div>
            <p className="mt-1.5 text-ui leading-snug text-muted-foreground">{t('nomsAide')}</p>
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
    </CadreDeLaFeuille>
  );
}
