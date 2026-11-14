'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Building2, Check, Mail, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge, type StatusTone } from '@/components/console';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { initiales } from '@/lib/fiche-publique';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomCompletDe, prenomDe } from '@/lib/identite';
import { formaterTelephone } from '@/lib/phone';
import { raisonSocialeDe, type OwnerProfileStatus, type OwnerProfileSummary } from '@/lib/queries/owners';
import { cn } from '@/lib/utils';

/**
 * TCK-2641 — les pièces du carnet des bailleurs (maquette `app-bailleurs` a, écran « Liste ») :
 * la carte du téléphone, la carte d'une invitation en cours, la rangée du tableau du bureau, et les
 * deux gestes Appeler / WhatsApp. Aucun montant n'est calculé ici : chaque chiffre est celui que
 * l'API rend sur la ligne (TCK-2640).
 */

/** Le SENS de chaque statut, la couleur restant décidée par `StatusBadge`. */
export const TON_DU_STATUT: Record<OwnerProfileStatus, StatusTone> = {
  draft: 'attention',
  active: 'success',
  inactive: 'neutral',
  blocked: 'danger',
};

export interface LectureDuBailleur {
  /** La raison sociale d'une société, sinon le nom de la personne. */
  readonly nom: string;
  readonly prenom: string;
  /** La personne de contact d'une société ; `null` pour un particulier. */
  readonly contact: string | null;
  readonly societe: boolean;
  readonly email: string | null;
  /** Celui du compte, sinon celui de l'invitation (TCK-2640), au format E.164 de l'API. */
  readonly telephone: string | null;
}

/** Le nom composé : celui du compte, sinon celui saisi à l'invitation (TCK-2136). */
function nomDeLaPersonne(owner: OwnerProfileSummary): { readonly nom: string; readonly prenom: string } {
  const meta = owner.metadata ?? null;
  const compte = nomCompletDe(owner.user);
  if (compte) return { nom: compte, prenom: prenomDe(owner.user) ?? '' };
  return { nom: nomCompletDe(meta) ?? '', prenom: prenomDe(meta) ?? '' };
}

export function lireLeBailleur(owner: OwnerProfileSummary): LectureDuBailleur {
  const personne = nomDeLaPersonne(owner);
  const raison = raisonSocialeDe(owner);
  return {
    nom: raison ?? personne.nom,
    prenom: personne.prenom,
    contact: raison ? personne.nom || null : null,
    societe: raison !== null,
    email: owner.contact_email ?? owner.user?.email ?? owner.metadata?.email ?? null,
    telephone: owner.contact_phone ?? owner.metadata?.phone ?? null,
  };
}

/** Les jours entiers écoulés depuis `iso` (0 le jour même). */
export function joursDepuis(iso: string, maintenant: Date): number {
  const ecart = maintenant.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ecart / 86_400_000));
}

/** Initiales d'un particulier ; un immeuble pour une société. */
export function AvatarDuBailleur({ lecture, taille }: { readonly lecture: LectureDuBailleur; readonly taille: 'telephone' | 'bureau' | 'fiche' }) {
  const dimension = taille === 'telephone' ? 'size-11' : taille === 'fiche' ? 'size-14' : 'size-[calc(var(--spacing)*10)]';
  if (lecture.societe) {
    return (
      // L'aplat d'accent de la maquette (`bg-accent/15`) est réservé aux badges *featured*
      // (check-valeurs-arbitraires-app) : la pastille d'avatar, teintée de l'accent.
      <span aria-hidden="true" className={cn('inline-flex flex-none items-center justify-center rounded-full bg-fond-avatar text-accent', dimension)}>
        <Building2 className="size-[45%]" strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-full bg-fond-avatar font-semibold text-encre-avatar',
        dimension,
        taille === 'bureau' ? 'text-legende' : 'text-base',
      )}
    >
      {initiales(lecture.nom)}
    </span>
  );
}

const GESTE = 'relative inline-flex flex-none items-center justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring';
const TON_WHATSAPP = 'bg-success text-success-foreground hover:bg-success/90';
const TON_CONTOUR = 'border border-border bg-card text-foreground hover:bg-muted';

/**
 * Appeler et WhatsApp : un numéro joignable seulement (`isReachable`). `rond` : 44 px sous le pouce ;
 * `petit` : 32 px de dessin au bureau, la souris n'en demandant pas plus.
 */
export function GestesDuBailleur({ lecture, forme }: { readonly lecture: LectureDuBailleur; readonly forme: 'rond' | 'petit' }) {
  const t = useTranslations('owners.carnet.gestes');
  const telephone = lecture.telephone;
  if (!isReachable(telephone)) return null;
  const classe = (teinte: string) => cn(GESTE, teinte, 'rounded-full', forme === 'rond' ? 'size-11' : 'size-[calc(var(--spacing)*8.89)]');
  const icone = forme === 'rond' ? 'size-icone' : 'size-3.5';
  return (
    <span className="relative flex flex-none items-center gap-2">
      <a href={telHref(telephone)} aria-label={t('appelerAria', { nom: lecture.nom })} data-slot="geste-appeler" className={classe(TON_CONTOUR)}>
        <Phone className={icone} strokeWidth={1.75} aria-hidden="true" />
      </a>
      <a
        href={whatsappHref(telephone, t('message', { prenom: lecture.prenom || lecture.nom }))}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('whatsappAria', { nom: lecture.nom })}
        data-slot="geste-whatsapp"
        className={classe(TON_WHATSAPP)}
      >
        <IconeWhatsApp className={icone} />
      </a>
    </span>
  );
}

/** « 7 biens · 6 occupés », « 3 biens · tous occupés ». */
export function useOccupation() {
  const t = useTranslations('owners.carnet');
  return (owner: OwnerProfileSummary): string => {
    const biens = owner.properties_count ?? 0;
    const occupes = owner.occupied_properties_count ?? 0;
    return t('occupation', { biens, occupes, tous: biens > 0 && occupes === biens ? 'oui' : 'non' });
  };
}

/** Le nom, lien vers la fiche quand le lecteur l'ouvre (l'admin, 3a), texte sinon. */
function NomDuBailleur({ owner, nom, lien, etire, className }: { readonly owner: OwnerProfileSummary; readonly nom: string; readonly lien: boolean; readonly etire?: boolean; readonly className?: string }) {
  if (!lien || owner.status === 'draft') return <span className={className}>{nom || '—'}</span>;
  return (
    <Link
      href={`/app/owners/${owner.id}`}
      data-slot="lien-vers-la-fiche"
      className={cn(className, 'text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline', etire && 'after:absolute after:inset-0')}
    >
      {nom || '—'}
    </Link>
  );
}

interface CarteProps {
  readonly owner: OwnerProfileSummary;
  readonly lienVersLaFiche: boolean;
}

/** Une carte du téléphone : initiales, nom, biens, gestes ; puis le reste à verser du mois. */
export function CarteDuBailleur({ owner, lienVersLaFiche }: CarteProps) {
  const t = useTranslations('owners.carnet');
  const f = useFormatteurs();
  const occupation = useOccupation();
  const lecture = lireLeBailleur(owner);
  const reste = owner.remaining_to_pay ?? null;
  return (
    <article data-slot="carte-du-bailleur" className="relative overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 py-3 pr-3 pl-3.5">
        <AvatarDuBailleur lecture={lecture} taille="telephone" />
        <div className="min-w-0 flex-1 leading-snug">
          <NomDuBailleur owner={owner} nom={lecture.nom} lien={lienVersLaFiche} etire className="block truncate text-base font-semibold" />
          <p className="truncate text-ui text-muted-foreground tabular-nums">{occupation(owner)}</p>
        </div>
        <GestesDuBailleur lecture={lecture} forme="rond" />
      </div>
      {reste !== null ? (
        <div className="flex items-baseline gap-3 border-t border-border bg-background/60 px-3.5 py-2 text-sm">
          {reste > 0 ? (
            <>
              <span className="min-w-0 flex-1 text-muted-foreground">{t('resteAVerser')}</span>
              <span className="font-semibold tabular-nums" data-slot="reste-a-verser">
                {f.montantCourt(reste)}
              </span>
            </>
          ) : (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-success">
                <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
                {t('toutEstVerse')}
              </span>
              {owner.last_payout_at ? (
                <span className="text-ui text-muted-foreground tabular-nums">{t('versementLe', { date: f.jourMois(owner.last_payout_at) })}</span>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

interface InvitationProps {
  readonly owner: OwnerProfileSummary;
  readonly maintenant: Date;
  readonly gestes: ReactNode;
}

/** L'invitation en cours : qui, depuis quand, et « Renvoyer » / « Révoquer » de 44 px. */
export function CarteDInvitation({ owner, maintenant, gestes }: InvitationProps) {
  const lecture = lireLeBailleur(owner);
  const envoi = useEnvoiDeLInvitation();
  return (
    <article data-slot="carte-d-invitation" className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-warning/20 text-foreground">
          <Mail className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 leading-snug">
          <p className="truncate text-base font-semibold">{lecture.nom || lecture.email || '—'}</p>
          <p className="truncate text-ui text-muted-foreground tabular-nums">{envoi(owner, maintenant)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {gestes}
        <GestesDuBailleur lecture={lecture} forme="rond" />
      </div>
    </article>
  );
}

/** « 3 biens · invitation envoyée il y a 3 j » ; sans date connue, « invitation envoyée ». */
export function useEnvoiDeLInvitation() {
  const t = useTranslations('owners.carnet');
  const occupation = useOccupation();
  return (owner: OwnerProfileSummary, maintenant: Date): string => {
    const envoyee = owner.pending_invitation_sent_at ?? null;
    const quand = envoyee ? t('invitationIlYa', { jours: joursDepuis(envoyee, maintenant) }) : t('invitationEnvoyee');
    return (owner.properties_count ?? 0) > 0 ? `${occupation(owner).split(' · ')[0]} · ${quand}` : quand;
  };
}

function Th({ children, className }: { readonly children?: ReactNode; readonly className?: string }) {
  return (
    <th scope="col" className={cn('h-10 px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground', className)}>
      {children}
    </th>
  );
}

function Td({ children, className }: { readonly children?: ReactNode; readonly className?: string }) {
  return <td className={cn('px-3 py-2.5 align-middle text-sm', className)}>{children}</td>;
}

interface TableProps {
  readonly owners: readonly OwnerProfileSummary[];
  readonly lienVersLaFiche: boolean;
  readonly maintenant: Date;
  /** Les gestes d'une invitation en cours (Renvoyer · Révoquer), portés par la liste. */
  readonly gestesDInvitation: (owner: OwnerProfileSummary) => ReactNode;
}

/**
 * Le tableau du bureau : Bailleur · Téléphone · Biens · Encaissé ce mois · Reste à verser · Dernier
 * versement · Statut. Les largeurs sont celles de la maquette, en pas du bureau (densité ×0,9 :
 * `--spacing` vaut 3,6 px) ; sous 1440, « Dernier versement » passe sous « Reste à verser ». Sous `xl`,
 * le tableau garde sa largeur et défile dans sa carte.
 */
export function TableDesBailleurs({ owners, lienVersLaFiche, maintenant, gestesDInvitation }: TableProps) {
  const t = useTranslations('owners.carnet');
  const tStatut = useTranslations('owners.page.status');
  const f = useFormatteurs();
  return (
    <table className="w-full table-fixed border-collapse max-xl:min-w-[calc(var(--spacing)*255.56)]">
      <caption className="sr-only">{t('titre')}</caption>
      <thead className="border-b border-border">
        <tr>
          <Th className="pl-4">{t('colonnes.bailleur')}</Th>
          <Th className="w-[calc(var(--spacing)*56.67)]">{t('colonnes.telephone')}</Th>
          <Th className="w-[calc(var(--spacing)*32.78)]">{t('colonnes.biens')}</Th>
          <Th className="w-[calc(var(--spacing)*31.11)] text-right w1440:w-[calc(var(--spacing)*35)]">{t('colonnes.encaisse')}</Th>
          <Th className="w-[calc(var(--spacing)*34.44)] text-right w1440:w-[calc(var(--spacing)*37.78)]">{t('colonnes.reste')}</Th>
          <Th className="hidden w-[calc(var(--spacing)*35.56)] w1440:table-cell">{t('colonnes.dernier')}</Th>
          <Th className="w-[calc(var(--spacing)*35.56)]">{t('colonnes.statut')}</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {owners.map((owner) => {
          const lecture = lireLeBailleur(owner);
          const reste = owner.remaining_to_pay ?? null;
          const encaisse = owner.collected_this_month ?? null;
          const dernier = owner.last_payout_at ? f.jourMois(owner.last_payout_at) : null;
          return (
            <tr key={owner.id} data-slot="rangee-du-bailleur" className="hover:bg-secondary/50 focus-within:bg-secondary/50">
              <Td className="pl-4">
                <span className="flex items-center gap-3">
                  <AvatarDuBailleur lecture={lecture} taille="bureau" />
                  <span className="min-w-0 leading-snug">
                    <NomDuBailleur owner={owner} nom={lecture.nom || lecture.email || ''} lien={lienVersLaFiche} className="block truncate font-medium" />
                    <span className="block truncate text-ui text-muted-foreground">
                      {[lecture.contact, lecture.email].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                </span>
              </Td>
              <Td>
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ui whitespace-nowrap tabular-nums" data-slot="telephone-du-bailleur">
                    {lecture.telephone ? formaterTelephone(lecture.telephone) : '—'}
                  </span>
                  <GestesDuBailleur lecture={lecture} forme="petit" />
                </span>
              </Td>
              <Td className="whitespace-nowrap tabular-nums">
                {owner.properties_count ?? 0}{' '}
                <span className="text-muted-foreground">· {t('occupes', { n: owner.occupied_properties_count ?? 0 })}</span>
              </Td>
              <Td className="text-right tabular-nums">{encaisse !== null ? f.montantCourt(encaisse) : <span className="text-muted-foreground">—</span>}</Td>
              <Td className="text-right tabular-nums">
                {reste !== null && reste > 0 ? <span className="font-semibold">{f.montantCourt(reste)}</span> : <span className="text-muted-foreground">—</span>}
                {dernier ? <span className="block text-xs text-muted-foreground w1440:hidden">{t('verseLe', { date: dernier })}</span> : null}
              </Td>
              <Td className="hidden text-muted-foreground tabular-nums w1440:table-cell">{dernier ?? '—'}</Td>
              <Td>
                {owner.status === 'draft' ? (
                  <span className="block leading-tight">
                    <StatusBadge
                      tone="attention"
                      label={
                        owner.pending_invitation_sent_at
                          ? t('invitationDepuis', { jours: joursDepuis(owner.pending_invitation_sent_at, maintenant) })
                          : t('invitation')
                      }
                      className="whitespace-nowrap"
                    />
                    <span className="mt-1 flex items-center gap-1 text-xs font-medium">{gestesDInvitation(owner)}</span>
                  </span>
                ) : (
                  <StatusBadge tone={TON_DU_STATUT[owner.status]} label={tStatut(owner.status)} className="whitespace-nowrap" />
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
