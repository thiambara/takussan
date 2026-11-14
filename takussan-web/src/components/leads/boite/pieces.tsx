'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarPlus, ChevronRight, Mail, Phone } from 'lucide-react';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { telHref, whatsappHref } from '@/components/crm/contact';
import { ageDeLaDemande, prenomDuDemandeur, type AgeDeLaDemande } from '@/lib/demandes/boite';
import type { CanalDeContact, ContactLead } from '@/lib/queries/contact-leads';
import { cn } from '@/lib/utils';

/**
 * TCK-2584 — les pièces de la boîte « Demandes » (maquette `app-demandes` a, et la boîte du bureau
 * de `app-fil-commercial` a) : l'âge et son point, les trois gestes d'une ligne, la barre d'une
 * demande ouverte, la citation du message. Statiques ; la boîte (`ContactLeadsInbox`) les assemble.
 */

/** Le nom affiché d'une demande : son nom, ou « Visiteur ». */
export function useNomDeLaDemande() {
  const t = useTranslations('contactLeads');
  return (lead: Pick<ContactLead, 'name'>): string => lead.name?.trim() || t('anonymous');
}

/** « il y a 8 j », « il y a 25 min », « à l'instant ». */
export function useTexteDeLAge() {
  const t = useTranslations('contactLeads.age');
  return (age: AgeDeLaDemande): string => {
    switch (age.unite) {
      case 'minutes':
        return t('minutes', { n: age.valeur });
      case 'heures':
        return t('hours', { n: age.valeur });
      case 'jours':
        return t('days', { n: age.valeur });
      default:
        return t('justNow');
    }
  };
}

/** L'âge d'une demande À TRAITER : une demande traitée n'est jamais « en retard ». */
export function ageAffiche(lead: Pick<ContactLead, 'created_at' | 'handled_at'>, maintenant: Date): AgeDeLaDemande {
  const age = ageDeLaDemande(lead.created_at, maintenant);
  return lead.handled_at ? { ...age, enRetard: false } : age;
}

/** Le point d'une demande : rouge au-delà de 24 h, terre cuite sinon. Décoratif : l'âge le dit. */
export function PointDAge({ enRetard, className }: { readonly enRetard: boolean; readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="point-d-age"
      data-en-retard={enRetard ? '' : undefined}
      className={cn('inline-block size-2 flex-none rounded-full', enRetard ? 'bg-destructive' : 'bg-primary', className)}
    />
  );
}

/** L'âge, en rouge et gras au-delà de 24 h. */
export function TexteDAge({ age, texte, className }: { readonly age: AgeDeLaDemande; readonly texte: string; readonly className?: string }) {
  return (
    <span
      data-slot="age-de-la-demande"
      data-en-retard={age.enRetard ? '' : undefined}
      className={cn('flex-none tabular-nums', age.enRetard ? 'font-semibold text-destructive' : 'text-muted-foreground', className)}
    >
      {texte}
    </span>
  );
}

/** Le surtitre d'un bloc de la demande ouverte : « SON MESSAGE », « LE BIEN DEMANDÉ ». */
export function Surtitre({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <p className={cn('mb-2 text-legende font-semibold tracking-surtitre text-muted-foreground uppercase', className)}>{children}</p>;
}

/** Le message du demandeur, cité tel quel, entier. */
export function CitationDuMessage({ message, source, className }: { readonly message: string; readonly source?: ReactNode; readonly className?: string }) {
  return (
    <figure className={cn('rounded-xl border-l-3 border-primary/50 bg-secondary/60 px-3.5 py-3', className)}>
      <blockquote className="text-corps leading-relaxed whitespace-pre-line text-pretty text-foreground">« {message} »</blockquote>
      {source ? <figcaption className="mt-1.5 text-xs text-muted-foreground">{source}</figcaption> : null}
    </figure>
  );
}

/* ───────────────────────────── les gestes de contact ───────────────────────────── */

export interface GestesDeLaDemandeProps {
  readonly lead: ContactLead;
  readonly nom: string;
  /** Le message WhatsApp prérempli. */
  readonly messageWhatsApp: string;
  /** Le geste est touché : l'appelant l'enregistre (`POST …/contacts`) et attend le retour. */
  readonly onContact: (lead: ContactLead, canal: CanalDeContact) => void;
  readonly onVisite: (lead: ContactLead) => void;
}

const GESTE = 'inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring';
const TON_WHATSAPP = 'bg-success text-success-foreground hover:bg-success/90';
const TON_CONTOUR = 'border border-border bg-card text-foreground hover:bg-muted';
const TON_DOUX = 'bg-secondary text-primary-deep hover:bg-secondary/80';
const TON_PRIMAIRE = 'bg-primary text-primary-foreground hover:bg-primary/90';

/** Le numéro d'une demande, composable : ses chiffres, `+` gardé. Un numéro saisi par un visiteur. */
function numeroDe(lead: ContactLead): string | null {
  const brut = lead.phone?.replace(/[^\d+]/g, '') ?? '';
  return /\d{6,}/.test(brut) ? brut : null;
}

/** WhatsApp, Appeler : deux liens qui enregistrent le geste au toucher, sans retenir l'ouverture. */
function LiensDeContact({
  lead,
  nom,
  messageWhatsApp,
  onContact,
  classe,
  libelles = true,
}: Omit<GestesDeLaDemandeProps, 'onVisite'> & { readonly classe: (teinte: string) => string; readonly libelles?: boolean }) {
  const t = useTranslations('contactLeads');
  const numero = numeroDe(lead);
  if (!numero) return null;
  return (
    <>
      <a
        href={whatsappHref(numero, messageWhatsApp)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onContact(lead, 'whatsapp')}
        aria-label={t('gestures.whatsappAria', { name: nom })}
        data-slot="geste-whatsapp"
        className={classe(TON_WHATSAPP)}
      >
        <IconeWhatsApp className="size-icone" />
        {libelles ? t('actions.whatsapp') : null}
      </a>
      <a
        href={telHref(numero)}
        onClick={() => onContact(lead, 'call')}
        aria-label={t('gestures.callAria', { name: nom })}
        data-slot="geste-appeler"
        className={classe(TON_CONTOUR)}
      >
        <Phone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
        {libelles ? t('actions.call') : null}
      </a>
    </>
  );
}

/** La rangée d'une ligne au téléphone : WhatsApp · Appeler · Visite ▸, 44 px (`app-demandes` a-0). */
export function TroisGestes(props: GestesDeLaDemandeProps & { readonly className?: string }) {
  const t = useTranslations('contactLeads');
  const { lead, nom, onVisite, className } = props;
  const classe = (teinte: string) => cn(GESTE, 'h-11 rounded-xl px-2 text-sm', teinte);
  return (
    <div data-slot="trois-gestes" className={cn('grid grid-cols-[1.25fr_1fr_1fr] gap-2', className)}>
      <LiensDeContact {...props} classe={classe} />
      <button
        type="button"
        onClick={() => onVisite(lead)}
        aria-label={t('gestures.visitAria', { name: nom })}
        data-slot="geste-visite"
        className={cn(classe(TON_DOUX), 'col-start-3')}
      >
        <CalendarPlus className="size-icone" strokeWidth={1.75} aria-hidden="true" />
        {t('gestures.visit')}
        <ChevronRight className="-ml-1 size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

/** La barre collante d'une demande ouverte au téléphone : WhatsApp, Appeler, puis la visite (48 px). */
export function BarreDeLaDemande(props: GestesDeLaDemandeProps) {
  const t = useTranslations('contactLeads');
  const { lead, nom, onVisite } = props;
  const prenom = prenomDuDemandeur(lead.name) ?? nom;
  const classe = (teinte: string) => cn(GESTE, 'h-11 rounded-xl px-3.5 text-corps', teinte);
  return (
    <div data-slot="barre-de-la-demande" className="w-full space-y-2">
      {numeroDe(lead) ? (
        <div className="grid grid-cols-2 gap-2">
          <LiensDeContact {...props} classe={classe} />
        </div>
      ) : null}
      <button type="button" onClick={() => onVisite(lead)} data-slot="geste-visite" className={cn(GESTE, 'h-12 w-full rounded-xl px-3.5 text-corps', TON_PRIMAIRE)}>
        <CalendarPlus className="size-icone" strokeWidth={1.75} aria-hidden="true" />
        {t('gestures.proposeVisitTo', { name: prenom })}
        <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

/** La barre du panneau de droite au bureau : WhatsApp · Appeler · E-mail · Proposer une visite. */
export function GestesDuBureau(props: GestesDeLaDemandeProps) {
  const t = useTranslations('contactLeads');
  const { lead, nom, onContact, onVisite } = props;
  const classe = (teinte: string) => cn(GESTE, 'h-9 flex-none rounded-lg px-3.5 text-sm', teinte);
  return (
    <div data-slot="gestes-du-bureau" className="flex flex-wrap items-center gap-2">
      <LiensDeContact {...props} classe={classe} />
      {lead.email ? (
        <a
          href={`mailto:${lead.email}`}
          onClick={() => onContact(lead, 'email')}
          aria-label={t('gestures.emailAria', { name: nom })}
          data-slot="geste-email"
          className={classe(TON_CONTOUR)}
        >
          <Mail className="size-icone" strokeWidth={1.75} aria-hidden="true" />
          {t('actions.email')}
        </a>
      ) : (
        // `app-demandes` a-1 : le geste reste à sa place sans adresse — inactif, et dit pourquoi.
        <button type="button" disabled title={t('gestures.noEmail')} data-slot="geste-email" className={classe('border border-border bg-card text-muted-foreground')}>
          <Mail className="size-icone" strokeWidth={1.75} aria-hidden="true" />
          {t('actions.email')}
        </button>
      )}
      <button type="button" onClick={() => onVisite(lead)} data-slot="geste-visite" className={classe(TON_PRIMAIRE)}>
        <CalendarPlus className="size-icone" strokeWidth={1.75} aria-hidden="true" />
        {t('gestures.proposeVisit')}
      </button>
    </div>
  );
}
