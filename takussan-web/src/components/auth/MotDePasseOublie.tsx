'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Mail, MailCheck, Pencil, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { forgotPassword } from '@/lib/auth';
import { cn } from '@/lib/utils';

import { BOUTON_D_ENTREE, BoutonCollant } from './BoutonCollant';
import { avecBien, type IntentionAffichee } from './IntentionDEntree';
import { LIEN_GMAIL, adresseMasquee, estUneAdresseGmail } from './adresse-e-mail';
import { cheminDEntree, intentionDeLUrl } from './liens-de-l-entree';
import { ApercuDuMessage, DisqueDIcone, EncadreCodeSms, ListeDActions, RangeeDAction, TitreDEntree } from './PiecesDuCourriel';
import { RetourDEntree } from './RetourDEntree';
import { DELAI_DE_RENVOI_S, useCompteARebours } from './useCompteARebours';
import { useConnexionParTelephone } from './useConnexionParTelephone';

/**
 * TCK-2606 — « Mot de passe oublié », puis « Lien envoyé » (maquette `app-entree-connexion`,
 * écrans a-5 et a-6).
 *
 * ⚠ **Pas de fuite d'existence** : l'écran « Lien envoyé » est le MÊME que l'adresse ait un compte
 * ou non, que l'API réponde ou échoue — la réponse n'est pas lue. L'adresse y est masquée
 * (« a•••@gmail.com ») : sans session, l'écran ne confirme rien.
 *
 * Sous le bouton, la sortie que l'écran ne proposait pas : le code SMS, sans rien réinitialiser —
 * seulement quand la voie téléphone est ouverte (`phone_login`).
 */
export function MotDePasseOublie({ intention = null }: { readonly intention?: IntentionAffichee | null }) {
  const t = useTranslations('auth.oubli');
  const tBoite = useTranslations('auth.boite');
  const origine = intentionDeLUrl(useSearchParams());
  const telephoneActif = useConnexionParTelephone();
  const decalage = useDecalageDuClavier();
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [renvoye, setRenvoye] = useState(false);
  const [attente, relancer] = useCompteARebours();

  const versLaConnexion = cheminDEntree('/auth/login', origine, { voie: 'email' });
  const versLeCode = cheminDEntree('/auth/login', origine);

  async function envoyer() {
    if (envoi) return;
    setEnvoi(true);
    try {
      await forgotPassword(email.trim());
    } catch {
      // Toujours le même écran : une erreur ne doit rien dire de l'adresse.
    } finally {
      setEnvoi(false);
      relancer(DELAI_DE_RENVOI_S);
    }
  }

  const sms = telephoneActif ? <EncadreCodeSms href={versLeCode} /> : null;

  if (envoye) {
    const gmail = estUneAdresseGmail(email);
    return (
      <div data-ecran="lien-envoye">
        <RetourDEntree href={versLaConnexion} libelle={t('retourConnexion')} intention={intention} />
        <ApercuDuMessage objet={t('message.objet')} extrait={t('message.extrait')} className="lg:hidden" />
        <DisqueDIcone icone={MailCheck} ton="sauge" className="hidden lg:inline-flex" />
        <TitreDEntree className="mt-6 lg:mt-4" sous={t('envoye.sousTitre')}>
          {t('envoye.titre', { adresse: adresseMasquee(email.trim()) })}
        </TitreDEntree>
        {renvoye ? (
          <p role="status" className="mt-3 text-sm text-success">
            {t('renvoye')}
          </p>
        ) : null}
        <ListeDActions className="mt-5 lg:hidden">
          <RangeeDAction
            icone={RotateCw}
            titre={tBoite('renvoyer')}
            texte={attente > 0 ? tBoite('possibleDans', { secondes: attente }) : tBoite('possibleMaintenant')}
            desactive={envoi || attente > 0}
            onClick={() => {
              setRenvoye(true);
              void envoyer();
            }}
          />
          <RangeeDAction
            icone={Pencil}
            titre={tBoite('corriger')}
            texte={t('corrigerAide')}
            onClick={() => {
              setEnvoye(false);
              setRenvoye(false);
            }}
          />
        </ListeDActions>
        {/* Bureau : « Ouvrir Gmail » et le renvoi sur une ligne, sous le titre. */}
        <div className="mt-7 hidden items-center gap-4 lg:flex">
          {gmail ? (
            <a href={LIEN_GMAIL} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), BOUTON_D_ENTREE, 'w-auto min-w-[12.5rem]')}>
              {tBoite('ouvrirGmail')}
            </a>
          ) : null}
          <button
            type="button"
            disabled={envoi || attente > 0}
            onClick={() => {
              setRenvoye(true);
              void envoyer();
            }}
            className="min-h-11 rounded-lg text-sm tabular-nums enabled:font-medium enabled:text-primary enabled:underline enabled:decoration-primary/40 enabled:underline-offset-4 disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            {attente > 0 ? tBoite('renvoyerDans', { secondes: attente }) : tBoite('renvoyer')}
          </button>
        </div>
        {sms ? <div className="mt-5 lg:mt-8">{sms}</div> : null}
        {/* Téléphone : le bouton plein en bas — Gmail quand l'adresse en est une, sinon la connexion. */}
        <BoutonCollant decalage={decalage} className="mt-6 lg:hidden">
          {gmail ? (
            <a href={LIEN_GMAIL} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), BOUTON_D_ENTREE)}>
              {tBoite('ouvrirGmail')}
            </a>
          ) : (
            <a href={versLaConnexion} className={cn(buttonVariants(), BOUTON_D_ENTREE)}>
              {t('retourConnexion')}
            </a>
          )}
        </BoutonCollant>
      </div>
    );
  }

  return (
    <div data-ecran="oubli">
      <RetourDEntree href={versLaConnexion} libelle={t('retourConnexion')} intention={intention} />
      {/* Sous la barre du bien, la maquette pose le titre à 16 px (la coque en laisse 20). */}
      <TitreDEntree className={avecBien(intention) ? 'max-lg:-mt-1' : undefined} sous={t('sousTitre')}>
        {t('titre')}
      </TitreDEntree>
      <form
        className="mt-5 flex flex-col lg:mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer().then(() => setEnvoye(true));
        }}
      >
        <label htmlFor="oubli-email" className="mb-1.5 self-start text-sm font-medium">
          {t('email')}
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground lg:hidden" strokeWidth={1.5} aria-hidden="true" />
          <Input
            id="oubli-email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="max-lg:pl-10"
          />
        </div>
        <BoutonCollant decalage={decalage} className="max-lg:order-3 max-lg:mt-4 lg:mt-6">
          <Button type="submit" disabled={envoi || email.trim() === ''} className={BOUTON_D_ENTREE}>
            {envoi ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t('envoi')}
              </>
            ) : (
              t('envoyer')
            )}
          </Button>
        </BoutonCollant>
        {sms ? <div className="mt-5 max-lg:order-1 lg:mt-8">{sms}</div> : null}
      </form>
    </div>
  );
}
