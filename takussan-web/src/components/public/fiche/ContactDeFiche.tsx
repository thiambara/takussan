'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Mail, MessageCircle, Phone } from 'lucide-react';

import { cn } from '@/lib/utils';
import { telephonePublie } from '@/lib/phone';
import { submitAgentContactLead } from '@/app/actions/property';
import { AnonymousLeadDialog } from '@/components/public/AnonymousLeadDialog';
import { LienLocalise } from '@/components/shared/LienLocalise';

/**
 * Le canal « Message » d'une fiche — trois formes, et une seule à la fois :
 *
 * - `courriel` : l'adresse d'ENTREPRISE d'une agence, publiée délibérément (TCK-441) ;
 * - `formulaire` : le formulaire anonyme d'une personne (`agentSlug`), sans compte — sa voie
 *   « Message » reste celle-là (TCK-2523) ;
 * - `agence` : TCK-2523 (décision 1b) — un propriétaire rendu public renvoie son contact à l'agence
 *   qui gère ses biens.
 */
export type CanalDeMessage =
  | { readonly genre: 'courriel'; readonly adresse: string; readonly sujet?: string }
  | { readonly genre: 'formulaire'; readonly slug: string; readonly role: 'agent' | 'owner' }
  | { readonly genre: 'agence'; readonly nom: string; readonly slug: string };

export interface ContactDeFicheProps {
  readonly nom: string;
  /** Le numéro PUBLIABLE (vérifié pour une personne), ou `null` : pas de bouton d'appel. */
  readonly telephone: string | null;
  readonly message: CanalDeMessage | null;
  /** Le sous-titre de la carte de bureau (« Répond en ~1 h »), ou `null`. */
  readonly sousTitre?: string | null;
}

/**
 * TCK-2522 / TCK-2523 — la barre d'actions d'une fiche, au téléphone (fixée en bas : elle remplace
 * la barre d'onglets, ADR-0091 § 4), et sa carte de contact dans la colonne d'identité en bureau.
 *
 * ⚠ **Pas de WhatsApp.** La maquette le met au premier rang « quand l'agence l'a » ; l'API ne dit
 * ni d'une agence ni d'une personne si son numéro est sur WhatsApp. Un bouton qui viserait un
 * numéro sans WhatsApp mentirait (TCK-633, lot C) : il viendra avec la donnée.
 */
export function ContactDeFiche({ nom, telephone, message, sousTitre = null }: ContactDeFicheProps) {
  const t = useTranslations('publicProfile.contact');
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const telHref = telephone ? `tel:${telephonePublie(telephone)}` : null;

  if (!telHref && !message) return null;

  const boutonMessage = (classe: string) => {
    if (!message) return null;
    const contenu = (
      <>
        {message.genre === 'agence' ? <Building2 className="size-[18px]" aria-hidden /> : message.genre === 'courriel' ? <Mail className="size-[18px]" aria-hidden /> : <MessageCircle className="size-[18px]" aria-hidden />}
        <span>{message.genre === 'agence' ? t('ecrireALAgence') : t('message')}</span>
      </>
    );
    if (message.genre === 'agence') {
      return (
        <LienLocalise data-canal="agence" href={`/agencies/${encodeURIComponent(message.slug)}`} className={classe}>
          {contenu}
        </LienLocalise>
      );
    }
    if (message.genre === 'courriel') {
      const href = `mailto:${message.adresse}${message.sujet ? `?subject=${encodeURIComponent(message.sujet)}` : ''}`;
      return (
        <a data-canal="courriel" href={href} className={classe}>
          {contenu}
        </a>
      );
    }
    return (
      <button data-canal="formulaire" type="button" onClick={() => setFormulaireOuvert(true)} className={classe}>
        {contenu}
      </button>
    );
  };

  const principal =
    'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-[background-color,scale] hover:bg-[var(--primary-deep)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
  const secondaire =
    'inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[15px] font-semibold text-foreground transition-[border-color,scale] hover:border-primary active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
  // L'appel est l'action principale quand il existe ; sinon le message prend sa place.
  const classeAppel = principal;
  const classeMessage = telHref ? secondaire : principal;

  return (
    <>
      {/* Bureau : la carte de contact, dans la colonne d'identité. */}
      <div data-contact-fiche="carte" className="hidden rounded-2xl border border-border bg-card p-5 shadow-[0_12px_32px_-20px_color-mix(in_oklab,var(--shadow-color)_45%,transparent)] lg:block">
        <p className="font-display text-lg font-semibold tracking-tight text-foreground">{t('contacterNom', { nom })}</p>
        {sousTitre ? <p className="mt-0.5 text-sm text-muted-foreground">{sousTitre}</p> : null}
        <div className="mt-4 flex flex-col gap-2">
          {telHref ? (
            <a data-canal="appel" href={telHref} className={classeAppel}>
              <Phone className="size-[18px]" aria-hidden />
              {t('call')}
            </a>
          ) : null}
          {boutonMessage(classeMessage)}
        </div>
      </div>

      {/* Téléphone : la barre d'actions, fixée en bas — la seule couche (ADR-0091 § 4). */}
      <div
        data-contact-fiche="barre"
        className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:hidden"
      >
        {telHref ? (
          <a data-canal="appel" href={telHref} className={cn(classeAppel, 'flex-1')}>
            <Phone className="size-[18px]" aria-hidden />
            {t('call')}
          </a>
        ) : null}
        {boutonMessage(cn(classeMessage, 'flex-1'))}
      </div>

      {message?.genre === 'formulaire' ? (
        <AnonymousLeadDialog
          open={formulaireOuvert}
          onOpenChange={setFormulaireOuvert}
          idPrefix="fiche-lead"
          title={nom}
          description={message.role === 'agent' ? t('leadDescriptionAgent') : t('leadDescriptionOwner')}
          successBody={message.role === 'agent' ? t('leadSuccessAgent') : t('leadSuccessOwner')}
          onSubmit={(payload, cle) => submitAgentContactLead(message.slug, payload, cle)}
        />
      ) : null}
    </>
  );
}
