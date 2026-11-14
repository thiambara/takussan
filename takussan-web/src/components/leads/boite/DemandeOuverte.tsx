'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Mail,
  MessageSquareText,
  Phone,
  Send,
  SquareCheckBig,
  UserPlus,
  UserRoundCheck,
  UserRoundSearch,
} from 'lucide-react';

import type { CustomerDuplicateMatch } from '@/app/actions/dashboard-customers';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toast';
import { Vignette } from '@/components/visits/planification/PiecesDeLaPlanification';
import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initialesDe, nomAffichable } from '@/lib/identite';
import { formaterTelephone } from '@/lib/phone';
import {
  type BienDeLaDemande,
  type CanalDeContact,
  type ContactLead,
  useBienDeLaDemande,
  useConvertLead,
  useHandleLead,
} from '@/lib/queries/contact-leads';
import { cn } from '@/lib/utils';

import { AttribuerDialog } from './AttribuerDialog';
import {
  ageAffiche,
  BarreDeLaDemande,
  CitationDuMessage,
  GestesDuBureau,
  PointDAge,
  Surtitre,
  useTexteDeLAge,
  type GestesDeLaDemandeProps,
} from './pieces';

/** TCK-1343 — les fiches existantes d'un 409 `customer.duplicate`, sinon `null`. */
function doublonsDe(e: unknown): CustomerDuplicateMatch[] | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const data = e.data as { code?: unknown; existing?: unknown } | null;
  if (!data || data.code !== 'customer.duplicate' || !Array.isArray(data.existing)) return null;
  return data.existing as CustomerDuplicateMatch[];
}

/** P182.03 (TCK-1824) — la fiche d'un 409 `lead.already_converted`, sinon `null`. */
function ficheDejaCreeeDe(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const data = e.data as { code?: unknown; customer?: { id?: unknown } | null } | null;
  if (!data || data.code !== 'lead.already_converted' || typeof data.customer?.id !== 'number') return null;
  return data.customer.id;
}

/** Les sources connues, nommées ; une autre passe telle quelle (« Arrivé par {source} »). */
const SOURCES_NOMMEES = ['google', 'facebook', 'whatsapp', 'instagram'] as const;

export function useSourceDeLaDemande() {
  const t = useTranslations('contactLeads');
  return (lead: Pick<ContactLead, 'source' | 'property_id' | 'property'>): string => {
    const source = lead.source?.trim().toLowerCase() ?? '';
    if ((SOURCES_NOMMEES as readonly string[]).includes(source)) return t(`detail.sources.${source as (typeof SOURCES_NOMMEES)[number]}`);
    if (source) return t('source', { source: lead.source as string });
    return lead.property_id !== null ? t('detail.sources.property') : t('detail.sources.agent');
  };
}

interface DemandeOuverteProps extends Omit<GestesDeLaDemandeProps, 'nom'> {
  readonly nom: string;
  readonly maintenant: Date;
  readonly regime: 'telephone' | 'bureau';
  /** Téléphone : « 2 sur 4 à traiter », sous le titre de l'écran. */
  readonly position?: string;
  /** Téléphone : où mène « ✕ » (la boîte, sans la demande ouverte). */
  readonly repli?: string;
  /** Bureau : la barre « Vous avez répondu ? », au pied du panneau. */
  readonly pied?: ReactNode;
}

/**
 * TCK-2584 — la demande ouverte, entière : au téléphone, l'écran plein de la maquette (`app-demandes`
 * a-1, « Demande ouverte ») sous l'en-tête de la coque (`plein-ecran`, « ✕ », « Plus ») avec la barre
 * collante des gestes ; dès `lg`, le panneau de droite de la boîte du bureau (`app-fil-commercial`
 * a-0) — gestes en barre, puis la demande sur deux colonnes dès `xl`.
 *
 * Tout ce que la carte d'avant portait est gardé (relevé de l'audit, § 1) : message entier,
 * téléphone, e-mail, destinataire « pour … », source « Arrivé par … », le bien vers sa fiche publique,
 * Convertir (doublon, « Convertir quand même », déjà convertie), Marquer traitée, Attribuer.
 */
export function DemandeOuverte(props: DemandeOuverteProps) {
  const { lead, nom, maintenant, regime, position, repli, pied, onContact, messageWhatsApp } = props;
  const t = useTranslations('contactLeads');
  const tDoublon = useTranslations('agentCrm.form.duplicate');
  const f = useFormatteurs();
  const toast = useToast();
  const { user } = useAuth();
  const texteDAge = useTexteDeLAge();
  const sourceDe = useSourceDeLaDemande();
  const handle = useHandleLead();
  const convert = useConvertLead();
  const lu = useBienDeLaDemande(lead.property_id);
  const bien = lu.data?.data ?? null;
  const [fichePosee, setFichePosee] = useState<number | null>(null);
  // P182.03 (TCK-1824) — la fiche relue compte autant que celle que la conversion vient de poser.
  const customerId = fichePosee ?? lead.customer_id;
  const [attribuer, setAttribuer] = useState(false);
  const [doublons, setDoublons] = useState<CustomerDuplicateMatch[] | null>(null);
  // P152.05 — `PropertyContactLeadPolicy::assign` exige `crm.assign` dans l'agence DE LA DEMANDE ;
  // la liste des collègues est celle de cette agence (l'audit relevait celle de l'utilisateur).
  const { can: peutAttribuer } = useCan('crm.assign', lead.agency_id ?? undefined, user !== null && lead.agency_id !== null);
  const attribuable = peutAttribuer && !lead.handled_at && lead.agency_id !== null;
  const traitable = !lead.handled_at && !customerId;

  const age = ageAffiche(lead, maintenant);
  const recue = t('detail.dateAt', { jour: f.jourMois(lead.created_at, maintenant), heure: f.heure(lead.created_at) });
  const source = lead.recipient ? t('detail.sourceFor', { source: sourceDe(lead), name: nomAffichable(lead.recipient) }) : sourceDe(lead);

  async function marquerTraitee() {
    try {
      await handle.mutateAsync({ id: lead.id });
      toast.add({ title: t('toasts.handled'), type: 'success' });
    } catch {
      toast.add({ title: t('toasts.error'), type: 'error' });
    }
  }

  async function convertir(forcer = false) {
    try {
      const res = await convert.mutateAsync(forcer ? { id: lead.id, allow_duplicate: true } : { id: lead.id });
      setDoublons(null);
      setFichePosee(res.customer.id);
      toast.add({ title: t('toasts.converted'), type: 'success' });
    } catch (e) {
      const dejaCreee = ficheDejaCreeeDe(e);
      if (dejaCreee !== null) {
        setDoublons(null);
        setFichePosee(dejaCreee);
        return;
      }
      const trouves = doublonsDe(e);
      if (trouves) {
        setDoublons(trouves);
        return;
      }
      toast.add({ title: t('toasts.error'), type: 'error' });
    }
  }

  async function copier() {
    if (!lead.phone) return;
    try {
      await navigator.clipboard.writeText(lead.phone);
      toast.add({ title: t('detail.copied'), type: 'success' });
    } catch {
      toast.add({ title: t('toasts.error'), type: 'error' });
    }
  }

  const ecrire = () => onContact(lead, 'email' satisfies CanalDeContact);

  const tete = (
    <div data-slot="tete-de-la-demande" className="flex items-center gap-3">
      <Avatar size="48" aria-hidden="true">
        <AvatarFallback>{initialesDe({ first_name: nom.split(' ')[0] ?? null, last_name: nom.split(' ').slice(1).join(' ') || null }) ?? '?'}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-affiche-22 leading-tight font-semibold tracking-titre text-foreground">{nom}</h2>
        <p className={cn('mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm', age.enRetard ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
          <PointDAge enRetard={age.enRetard} />
          <span data-slot="age-de-la-demande" className="tabular-nums">{texteDAge(age)}</span>
          <span className="font-normal text-muted-foreground">· {t('detail.receivedOn', { date: recue })}</span>
          {lead.handled_at ? (
            <span className="font-normal text-muted-foreground">
              · {t('handledAt', { date: t('detail.dateAt', { jour: f.jourMois(lead.handled_at, maintenant), heure: f.heure(lead.handled_at) }) })}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );

  const message = lead.message ? (
    <div>
      <Surtitre>{t('detail.message')}</Surtitre>
      <CitationDuMessage message={lead.message} source={source} className={regime === 'bureau' ? 'px-5 py-4' : undefined} />
    </div>
  ) : (
    <p className="text-xs text-muted-foreground">{source}</p>
  );

  const coordonnees = (
    <div data-slot="coordonnees" className="divide-y divide-border rounded-xl border border-border bg-card">
      <div className="flex h-12 items-center gap-3 px-3.5">
        <Phone className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-corps tabular-nums">
          {lead.phone ? formaterTelephone(lead.phone) : <span className="text-muted-foreground">{t('detail.noPhone')}</span>}
        </span>
        {lead.phone ? (
          <button
            type="button"
            onClick={() => void copier()}
            aria-label={t('detail.copyAria')}
            className="relative inline-flex items-center gap-1 rounded-sm text-ui font-medium text-muted-foreground outline-none after:absolute after:-inset-3 after:content-[''] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
          >
            <Copy className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            {t('detail.copy')}
          </button>
        ) : null}
      </div>
      <div className="flex h-12 items-center gap-3 px-3.5">
        <Mail className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-corps">
          {lead.email ? <span className="break-all">{lead.email}</span> : <span className="text-muted-foreground">{t('detail.noEmail')}</span>}
        </span>
      </div>
    </div>
  );

  const doublon =
    doublons && !customerId ? (
      <div role="status" className="space-y-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm">
        <p className="font-medium text-foreground">{tDoublon('title')}</p>
        <ul className="space-y-1">
          {doublons.map((d, i) => (
            <li key={d.id ?? `hidden-${i}`} className="flex flex-wrap items-center gap-x-2">
              <span>
                {d.name ?? tDoublon('hidden')}
                {' · '}
                {tDoublon(`matchedOn.${d.matched_on}`)}
              </span>
              {d.id !== null ? (
                <Link href={`/app/customers/${d.id}`} className="underline underline-offset-2">
                  {tDoublon('open')}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
        <Button variant="outline" size="sm" onClick={() => void convertir(true)} disabled={convert.isPending}>
          {t('actions.convertAnyway')}
        </Button>
      </div>
    ) : null;

  const dialogue = attribuable && attribuer && lead.agency_id !== null ? (
    <AttribuerDialog leadId={lead.id} agencyId={lead.agency_id} onClose={() => setAttribuer(false)} />
  ) : null;

  if (regime === 'telephone') {
    // `app-demandes` a-1 : déjà client·e, la première ligne mène à SA fiche plutôt que d'en créer une.
    const ficheConnue = lead.known_customer?.id ?? null;
    const lignes: LigneDePlus[] = [
      customerId
        ? { cle: 'fiche', icone: UserPlus, titre: t('actions.openCustomer'), detail: t('detail.openCustomerDetail'), href: `/app/customers/${customerId}` }
        : ficheConnue !== null
          ? { cle: 'fiche', icone: UserPlus, titre: t('actions.openCustomer'), detail: t('detail.openKnownDetail'), href: `/app/customers/${ficheConnue}` }
          : { cle: 'convertir', icone: UserPlus, titre: t('detail.convertTitle'), detail: t('detail.convertDetail'), onClick: () => void convertir(), inactif: convert.isPending },
      ...(attribuable ? [{ cle: 'attribuer', icone: Send, titre: t('detail.assignTitle'), detail: t('detail.assignDetail'), onClick: () => setAttribuer(true) }] : []),
      ...(traitable ? [{ cle: 'traiter', icone: SquareCheckBig, titre: t('actions.handle'), detail: t('detail.handleDetail'), onClick: () => void marquerTraitee(), inactif: handle.isPending }] : []),
      lead.email
        ? { cle: 'email', icone: Mail, titre: t('detail.emailTitle'), detail: lead.email, href: `mailto:${lead.email}`, onClick: ecrire, externe: true }
        : { cle: 'email', icone: Mail, titre: t('detail.emailTitle'), detail: t('detail.emailNone'), inactif: true },
    ];
    return (
      <div data-slot="demande-ouverte" data-regime="telephone" className="space-y-4 px-4 pt-4 pb-6">
        <DeclarerEnTete forme="plein-ecran" titre={t('detail.title')} sousTitre={position} repli={repli} droite={<MenuPlus libelle={t('detail.more')} lignes={lignes} />} />
        {tete}
        <CarteDuBien lead={lead} bien={bien} />
        {message}
        {coordonnees}
        <DejaConnu lead={lead} />
        {doublon}
        <div>
          <Surtitre>{t('detail.more')}</Surtitre>
          <ListeDePlus lignes={lignes} />
        </div>
        {dialogue}
        {/* La barre collante du téléphone, dans l'emplacement de la coque. `md:flex` : de 768 à 1023 la
            boîte garde son régime téléphone (deux panneaux dès `lg` seulement) — sans elle, les gestes
            n'y seraient nulle part. */}
        <BarreDAction className="md:flex">{pied ?? <BarreDeLaDemande {...props} />}</BarreDAction>
      </div>
    );
  }

  return (
    <div data-slot="demande-ouverte" data-regime="bureau" className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex min-h-16 flex-none items-center border-b border-border bg-card px-6 max-xl:py-3">
        <GestesDuBureau {...props} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-[1_1_calc(var(--spacing)*66.67)]">{tete}</div>
          <span className="flex flex-none flex-wrap items-center gap-1">
            {customerId ? (
              <Link href={`/app/customers/${customerId}`} className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-ui font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring')}>
                <UserPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('actions.openCustomer')}
              </Link>
            ) : lead.known_customer?.id != null ? (
              // `app-demandes` a-1 : déjà client·e — la fiche existe, on y va plutôt que d'en créer une.
              <Link href={`/app/customers/${lead.known_customer.id}`} className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-ui font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring')}>
                <UserPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('actions.openKnown')}
              </Link>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void convertir()} disabled={convert.isPending}>
                <UserPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('actions.convert')}
              </Button>
            )}
            {attribuable ? (
              <Button variant="outline" size="sm" onClick={() => setAttribuer(true)}>
                <Send className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('actions.assign')}
              </Button>
            ) : null}
            {traitable ? (
              <Button variant="outline" size="sm" onClick={() => void marquerTraitee()} disabled={handle.isPending}>
                <SquareCheckBig className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('actions.handle')}
              </Button>
            ) : null}
          </span>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*83.33)]">
          <div className="space-y-5">
            {message}
            <div>
              <Surtitre>{t('detail.property')}</Surtitre>
              <CarteDuBien lead={lead} bien={bien} />
            </div>
            <DejaConnu lead={lead} />
            {doublon}
          </div>
          <div className="space-y-5">
            <div>
              <Surtitre>{t('detail.requester')}</Surtitre>
              {coordonnees}
            </div>
            {lead.phone ? (
              <div>
                <Surtitre>{t('detail.toReply')}</Surtitre>
                <div className="rounded-xl border border-border bg-card p-3.5 text-ui leading-relaxed text-muted-foreground">
                  <p className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground">
                    <IconeWhatsApp className="size-4 text-success lg:size-4" />
                    {t('detail.prefilled')}
                  </p>
                  « {messageWhatsApp} »
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {pied}
      {dialogue}
    </div>
  );
}

/* ───────────────────────────── le bien ───────────────────────────── */

function CarteDuBien({ lead, bien }: { readonly lead: ContactLead; readonly bien: BienDeLaDemande | null }) {
  const t = useTranslations('contactLeads');
  const f = useFormatteurs();
  if (!lead.property) {
    return (
      <div data-slot="carte-du-bien" className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <span className="inline-flex size-14 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <MessageSquareText className="size-6" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 leading-snug">
          <span className="block text-corps font-semibold">{t('detail.directTitle')}</span>
          <span className="block text-ui text-muted-foreground">{t('detail.directBody')}</span>
        </span>
      </div>
    );
  }
  const prix =
    bien && bien.price !== null && bien.price !== undefined && bien.price !== ''
      ? bien.contract_type === 'rent'
        ? t('detail.rentPrice', { price: f.montantCourt(Number(bien.price), bien.currency) })
        : f.montantCourt(Number(bien.price), bien.currency)
      : null;
  return (
    <Link
      href={`/properties/${lead.property.slug}`}
      data-slot="carte-du-bien"
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring"
    >
      {/* 56 px aux deux largeurs (`app-demandes` a-1) : la densité du bureau ne réduit pas la vignette. */}
      <Vignette src={bien?.main_photo_url ?? null} className="size-14 lg:size-[calc(var(--spacing)*15.56)]" />
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block truncate text-corps font-semibold">{lead.property.title}</span>
        <span className="block truncate text-ui text-muted-foreground">{t('detail.seeProperty')}</span>
        {prix ? <span className="block truncate text-sm font-medium tabular-nums">{prix}</span> : null}
      </span>
      <ChevronRight className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
    </Link>
  );
}

/* ───────────────────────────── déjà connu ? ───────────────────────────── */

/** TCK-2582 — le doublon dit d'avance. Rien pour qui ne juge pas (`known_customer` absent : le bailleur). */
function DejaConnu({ lead }: { readonly lead: ContactLead }) {
  const t = useTranslations('contactLeads.detail');
  if (lead.known_customer === undefined) return null;
  const connu = lead.known_customer;
  if (connu) {
    const visible = connu.id !== null;
    return (
      <div data-slot="deja-connu" data-connu="" className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-3.5 py-3">
        <UserRoundCheck className="size-5 flex-none text-success" strokeWidth={1.75} aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <span className="font-semibold">
            {visible && connu.visits_count !== null ? t('knownTitle', { count: connu.visits_count }) : t('knownTitleHidden')}
          </span>
          <span className="block text-muted-foreground">{visible && connu.name ? t('knownBody', { name: connu.name }) : t('knownBodyHidden')}</span>
        </p>
        {visible ? (
          <Link href={`/app/customers/${connu.id}`} className="relative flex-none rounded-sm text-sm font-medium text-primary outline-none after:absolute after:-inset-3 after:content-[''] focus-visible:ring-3 focus-visible:ring-ring">
            {t('knownOpen')}
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <div data-slot="deja-connu" className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-3.5 py-3">
      <UserRoundSearch className="size-5 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="font-semibold">{t('unknownTitle')}</span>
        <span className="block text-muted-foreground">{t('unknownBody')}</span>
      </p>
    </div>
  );
}

/* ───────────────────────────── « Plus » ───────────────────────────── */

interface LigneDePlus {
  readonly cle: string;
  readonly icone: typeof Mail;
  readonly titre: string;
  readonly detail: string;
  readonly href?: string;
  readonly externe?: boolean;
  readonly onClick?: () => void;
  readonly inactif?: boolean;
}

function ListeDePlus({ lignes }: { readonly lignes: readonly LigneDePlus[] }) {
  return (
    <div data-slot="plus-de-la-demande" className="divide-y divide-border rounded-xl border border-border bg-card">
      {lignes.map((l) => {
        const contenu = (
          <>
            <l.icone className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block text-corps font-medium">{l.titre}</span>
              <span className="block truncate text-ui text-muted-foreground">{l.detail}</span>
            </span>
            <ChevronRight className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          </>
        );
        const classe = 'flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset';
        if (l.href) {
          return l.externe ? (
            <a key={l.cle} href={l.href} onClick={l.onClick} className={classe}>
              {contenu}
            </a>
          ) : (
            <Link key={l.cle} href={l.href} className={classe}>
              {contenu}
            </Link>
          );
        }
        return (
          <button key={l.cle} type="button" onClick={l.onClick} disabled={l.inactif} className={cn(classe, 'disabled:opacity-60')}>
            {contenu}
          </button>
        );
      })}
    </div>
  );
}

/** « Plus ▾ » de l'en-tête du téléphone : les mêmes gestes, en menu. */
/**
 * « Plus ▾ » de l'en-tête du téléphone. Rendu PAR LA COQUE (`DeclarerEnTete droite`), hors de la
 * frontière de `/app/leads` : le dictionnaire servi là ne porte pas `contactLeads`
 * (`src/i18n/namespaces.json`). Il ne lit donc aucune traduction — tous ses libellés arrivent faits.
 */
function MenuPlus({ libelle, lignes }: { readonly libelle: string; readonly lignes: readonly LigneDePlus[] }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex h-11 items-center gap-0.5 rounded-md pr-3 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
          />
        }
      >
        {libelle}
        <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {lignes
          .filter((l) => !l.inactif)
          .map((l) => (
            <DropdownMenuItem
              key={l.cle}
              onClick={() => {
                l.onClick?.();
                if (l.href && l.externe) window.location.assign(l.href);
                else if (l.href) router.push(l.href);
              }}
            >
              <l.icone className="size-4" aria-hidden="true" />
              <span>{l.titre}</span>
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
