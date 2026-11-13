'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, Mail, Pencil, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { resendVerificationEmailAction, updateProfileAction } from '@/app/actions/auth';
import { SymboleTakussan } from '@/components/brand/Logo';
import { DeclarerEntree } from '@/components/entree/CoqueDEntree';
import { useDecalageDuClavier } from '@/components/entree/useDecalageDuClavier';
import { FormGlobalError } from '@/components/forms/FormError';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import type { BienQuitte } from '@/lib/queries/bien-quitte';
import { avecRedirection } from '@/lib/redirection-interne';
import { cn } from '@/lib/utils';

import { BOUTON_D_ENTREE, BoutonCollant } from './BoutonCollant';
import { avecBien, type IntentionAffichee } from './IntentionDEntree';
import { LIEN_GMAIL, estUneAdresseGmail } from './adresse-e-mail';
import { intentionDeLUrl } from './liens-de-l-entree';
import { memoriserIntentionDeVerification } from './memoire-de-l-intention';
import { ApercuDuMessage, DisqueDIcone, ListeDActions, RangeeDAction, TitreDEntree } from './PiecesDuCourriel';
import { DELAI_DE_RENVOI_S, useCompteARebours } from './useCompteARebours';

/**
 * TCK-2606 — « Vérifiez votre adresse » (maquette `app-entree-connexion`, écran a-7).
 *
 * L'inscription par e-mail ouvre la session puis mène ici : l'adresse est dite EN CLAIR (compte en
 * session, rien à cacher à son titulaire), « Continuer » est le bouton plein — on n'attend pas sa
 * boîte pour reprendre ce qu'on faisait —, renvoyer le lien est possible après un délai, et
 * corriger une adresse jamais vérifiée renvoie un lien à la nouvelle (`AuthController::updateProfile`,
 * TCK-632).
 *
 * L'intention (`redirect`, `intention`) est mémorisée pour le lien du message, qui s'ouvre souvent
 * dans un autre onglet (`memoire-de-l-intention.ts`).
 */
export function VerifierLAdresse({ adresse: adresseInitiale, intention = null }: { readonly adresse: string; readonly intention?: IntentionAffichee | null }) {
  const t = useTranslations('auth.verification');
  const tBoite = useTranslations('auth.boite');
  const parametres = useSearchParams();
  const origine = intentionDeLUrl(parametres);
  const { refreshUser } = useAuth();
  const decalage = useDecalageDuClavier();
  const [adresse, setAdresse] = useState(adresseInitiale);
  // Un lien vient de partir (l'inscription, ou la page ouverte juste après) : le renvoi attend.
  const [attente, relancer] = useCompteARebours(DELAI_DE_RENVOI_S);
  const [envoi, setEnvoi] = useState(false);
  const [statut, setStatut] = useState<'renvoye' | 'corrige' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [correction, setCorrection] = useState<string | null>(null);

  const sortie = avecRedirection('/onboarding/intention', origine.redirect);
  const { redirect, action } = origine;

  useEffect(() => {
    memoriserIntentionDeVerification({ redirect, action });
  }, [redirect, action]);

  async function renvoyer() {
    if (envoi || attente > 0) return;
    setEnvoi(true);
    setErreur(null);
    const resultat = await resendVerificationEmailAction();
    setEnvoi(false);
    if (resultat.ok) {
      setStatut('renvoye');
      relancer(DELAI_DE_RENVOI_S);
    } else {
      setErreur(t('renvoiEchoue'));
    }
  }

  async function corriger(nouvelle: string) {
    setEnvoi(true);
    setErreur(null);
    const donnees = new FormData();
    donnees.set('email', nouvelle.trim());
    const resultat = await updateProfileAction(donnees);
    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.message);
      return;
    }
    setAdresse(resultat.user.email ?? nouvelle.trim());
    setCorrection(null);
    setStatut('corrige');
    relancer(DELAI_DE_RENVOI_S);
    void refreshUser();
  }

  const bien = avecBien(intention) ? intention.bien : null;
  // Le geste interrompu, quand la maquette le nomme (« Continuer ma demande de visite ») ; sinon, la
  // reprise générique.
  const geste = intention?.action === 'visite' || intention?.action === 'reservation' || intention?.action === 'candidature' ? intention.action : null;
  const gmail = estUneAdresseGmail(adresse);

  const enCorrection = correction !== null;

  return (
    <div data-ecran="verifier-adresse">
      {bien ? <DeclarerEntree enTete={<BarreDeReprise bien={bien} libelle={geste ? t(`repriseAction.${geste}`) : t('reprise')} />} /> : null}
      <ApercuDuMessage objet={t('message.objet')} extrait={t('message.extrait')} className="lg:hidden" />
      <DisqueDIcone icone={Mail} className="hidden lg:inline-flex" />
      <TitreDEntree
        className="mt-6 lg:mt-4"
        sous={t.rich('texte', {
          adresse,
          b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
        })}
      >
        {t('titre')}
      </TitreDEntree>

      {statut ? (
        <p role="status" className="mt-3 text-sm text-success">
          {statut === 'renvoye' ? t('renvoye', { adresse }) : t('corrige', { adresse })}
        </p>
      ) : null}
      {erreur ? <FormGlobalError className="mt-3">{erreur}</FormGlobalError> : null}

      {enCorrection ? (
        <form
          className="mt-5 rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void corriger(correction);
          }}
        >
          <label htmlFor="verification-adresse" className="mb-1.5 block text-sm font-medium">
            {t('correction.libelle')}
          </label>
          <Input
            id="verification-adresse"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={envoi || correction.trim() === '' || correction.trim() === adresse} className="h-11 rounded-full px-5">
              {envoi ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {t('correction.envoyer')}
            </Button>
            <Button type="button" variant="ghost" className="h-11 rounded-full px-4" onClick={() => setCorrection(null)}>
              {t('correction.annuler')}
            </Button>
          </div>
        </form>
      ) : (
        <ListeDActions className="mt-5 lg:mt-6">
          {gmail ? (
            <div className="lg:hidden">
              <RangeeDAction icone={ExternalLink} titre={tBoite('ouvrirGmail')} texte={t('gmailAide')} href={LIEN_GMAIL} />
            </div>
          ) : null}
          <RangeeDAction
            icone={RotateCw}
            titre={tBoite('renvoyer')}
            texte={attente > 0 ? tBoite('possibleDans', { secondes: attente }) : tBoite('possibleMaintenant')}
            desactive={envoi || attente > 0}
            onClick={() => void renvoyer()}
          />
          <RangeeDAction icone={Pencil} titre={tBoite('corriger')} texte={t('corrigerAide')} onClick={() => setCorrection(adresse)} />
        </ListeDActions>
      )}

      <p className="mt-5 flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/[0.08] p-3.5 text-sm leading-snug lg:hidden">
        <Check className="mt-0.5 size-4 flex-none text-accent" strokeWidth={2.5} aria-hidden="true" />
        <span>
          {t.rich(geste ? `compteOuvertAction.${geste}` : 'compteOuvert', { b: (chunks) => <span className="font-semibold">{chunks}</span> })}
        </span>
      </p>

      <BoutonCollant decalage={decalage} className="mt-6 lg:mt-8">
        <div className="lg:flex lg:items-center lg:gap-4">
          <Link href={sortie} className={cn(buttonVariants(), BOUTON_D_ENTREE, 'lg:w-auto lg:min-w-[12.5rem]')}>
            {geste ? (
              <>
                <span className="lg:hidden">{t(`continuerAction.${geste}`)}</span>
                <span className="hidden lg:inline">{t('continuer')}</span>
              </>
            ) : (
              t('continuer')
            )}
          </Link>
          {bien ? <RappelDuBien bien={bien} libelle={t('reprise')} /> : null}
        </div>
      </BoutonCollant>
    </div>
  );
}

function Vignette({ bien, sizes, className }: { readonly bien: BienQuitte; readonly sizes: string; readonly className: string }) {
  return (
    <span className={cn('relative flex-none overflow-hidden bg-muted', className)}>
      {bien.photo ? <Image src={bien.photo} alt="" fill sizes={sizes} className="object-cover" /> : null}
    </span>
  );
}

/** Téléphone : le bien quitté dans la barre, SANS retour (`BarreIntention sansRetour`) — le compte est ouvert. */
function BarreDeReprise({ bien, libelle }: { readonly bien: BienQuitte; readonly libelle: string }) {
  return (
    <header className="flex h-14 items-center border-b border-border/70 bg-background pl-1 pr-4">
      <Vignette bien={bien} sizes="36px" className="ml-3 size-9 rounded-lg" />
      <div className="ml-2.5 min-w-0 flex-1 leading-tight">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{libelle}</p>
        <p className="mt-0.5 truncate text-sm font-semibold">{bien.titre}</p>
      </div>
      <SymboleTakussan className="h-6 w-[34px] flex-none" />
    </header>
  );
}

/** Bureau : « Vous reprenez · <le bien> » à côté de « Continuer » (`RappelIntention`). */
function RappelDuBien({ bien, libelle }: { readonly bien: BienQuitte; readonly libelle: string }) {
  return (
    <div className="hidden max-w-full min-w-0 items-center gap-2.5 rounded-full border border-border bg-card py-1 pl-1 pr-3.5 lg:inline-flex">
      <Vignette bien={bien} sizes="32px" className="size-8 rounded-full" />
      <p className="truncate text-[13px]">
        <span className="font-semibold">{libelle}</span> · {bien.titre}
      </p>
    </div>
  );
}
