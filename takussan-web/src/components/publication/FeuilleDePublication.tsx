'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { updateContactPreferencesAction, type PreferencesDeContact } from '@/app/actions/contact-preferences';
import { phoneSendOtpAction, phoneVerifyOtpAction } from '@/app/actions/security';
import { CasesDuCode, LONGUEUR_DU_CODE } from '@/components/auth/CasesDuCode';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/context/AuthContext';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { formaterTelephone, isE164 } from '@/lib/phone';

import { CadreDeLaFeuille, usePanneauDeBureau } from './CadreDeLaFeuille';
import type { ManqueDeLaFeuille } from './feuille-de-publication';

/**
 * TCK-2601 — la feuille de compte de l'assistant : « Publier » l'ouvre quand il manque quelque chose
 * pour publier, et seulement pour ce qui manque (`manquesDeLaFeuille`). Elle remplace, dans
 * l'assistant, le bloc « Vos coordonnées pour les intéressés » (`CoordonneesPublication`, qui reste
 * servi tel quel par la boîte « Avant de publier » de la liste et de l'en-tête d'un bien), sans
 * perdre une donnée qu'il collectait :
 *
 * - prénom ET nom (décision 1a), le seul manquant quand l'autre est connu ;
 * - le numéro vérifié par un code (sous session : `phoneSendOtpAction`, `phoneVerifyOtpAction`), et sa
 *   case WhatsApp — décochée, elle s'enregistre « non » ;
 * - la question WhatsApp, une fois, à un numéro vérifié qui n'y a jamais répondu ;
 * - le contact qui est un AUTRE (`contact_is_self: false`) : dit, sans rien faire saisir ;
 * - la phrase des CGU, acceptées par le geste (`accept_terms`).
 *
 * « Publier mon annonce » vérifie le code (et relit le compte), enregistre le profil en UN appel, puis
 * rend la main à l'assistant (`onPublier`), qui fait ses écritures d'aujourd'hui.
 *
 * Les champs demandés sont figés à l'ouverture : un numéro vérifié en route ne fait pas disparaître
 * le champ qu'on est en train de remplir.
 */
interface FeuilleDePublicationProps {
  readonly ouverte: boolean;
  readonly onFermer: () => void;
  /** Ce qui manque à l'ouverture ; figé ensuite (le parent remonte la feuille par `key`). */
  readonly manques: readonly ManqueDeLaFeuille[];
  /** Le serveur dit que le contact du bien est un AUTRE, qui doit compléter son profil. */
  readonly autreContact: boolean;
  /** L'annonce, en une ligne : vignette, titre, prix, « prête à publier ». */
  readonly rappel: ReactNode;
  /** L'assistant écrit (création, photos, publication) : le bouton attend. */
  readonly envoi: boolean;
  /** L'API a refusé la publication faute de coordonnées : la feuille rouverte le dit. */
  readonly alerte?: string | null;
  /**
   * Le compte vient d'être relu après un code accepté : il fait foi, et ce que l'API disait manquer
   * (`manquantsServeur`) ne se redemande plus — même si la suite (profil, publication) échoue.
   */
  readonly onCompteRelu?: () => void;
  readonly onPublier: () => void | Promise<void>;
  /** TCK-2601 (AC5) — la colonne de l'assistant où la feuille devient panneau dès 1280 px. */
  readonly cible?: HTMLElement | null;
}

export function FeuilleDePublication({ ouverte, onFermer, manques, autreContact, rappel, envoi, alerte = null, onCompteRelu, onPublier, cible = null }: FeuilleDePublicationProps) {
  const t = useTranslations('property.wizard.feuille');
  const tContact = useTranslations('property.form.publishContact');
  const { user, setUser, refreshUser } = useAuth();
  const bureau = usePanneauDeBureau(cible);

  // Figés à l'ouverture (le parent remonte la feuille par `key` à chaque ouverture).
  const [demandes] = useState(manques);
  const demandePrenom = demandes.includes('first_name');
  const demandeNom = demandes.includes('last_name');
  const demandeNumero = demandes.includes('verified_phone');
  const demandeWhatsApp = demandes.includes('whatsapp');

  const [prenom, setPrenom] = useState(user?.first_name ?? '');
  const [nom, setNom] = useState(user?.last_name ?? '');
  const [telephone, setTelephone] = useState(user?.phone ?? '');
  // Décochée par défaut : une case décochée est une réponse (« non »), qui s'enregistre.
  const [whatsapp, setWhatsapp] = useState(user?.phone_whatsapp === true);
  const [codeEnvoye, setCodeEnvoye] = useState(false);
  const [code, setCode] = useState('');
  const [apercu, setApercu] = useState<string | null>(null);
  // Un code accepté ne se revérifie pas : une seconde moitié refusée (profil) se rejoue seule.
  const [codeAccepte, setCodeAccepte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const occupe = enCours || envoi;
  const nomsPrets = (!demandePrenom || prenom.trim() !== '') && (!demandeNom || nom.trim() !== '');
  const numeroPret = !demandeNumero || codeAccepte || (codeEnvoye && code.length === LONGUEUR_DU_CODE);
  const pret = !autreContact && nomsPrets && numeroPret;
  const montrerCgu = !user?.terms_accepted_at;

  async function envoyerCode() {
    setErreur(null);
    setEnCours(true);
    try {
      const r = await phoneSendOtpAction(telephone);
      if (!r.ok) {
        setErreur(r.message);
        return;
      }
      setCodeEnvoye(true);
      setCode('');
      setApercu(r.data.codeApercu);
    } finally {
      setEnCours(false);
    }
  }

  async function publier() {
    setErreur(null);
    setEnCours(true);
    try {
      if (demandeNumero && !codeAccepte) {
        const v = await phoneVerifyOtpAction(code);
        if (!v.ok) {
          setErreur(v.message);
          return;
        }
        setCodeAccepte(true);
        // Le numéro vérifié vit au compte : relu tout de suite, il fait foi pour la suite (`PublishReadiness`).
        await refreshUser();
        onCompteRelu?.();
      }
      const profil: PreferencesDeContact = {
        ...(demandePrenom ? { first_name: prenom.trim() } : {}),
        ...(demandeNom ? { last_name: nom.trim() } : {}),
        ...(demandeNumero || demandeWhatsApp ? { phone_whatsapp: whatsapp } : {}),
      };
      if (Object.keys(profil).length > 0) {
        const r = await updateContactPreferencesAction(profil);
        if (!r.ok) {
          setErreur(r.message);
          return;
        }
        setUser(r.user);
      }
      await onPublier();
    } finally {
      setEnCours(false);
    }
  }

  const etapeDuNumero = demandeNumero && !codeEnvoye && !codeAccepte;

  return (
    <CadreDeLaFeuille
      ouverte={ouverte}
      onFermer={onFermer}
      occupe={occupe}
      bureau={bureau}
      cible={cible}
      titre={t('titre')}
      // Le panneau ne dit « votre numéro » que s'il le demande : un compte connecté peut ne manquer que d'un nom.
      titreDuPanneau={demandeNumero ? t('titreDuPanneau') : t('titre')}
      rappel={rappel}
      action={
        etapeDuNumero ? (
          <Button type="button" className="w-full md:w-auto" disabled={occupe || !isE164(telephone)} onClick={() => void envoyerCode()}>
            {tContact('sendCode')}
          </Button>
        ) : (
          <Button type="button" className="w-full md:w-auto" disabled={occupe || !pret} onClick={() => void publier()}>
            {t('publier')}
          </Button>
        )
      }
    >
      <div className="space-y-5" data-feuille-de-publication="">
        {alerte ? (
          <p role="alert" className="text-sm text-foreground">
            {alerte}
          </p>
        ) : null}

        {autreContact ? (
          <p role="alert" className="text-sm text-destructive">
            {tContact('otherContact')}
          </p>
        ) : null}

        {demandeNumero ? (
          <section className="space-y-3">
            {/* Au bureau, le titre du panneau dit déjà « votre numéro ». */}
            {bureau ? null : (
              <h3 className="font-display text-base font-semibold text-foreground">
                {t('numeroTitre')}
              </h3>
            )}
            <p className="text-sm text-muted-foreground text-pretty">{t('numeroTexte')}</p>
            {codeEnvoye || codeAccepte ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  {t('codeEnvoyeAu', { phone: formaterTelephone(telephone) })}{' '}
                  <button
                    type="button"
                    disabled={occupe || codeAccepte}
                    onClick={() => {
                      setCodeEnvoye(false);
                      setCode('');
                      setApercu(null);
                    }}
                    className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary disabled:text-muted-foreground disabled:no-underline"
                  >
                    {t('modifier')}
                  </button>
                </p>
                {codeAccepte ? (
                  <p role="status" className="text-sm text-success">
                    {tContact('phoneVerified')}
                  </p>
                ) : (
                  <>
                    <label htmlFor="feuille-code" className="text-xs font-semibold text-muted-foreground">
                      {tContact('codeAria')}
                    </label>
                    <CasesDuCode id="feuille-code" valeur={code} onChange={setCode} figee={occupe} />
                    <CodeDePreproduction code={apercu} onUtiliser={setCode} />
                    <button
                      type="button"
                      disabled={occupe}
                      onClick={() => void envoyerCode()}
                      className="min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline disabled:text-muted-foreground"
                    >
                      {tContact('resendCode')}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Le titre dit déjà « Votre numéro » : l'étiquette ne le redit qu'aux lecteurs d'écran. */}
                <label htmlFor="feuille-telephone" className="sr-only">
                  {tContact('phoneLabel')}
                </label>
                <PhoneInput id="feuille-telephone" value={telephone} onValueChange={setTelephone} disabled={occupe} />
              </div>
            )}
          </section>
        ) : null}

        {demandeNumero || demandeWhatsApp ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={whatsapp}
              disabled={occupe}
              onChange={(e) => setWhatsapp(e.target.checked)}
              className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
            />
            {demandeWhatsApp && user?.phone ? t('whatsappDuNumero', { phone: formaterTelephone(user.phone) }) : tContact('whatsapp')}
          </label>
        ) : null}

        {demandePrenom || demandeNom ? (
          <section className="space-y-2" aria-labelledby="feuille-noms-titre">
            <h3 id="feuille-noms-titre" className="font-display text-base font-semibold text-foreground">
              {t('nomsTitre')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {demandePrenom ? (
                <div className="space-y-1">
                  <label htmlFor="feuille-prenom" className="text-xs font-semibold text-muted-foreground">
                    {tContact('firstNameLabel')}
                  </label>
                  <Input id="feuille-prenom" value={prenom} maxLength={100} autoComplete="given-name" disabled={occupe} onChange={(e) => setPrenom(e.target.value)} />
                </div>
              ) : null}
              {demandeNom ? (
                <div className="space-y-1">
                  <label htmlFor="feuille-nom" className="text-xs font-semibold text-muted-foreground">
                    {tContact('lastNameLabel')}
                  </label>
                  <Input id="feuille-nom" value={nom} maxLength={100} autoComplete="family-name" disabled={occupe} onChange={(e) => setNom(e.target.value)} />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {erreur ? (
          <p role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        ) : null}

        {montrerCgu ? (
          <p className="text-xs text-muted-foreground" data-testid="phrase-cgu-feuille">
            {tContact.rich('terms', {
              lien: (morceau) => (
                <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" className="underline underline-offset-2">
                  {morceau}
                </LienLocalise>
              ),
            })}
          </p>
        ) : null}
      </div>
    </CadreDeLaFeuille>
  );
}
