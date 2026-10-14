'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck } from 'lucide-react';

import { updateContactPreferencesAction } from '@/app/actions/contact-preferences';
import { phoneSendOtpAction, phoneVerifyOtpAction } from '@/app/actions/security';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/context/AuthContext';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { formaterTelephone, isE164 } from '@/lib/phone';
import type { User } from '@/types/user';

type Retour = { ok: boolean; message: string };

/** Ce que l'écran sait déjà manquer, avant même que l'API le dise. */
export function manquesLocaux(user: Partial<User> | null): Array<'first_name' | 'verified_phone'> {
  if (!user) return [];
  const manque: Array<'first_name' | 'verified_phone'> = [];
  if (!user.first_name?.trim()) manque.push('first_name');
  if (!user.phone_verified_at) manque.push('verified_phone');
  return manque;
}

/**
 * TCK-633 (lot C, AC11) — « Vos coordonnées pour les intéressés », au dernier moment, dans le flux
 * de la publication : prénom et nom, numéro avec code, case WhatsApp, et la phrase des CGU avec
 * son lien. Jamais un détour par le profil. L'API reste juge (`PublishReadiness`) : si elle dit
 * que le contact est un AUTRE (agent principal), l'écran le dit au lieu de faire saisir.
 *
 * Monté par l'étape Finition de l'assistant ET par la boîte de dialogue des boutons « Publier »
 * de la liste et de l'en-tête d'un bien (`PublierAvecCoordonnees`, décision 3 du porteur).
 */
export function CoordonneesPublication({
  manquantsServeur,
  contactEstSoi,
}: {
  readonly manquantsServeur: readonly string[] | null;
  readonly contactEstSoi: boolean;
}) {
  const t = useTranslations('property.form.publishContact');
  const { user, setUser, refreshUser } = useAuth();
  const [prenom, setPrenom] = useState(user?.first_name ?? '');
  const [nom, setNom] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [whatsapp, setWhatsapp] = useState(user?.phone_whatsapp === true);
  const [codeEnvoye, setCodeEnvoye] = useState(false);
  const [code, setCode] = useState('');
  const [apercu, setApercu] = useState<string | null>(null);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [enCours, demarrer] = useTransition();

  // Correction du lot C, tour 3 — le contexte peut être PÉRIMÉ (numéro changé ailleurs) : l'API
  // refuse alors `[verified_phone]` avec `contact_is_self` quand l'écran croit tout fait, et la
  // boîte s'ouvrait vide. Ce que le serveur dit manquer s'affiche tant que le compte n'a pas été
  // relu depuis ce refus ; le compte est relu, et c'est lui qui fait foi ensuite. « Relu » = un
  // autre objet `user` que celui du refus (`refreshUser`, ou `setUser` après une écriture). Le
  // refus s'identifie par sa RÉFÉRENCE : les deux parents le tiennent en état.
  const [repere, setRepere] = useState({ serveur: manquantsServeur, user });
  if (repere.serveur !== manquantsServeur) setRepere({ serveur: manquantsServeur, user });
  const contexteRelu = repere.user !== user;
  const serveur = contactEstSoi && !contexteRelu ? (manquantsServeur ?? []) : [];
  const locauxSeuls = manquesLocaux(user);
  const nonCouverts = serveur.filter(
    (m): m is 'first_name' | 'verified_phone' =>
      (m === 'first_name' || m === 'verified_phone') && !locauxSeuls.includes(m),
  );
  const locaux = [...locauxSeuls, ...nonCouverts];
  const cguSelonServeur = serveur.includes('terms');
  const aRelire = nonCouverts.length > 0 || (cguSelonServeur && !!user?.terms_accepted_at);
  useEffect(() => {
    if (aRelire) void refreshUser();
  }, [aRelire, refreshUser]);

  const autreContact = manquantsServeur !== null && !contactEstSoi && manquantsServeur.some((m) => m !== 'terms');
  // Vérification adverse du lot C — `null` = jamais répondu : on pose la question, même à un
  // compte dont le numéro est déjà vérifié. `false` est une réponse, qui ne se redemande pas.
  const whatsappSansReponse = contactEstSoi && !!user?.phone_verified_at && user?.phone_whatsapp === null;
  const montrerBloc = contactEstSoi && (locaux.length > 0 || whatsappSansReponse);
  const montrerCgu = !user?.terms_accepted_at || cguSelonServeur;

  if (!montrerBloc && !montrerCgu && !autreContact) return null;

  const enregistrerNoms = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await updateContactPreferencesAction({ first_name: prenom.trim(), last_name: nom.trim() });
      if (r.ok) {
        setUser(r.user);
        setRetour({ ok: true, message: t('saved') });
      } else {
        setRetour({ ok: false, message: r.message });
      }
    });
  };

  const envoyerCode = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await phoneSendOtpAction(phone);
      if (r.ok) {
        setCodeEnvoye(true);
        setApercu(r.data.codeApercu);
        setRetour({ ok: true, message: t('codeSent') });
      } else {
        setRetour({ ok: false, message: r.message });
      }
    });
  };

  const verifierCode = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await phoneVerifyOtpAction(code);
      if (!r.ok) {
        setRetour({ ok: false, message: r.message });
        return;
      }
      // La case décochée est une réponse (« non ») : l'enregistrer, sinon la question reviendrait.
      const w = await updateContactPreferencesAction({ phone_whatsapp: whatsapp });
      if (w.ok) setUser(w.user);
      await refreshUser();
      setRetour({ ok: true, message: t('phoneVerified') });
    });
  };

  const repondreWhatsApp = (reponse: boolean) => {
    setRetour(null);
    demarrer(async () => {
      const r = await updateContactPreferencesAction({ phone_whatsapp: reponse });
      if (r.ok) setUser(r.user);
      else setRetour({ ok: false, message: r.message });
    });
  };

  return (
    <section aria-label={t('title')} className="space-y-3 rounded-lg border border-border bg-muted/30 p-4" data-testid="coordonnees-publication">
      {montrerBloc ? (
        <>
          <h3 className="font-display text-base font-semibold text-foreground">{t('title')}</h3>
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>

          {locaux.includes('first_name') ? (
            <div className="grid gap-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <div className="space-y-1">
                <label htmlFor="coordonnees-prenom" className="text-xs font-semibold text-muted-foreground">{t('firstNameLabel')}</label>
                <Input id="coordonnees-prenom" value={prenom} maxLength={100} onChange={(e) => setPrenom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label htmlFor="coordonnees-nom" className="text-xs font-semibold text-muted-foreground">{t('lastNameLabel')}</label>
                <Input id="coordonnees-nom" value={nom} maxLength={100} onChange={(e) => setNom(e.target.value)} />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={enregistrerNoms} disabled={enCours || prenom.trim() === ''}>
                {t('saveNames')}
              </Button>
            </div>
          ) : null}

          {locaux.includes('verified_phone') ? (
            <div className="space-y-2">
              <label htmlFor="coordonnees-telephone" className="text-xs font-semibold text-muted-foreground">{t('phoneLabel')}</label>
              <PhoneInput id="coordonnees-telephone" value={phone} onValueChange={setPhone} disabled={enCours} />
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.checked)}
                  className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
                />
                {t('whatsapp')}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={envoyerCode} disabled={enCours || !isE164(phone)}>
                  {codeEnvoye ? t('resendCode') : t('sendCode')}
                </Button>
                {codeEnvoye ? (
                  <>
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      autoComplete="one-time-code"
                      aria-label={t('codeAria')}
                      className="max-w-[8rem]"
                    />
                    <Button type="button" size="sm" onClick={verifierCode} disabled={enCours || code.length !== 6}>
                      {t('verifyCode')}
                    </Button>
                  </>
                ) : null}
              </div>
              <CodeDePreproduction code={codeEnvoye ? apercu : null} onUtiliser={setCode} />
            </div>
          ) : null}

          {/* TCK-635 — la question porte sur un numéro : il s'affiche, vérifié, au-dessus d'elle.
              Seule, elle laissait deviner de quel numéro on parlait (retour du porteur). */}
          {whatsappSansReponse && !locaux.includes('verified_phone') ? (
            <div className="space-y-2" data-testid="numero-verifie">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{t('phoneLabel')}</p>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground tabular-nums">
                    {user?.phone ? formaterTelephone(user.phone) : null}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    {t('verifiedBadge')}
                  </span>
                </p>
              </div>
              <div role="group" aria-labelledby="coordonnees-whatsapp-question" className="flex flex-wrap items-center gap-2">
                <p id="coordonnees-whatsapp-question" className="text-sm text-foreground">{t('whatsappQuestion')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => repondreWhatsApp(true)} disabled={enCours}>
                  {t('whatsappYes')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => repondreWhatsApp(false)} disabled={enCours}>
                  {t('whatsappNo')}
                </Button>
              </div>
            </div>
          ) : null}

          {retour ? (
            <p role={retour.ok ? 'status' : 'alert'} className={'text-xs ' + (retour.ok ? 'text-success' : 'text-destructive')}>
              {retour.message}
            </p>
          ) : null}
        </>
      ) : null}

      {autreContact ? (
        <p role="alert" className="text-sm text-destructive">{t('otherContact')}</p>
      ) : null}

      {montrerCgu ? (
        <p className="text-xs text-muted-foreground" data-testid="phrase-cgu">
          {t.rich('terms', {
            lien: (morceau) => (
              <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" className="underline underline-offset-2">
                {morceau}
              </LienLocalise>
            ),
          })}
        </p>
      ) : null}
    </section>
  );
}
