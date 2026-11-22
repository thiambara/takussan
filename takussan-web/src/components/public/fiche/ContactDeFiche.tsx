'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Mail, MessageCircle, PencilLine, Phone } from 'lucide-react';

import { cn } from '@/lib/utils';
import { telephonePublie } from '@/lib/phone';
import { submitAgentContactLead } from '@/app/actions/property';
import { AnonymousLeadDialog } from '@/components/public/AnonymousLeadDialog';
import { LienWhatsApp } from '@/components/contact/LienWhatsApp';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useFicheDeSoi, type FicheIdentifiee } from '@/components/public/fiche/useFicheDeSoi';

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
  /**
   * TCK-2576 — le numéro à joindre sur WhatsApp, ou `null` : SEULEMENT un numéro que l'API dit sur
   * WhatsApp (agent : le numéro publié avec `phone_whatsapp: true` ; agence : son `phone_whatsapp`
   * déclaré). Sans lui, pas de bouton — un bouton qui viserait un numéro hors WhatsApp mentirait.
   */
  readonly whatsapp?: string | null;
  readonly message: CanalDeMessage | null;
  /** Le sous-titre de la carte de bureau (« Répond en ~1 h »), ou `null`. */
  readonly sousTitre?: string | null;
  /**
   * TCK-2575 — qui est la fiche : sur SA propre fiche, la personne (ou qui configure l'agence) ne se
   * voit pas proposer de s'écrire, mais un lien vers l'écran qui la modifie. Reconnu côté client
   * seulement, après l'hydratation : le HTML servi reste celui d'un visiteur ({@link useFicheDeSoi}).
   */
  readonly fiche?: FicheIdentifiee;
}

/** TCK-2575 — l'écran qui modifie la fiche (TCK-2524) : `/app/…`, jamais préfixé d'une langue. */
function ecranDeModification(fiche: FicheIdentifiee): string {
  if (fiche.genre === 'agence') return '/app/agency';
  // La section « Fiche publique » (langues, quartiers) n'existe que pour un agent ; celle d'un
  // propriétaire rendrait 404 (`SectionDuProfil`) : ce qu'il montre au public vient de son profil.
  return fiche.role === 'agent' ? '/app/profile/public-profile' : '/app/profile';
}

/**
 * TCK-2522 / TCK-2523 — la barre d'actions d'une fiche, au téléphone (fixée en bas : elle remplace
 * la barre d'onglets, ADR-0091 § 4), et sa carte de contact dans la colonne d'identité en bureau.
 *
 * TCK-2576 — l'ordre de la maquette D : **WhatsApp, puis Appeler, puis Message**. WhatsApp n'est là
 * que si l'API l'a dit du numéro publié ({@link ContactDeFicheProps.whatsapp}) ; il prend alors
 * l'action principale. Au téléphone, trois canaux : WhatsApp garde son libellé, Appeler et Message
 * deviennent des boutons carrés à nom accessible — trois libellés ne tiennent pas en 360 px.
 */
export function ContactDeFiche({ nom, telephone, whatsapp = null, message, sousTitre = null, fiche }: ContactDeFicheProps) {
  const t = useTranslations('publicProfile.contact');
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const deSoi = useFicheDeSoi(fiche);
  const telHref = telephone ? `tel:${telephonePublie(telephone)}` : null;

  if (deSoi && fiche) return <VotreFiche fiche={fiche} />;
  if (!telHref && !message && !whatsapp) return null;

  const boutonMessage = (classe: string, iconeSeule = false) => {
    if (!message) return null;
    const libelle = message.genre === 'agence' ? t('ecrireALAgence') : t('message');
    const contenu = (
      <>
        {message.genre === 'agence' ? <Building2 className="size-[18px]" aria-hidden /> : message.genre === 'courriel' ? <Mail className="size-[18px]" aria-hidden /> : <MessageCircle className="size-[18px]" aria-hidden />}
        <span className={cn(iconeSeule && 'sr-only')}>{libelle}</span>
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

  const boutonAppel = (classe: string, iconeSeule = false) =>
    telHref ? (
      <a data-canal="appel" href={telHref} className={classe}>
        <Phone className="size-[18px]" aria-hidden />
        <span className={cn(iconeSeule && 'sr-only')}>{t('call')}</span>
      </a>
    ) : null;

  const boutonWhatsApp = (classe: string) =>
    whatsapp ? (
      <LienWhatsApp
        data-canal="whatsapp"
        numero={whatsapp}
        texte={t('whatsappPrefill', { nom })}
        aria-label={t('whatsappAria', { nom })}
        className={classe}
      >
        {t('whatsapp')}
      </LienWhatsApp>
    ) : null;

  const principal =
    'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[0.9375rem] font-semibold text-primary-foreground transition-[background-color,scale] hover:bg-[var(--primary-deep)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
  const secondaire =
    'inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[0.9375rem] font-semibold text-foreground transition-[border-color,scale] hover:border-primary active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
  // TCK-2576 — WhatsApp, la couleur de WhatsApp (celle du bouton d'un bien), action principale quand
  // il existe ; sinon l'appel ; sinon le message.
  const classeWhatsApp =
    'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-success px-4 text-[0.9375rem] font-semibold text-success-foreground transition-[background-color,scale] hover:bg-success/90 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
  const classeAppel = whatsapp ? secondaire : principal;
  const classeMessage = whatsapp || telHref ? secondaire : principal;
  // Au téléphone, trois canaux ne tiennent pas avec leurs libellés : les deux suivants passent en carré.
  const troisCanaux = Boolean(whatsapp && telHref && message);
  const carre = 'w-12 flex-none px-0';

  return (
    <>
      {/* Bureau : la carte de contact, dans la colonne d'identité. */}
      <div data-contact-fiche="carte" className="hidden rounded-2xl border border-border bg-card p-5 shadow-[0_12px_32px_-20px_color-mix(in_oklab,var(--shadow-color)_45%,transparent)] lg:block">
        <p className="font-display text-lg font-semibold tracking-tight text-foreground">{t('contacterNom', { nom })}</p>
        {sousTitre ? <p className="mt-0.5 text-sm text-muted-foreground">{sousTitre}</p> : null}
        <div className="mt-4 flex flex-col gap-2">
          {boutonWhatsApp(classeWhatsApp)}
          {boutonAppel(classeAppel)}
          {boutonMessage(classeMessage)}
        </div>
      </div>

      {/* Téléphone : la barre d'actions, fixée en bas — la seule couche (ADR-0091 § 4). */}
      <div
        data-contact-fiche="barre"
        className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border bg-card px-4 pb-[max(var(--spacing)*4,env(safe-area-inset-bottom))] pt-3 lg:hidden"
      >
        {boutonWhatsApp(cn(classeWhatsApp, 'flex-1'))}
        {boutonAppel(cn(classeAppel, troisCanaux ? carre : 'flex-1'), troisCanaux)}
        {boutonMessage(cn(classeMessage, troisCanaux ? carre : 'flex-1'), troisCanaux)}
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

/**
 * TCK-2575 — sa propre fiche : « C'est votre fiche publique » et le lien qui la modifie, à la place
 * des canaux — ni « Appeler », ni « Message », ni formulaire. Mêmes deux emplacements que le contact.
 */
function VotreFiche({ fiche }: { readonly fiche: FicheIdentifiee }) {
  const t = useTranslations('publicProfile.contact');
  const agence = fiche.genre === 'agence';
  const href = ecranDeModification(fiche);
  const titre = agence ? t('votreFicheAgence') : t('votreFiche');
  const lien = agence ? t('modifierLaFicheDeLAgence') : t('modifierMaFiche');
  const classeLien =
    'inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[0.9375rem] font-semibold text-foreground transition-[border-color,scale] hover:border-primary active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

  return (
    <>
      <div data-contact-fiche="carte" data-fiche-de-soi="" className="hidden rounded-2xl border border-border bg-card p-5 shadow-[0_12px_32px_-20px_color-mix(in_oklab,var(--shadow-color)_45%,transparent)] lg:block">
        <p className="font-display text-lg font-semibold tracking-tight text-foreground">{titre}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('votreFicheAide')}</p>
        <LienLocalise data-lien="modifier-la-fiche" href={href} className={cn(classeLien, 'mt-4 w-full')}>
          <PencilLine className="size-[18px]" aria-hidden />
          {lien}
        </LienLocalise>
      </div>

      <div
        data-contact-fiche="barre"
        data-fiche-de-soi=""
        className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-card px-4 pb-[max(var(--spacing)*4,env(safe-area-inset-bottom))] pt-3 lg:hidden"
      >
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{titre}</p>
        <LienLocalise data-lien="modifier-la-fiche" href={href} className={cn(classeLien, 'shrink-0')}>
          <PencilLine className="size-[18px]" aria-hidden />
          {lien}
        </LienLocalise>
      </div>
    </>
  );
}
