'use client';

import { useTranslations } from 'next-intl';
import { Check, Loader2, Timer } from 'lucide-react';

import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { DeclarerEntree } from '@/components/entree/CoqueDEntree';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { FormGlobalError } from '@/components/forms';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { formaterTelephone, numeroComposable } from '@/lib/phone';

import { AutresVoies } from './AutresVoies';
import { BOUTON_D_ENTREE, BoutonCollant } from './BoutonCollant';
import { CasesDuCode, LONGUEUR_DU_CODE } from './CasesDuCode';
import { BarreDuBien, EnTeteDuBien, PanneauDeReprise, PanneauDuBien, avecBien, useTitreDeLaBarre, type IntentionAffichee } from './IntentionDEntree';
import { RetourAuth } from './RetourAuth';
import { useEntreeParTelephone } from './useEntreeParTelephone';

/**
 * TCK-589 — connexion et inscription par numéro de téléphone (ADR-0033), en trois temps :
 * le numéro, le code reçu par SMS, et — si le compte en a un — le second facteur.
 *
 * ⚠ **Le texte ne dit jamais si un compte existe** : l'API répond pareil, l'écran aussi — un seul
 * titre, un seul bouton (TCK-2604 : plus de variante « inscription »), et c'est la vérification du
 * code qui ouvre la session, ou crée le compte (`is_new_account`).
 *
 * TCK-2404 — le compte que le Radar a ouvert pour ce numéro se voit présenter les conditions
 * (`requires_terms`, article 6.3 des CGU) avant d'entrer, et avant le second facteur : leur version
 * acceptée accompagne ensuite le même code SMS.
 *
 * TCK-2604 — une seule porte, surmontée de ce que le visiteur était en train de faire (maquette
 * `app-entree-connexion`, approche a) : la photo du bien quitté en tête au téléphone, le bien à
 * gauche au bureau ; le numéro en grand ; Google et l'e-mail sur une ligne ; « Recevoir un code »
 * collé au-dessus du clavier ; six cases pour le code, envoyé au sixième chiffre.
 */
interface ConnexionParTelephoneProps {
  /** Session ouverte ; `true` quand le compte vient d'être créé par ce code. */
  readonly onConnecte: (nouveauCompte: boolean) => void;
  /** La voie « e-mail et mot de passe ». */
  readonly onEmail: () => void;
  /** Ce que le visiteur faisait (`?intention=`), et le bien quitté quand il y en a un. */
  readonly intention?: IntentionAffichee | null;
  /** La destination d'origine, mémorisée avant de partir chez un fournisseur OAuth. */
  readonly redirect?: string | null;
  /** Le retour d'un échec OAuth, déjà traduit : il propose le numéro, la voie affichée. */
  readonly erreurOAuth?: string | null;
}

const CLASSE_LIEN_SECONDAIRE =
  'min-h-11 rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:no-underline';

const CLASSE_LIEN_EN_LIGNE = 'font-medium text-primary underline decoration-primary/40 underline-offset-4';

/** « 77 123 45 67 » : l'indicatif du Sénégal se tait, comme dans le champ ; un numéro étranger le garde. */
function numeroAffiche(telephone: string): string {
  return formaterTelephone(telephone).replace(/^\+221 /, '');
}

export function ConnexionParTelephone({ onConnecte, onEmail, intention = null, redirect = null, erreurOAuth = null }: ConnexionParTelephoneProps) {
  const t = useTranslations('auth.phoneLogin');
  const t2fa = useTranslations('auth.twoFactorChallenge');
  const tPorte = useTranslations('auth.porte');
  const {
    etape,
    telephone,
    setTelephone,
    code,
    saisirCode,
    codeRefuse,
    secondFacteur,
    setSecondFacteur,
    codeDeSecours,
    basculerCodeDeSecours,
    attente,
    apercu,
    envoi,
    erreur,
    caseConditions,
    setCaseConditions,
    envoyerCode,
    verifier,
    accepterConditions,
    revenirAuNumero,
  } = useEntreeParTelephone({ onConnecte: (nouveauCompte) => onConnecte(nouveauCompte), onEmail });
  const decalage = useDecalageDuClavier();

  // Le renvoi du code et le changement de numéro : à l'étape du code, et à celle des conditions (TCK-2404, I2), où un
  // code peut expirer pendant la lecture.
  const liensDuCode = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        className={`-ml-2 ${CLASSE_LIEN_SECONDAIRE}`}
        disabled={envoi || attente > 0}
        onClick={() => void envoyerCode()}
      >
        {attente > 0 ? t('resendIn', { seconds: attente }) : t('resend')}
      </button>
      <button
        type="button"
        className={`-mr-2 ${CLASSE_LIEN_SECONDAIRE} text-muted-foreground`}
        onClick={revenirAuNumero}
      >
        {t('changeNumber')}
      </button>
    </div>
  );

  const bien = avecBien(intention) ? intention : null;
  const retourALAnnonce = tPorte('retourALAnnonce');
  const titreDeLAction = intention ? tPorte(`actions.${intention.action}.titre`) : undefined;
  const titreDeLaBarre = useTitreDeLaBarre(bien);

  // Ce que la coque montre autour : la photo du bien et sa pastille de retour à l'écran du numéro,
  // la barre du bien et la reprise ensuite. Une action sans bien : son nom dans la barre, rien de plus.
  const declaration = bien ? (
    <DeclarerEntree
      titreDeBureau={titreDeLaBarre}
      enTete={
        etape === 'numero' ? (
          <EnTeteDuBien intention={bien} retour={<RetourAuth forme="fleche" surPhoto libelle={retourALAnnonce} />} />
        ) : (
          <BarreDuBien intention={bien} libelleRetour={t('changeNumber')} onRetour={revenirAuNumero} />
        )
      }
      panneau={etape === 'numero' ? <PanneauDuBien intention={bien} /> : <PanneauDeReprise intention={bien} telephone={numeroAffiche(telephone)} />}
      retourBureau={<RetourAuth libelle={retourALAnnonce} className="h-9 border border-border bg-card px-3.5 text-foreground hover:bg-muted" />}
    />
  ) : titreDeLAction ? (
    <DeclarerEntree titre={titreDeLAction} />
  ) : null;

  const enTeteDeLEtape =
    etape === 'numero' ? (
      // Sous la photo du bien, la maquette pose le titre à 16 px ; sous une barre, à 20 (la coque).
      <div className={avecBien(intention) ? 'max-lg:-mt-1' : undefined}>
        <h1 className="font-display text-[28px] font-semibold leading-[1.12] tracking-[-0.025em] text-balance lg:text-[36px] lg:leading-[1.08]">
          {tPorte('titre')}
        </h1>
        <p className="mt-2 text-[15px] leading-normal text-muted-foreground text-pretty lg:mt-3 lg:text-[17px]">{tPorte('sousTitre')}</p>
      </div>
    ) : etape === 'code' ? (
      <div>
        <h1 className="font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] lg:text-[32px] lg:leading-[1.1]">
          {tPorte.rich('code.titre', {
            phone: numeroAffiche(telephone),
            numero: (chunks) => (
              <>
                <br />
                <span className="tabular-nums">{chunks}</span>
              </>
            ),
          })}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {tPorte('code.pasLeBon')}{' '}
          <button type="button" onClick={revenirAuNumero} className={`${CLASSE_LIEN_EN_LIGNE} rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring`}>
            {tPorte('code.modifier')}
          </button>
        </p>
      </div>
    ) : (
      <div>
        <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">
          {etape === 'double-facteur' ? t2fa('title') : t('termsTitle')}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-8">
          {etape === 'conditions' ? t('termsIntro') : codeDeSecours ? t2fa('recoveryIntro') : t2fa('appIntro')}
        </p>
      </div>
    );

  const message = erreur ?? (etape === 'numero' ? erreurOAuth : null);

  return (
    <div>
      {declaration}
      {enTeteDeLEtape}

      {message && etape !== 'code' ? <FormGlobalError className={etape === 'numero' ? 'mt-5' : undefined}>{message}</FormGlobalError> : null}

      {etape === 'numero' ? (
        <form
          // DOM : le champ, les conditions, le bouton, puis les autres voies — l'ordre du bureau et de
          // la tabulation. Au téléphone, les voies remontent sous le champ et le bouton se colle en
          // bas (`order`), comme la maquette.
          className="mt-4 flex flex-col lg:mt-7"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void envoyerCode();
          }}
        >
          <label htmlFor="connexion-telephone" className="mb-1.5 block w-fit text-sm font-medium max-lg:sr-only">
            {tPorte('numero')}
          </label>
          <div className="relative">
            <PhoneInput
              id="connexion-telephone"
              value={telephone}
              onValueChange={setTelephone}
              autoComplete="tel-national"
              taille="grand"
              aideNationale={tPorte('aideIndicatif')}
              placeholder={tPorte('exempleNumero')}
              className="h-11 max-lg:pr-12"
              required
            />
            {numeroComposable(telephone) ? (
              <span className="absolute right-4 top-4 inline-flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground lg:hidden">
                <Check className="size-3.5" strokeWidth={3} aria-label={tPorte('numeroComplet')} />
              </span>
            ) : null}
          </div>
          {/* TCK-624 — la connexion par téléphone ouvre un compte au premier code d'un numéro
              inconnu : la mention des conditions est montrée avant. */}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground text-pretty max-lg:order-2 lg:mt-4">
            {t.rich('termsNotice', {
              terms: (chunks) => (
                <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">
                  {chunks}
                </LienLocalise>
              ),
              privacy: (chunks) => (
                <LienLocalise href={ROUTES_LEGALES.privacy} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">
                  {chunks}
                </LienLocalise>
              ),
            })}
          </p>
          <BoutonCollant decalage={decalage} className="max-lg:order-3 max-lg:mt-4 lg:mt-6">
            <Button
              type="submit"
              disabled={envoi || !numeroComposable(telephone)}
              className={BOUTON_D_ENTREE}
            >
              {envoi ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('sending')}
                </>
              ) : (
                t('sendCode')
              )}
            </Button>
          </BoutonCollant>
          <AutresVoies redirect={redirect} onEmail={onEmail} className="mt-4 max-lg:order-1 lg:mt-6" />
        </form>
      ) : null}

      {etape === 'code' ? (
        <form
          className="mt-6 flex flex-col lg:mt-7"
          onSubmit={(e) => {
            e.preventDefault();
            void verifier(false);
          }}
        >
          <label htmlFor="connexion-code" className="sr-only">
            {t('codeLabel')}
          </label>
          <CasesDuCode
            id="connexion-code"
            valeur={code}
            onChange={saisirCode}
            erreur={codeRefuse}
            figee={envoi}
            aria-describedby={erreur ? 'connexion-code-erreur' : undefined}
          />
          {erreur ? (
            <p id="connexion-code-erreur" role="alert" className="mt-3 text-sm text-destructive text-pretty">
              {erreur}
            </p>
          ) : null}
          <p className="mt-3.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm tabular-nums text-muted-foreground lg:order-2 lg:mt-4">
            <Timer className="size-4 flex-none lg:hidden" strokeWidth={1.75} aria-hidden="true" />
            {tPorte('code.valable')} ·
            <button
              type="button"
              className="-my-3 min-h-11 rounded-lg text-sm font-medium tabular-nums disabled:font-normal enabled:text-primary enabled:underline enabled:decoration-primary/40 enabled:underline-offset-4 disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
              disabled={envoi || attente > 0}
              onClick={() => void envoyerCode()}
            >
              {attente > 0 ? t('resendIn', { seconds: attente }) : t('resend')}
            </button>
          </p>
          {/* Au bureau, la maquette pose l'aperçu sous les cases, AVANT « Valable 5 minutes » ; au téléphone, après. */}
          <CodeDePreproduction code={apercu} onUtiliser={saisirCode} forme="ligne" className="mt-5 lg:order-1" />
          <BoutonCollant decalage={decalage} className="max-lg:mt-6 lg:order-3 lg:mt-6">
            <Button
              type="submit"
              disabled={envoi || code.length !== LONGUEUR_DU_CODE}
              className={BOUTON_D_ENTREE}
            >
              {envoi ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('verifying')}
                </>
              ) : (
                tPorte('code.seConnecter')
              )}
            </Button>
          </BoutonCollant>
          <p className="mt-3 hidden text-ui text-muted-foreground lg:order-4 lg:block">{tPorte('code.automatique')}</p>
        </form>
      ) : null}

      {etape === 'conditions' ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            accepterConditions();
          }}
        >
          <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={caseConditions}
              disabled={envoi}
              onChange={(e) => setCaseConditions(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-input accent-primary"
            />
            <span className="text-pretty">
              {t.rich('termsAccept', {
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
          <Button
            type="submit"
            disabled={envoi || !caseConditions}
            className="w-full rounded-full h-11 text-base font-semibold"
          >
            {envoi ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('verifying')}
              </>
            ) : (
              t('termsContinue')
            )}
          </Button>
          {liensDuCode}
        </form>
      ) : null}

      {etape === 'double-facteur' ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void verifier(true);
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="connexion-second-facteur" className="block text-sm font-medium">
              {codeDeSecours ? t2fa('recoveryLabel') : t2fa('codeLabel')}
            </label>
            <Input
              id="connexion-second-facteur"
              value={secondFacteur}
              onChange={(e) =>
                setSecondFacteur(
                  codeDeSecours
                    ? e.target.value.toUpperCase().slice(0, 11)
                    : e.target.value.replace(/\D/g, '').slice(0, 6),
                )
              }
              inputMode={codeDeSecours ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              placeholder={codeDeSecours ? t2fa('recoveryPlaceholder') : t2fa('codePlaceholder')}
              className="tabular-nums tracking-widest"
              required
              autoFocus
            />
          </div>
          <Button
            type="submit"
            disabled={envoi || secondFacteur.length < (codeDeSecours ? 11 : 6)}
            className="w-full rounded-full h-11 text-base font-semibold"
          >
            {envoi ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t2fa('verifying')}
              </>
            ) : (
              t2fa('verify')
            )}
          </Button>
          <button
            type="button"
            className={`-ml-2 ${CLASSE_LIEN_SECONDAIRE}`}
            onClick={basculerCodeDeSecours}
          >
            {codeDeSecours ? t2fa('useApp') : t2fa('useRecovery')}
          </button>
        </form>
      ) : null}

    </div>
  );
}
