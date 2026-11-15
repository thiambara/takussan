'use client';

import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { BadgeCheck, Building2, CalendarDays, Clock, FlaskConical, Inbox, Receipt, Wallet, Wrench, type LucideIcon } from 'lucide-react';

import { BOUTON_D_ENTREE } from '@/components/auth/BoutonCollant';
import { LogoOuInitiales } from '@/components/public/index/LogoOuInitiales';
import type { ApercuDInvitation, RoleDInvitation } from '@/lib/invitation-apercu';
import { cn } from '@/lib/utils';

/**
 * TCK-2611 — les pièces de la page d'invitation (maquette `app-entree-invitation`, approche a) :
 * l'agence qui invite, le titre « Aïssatou vous invite comme bailleur », « Ce qui vous attend »,
 * « Invitation pour … · valable jusqu'au … », et le panneau de l'agence du bureau.
 *
 * ⚠ **Rien que l'API ne serve** (ADR-0094 § 3) : l'invitant par son prénom seul, l'agence par sa
 * ville seule, ce qui attend par ses comptes seuls — les photos et les titres des biens de la
 * maquette n'ont pas de source, ils ne sont pas inventés.
 */

/**
 * Le bouton principal de l'invitation : celui de la famille d'entrée (`BOUTON_D_ENTREE`), à 15 px
 * à toute largeur. La maquette de l'invitation (a-0 à a-3) et celle des assistants le dessinent à 15 px,
 * celles de la connexion et de l'orientation à 16 (`text-action`) : la page suit SA maquette.
 */
export const BOUTON_D_INVITATION = cn(BOUTON_D_ENTREE, 'text-corps leading-normal lg:text-corps');

/** Le rôle tel que le titre le dit (« comme bailleur ») ; un rôle inconnu de l'écran se tait. */
const ROLES_NOMMES = ['owner', 'tenant', 'agent', 'agent_senior', 'agent_manager', 'agency_admin', 'service_provider', 'super_admin'] as const;

export function cleDuRole(role: RoleDInvitation): (typeof ROLES_NOMMES)[number] | 'autre' {
  return (ROLES_NOMMES as readonly string[]).includes(role) ? (role as (typeof ROLES_NOMMES)[number]) : 'autre';
}

/** Le logo carré de l'agence, ou ses initiales sur terracotta (maquette `LogoAgence`). */
export function LogoDeLAgence({ nom, logo, taille, className }: { readonly nom: string; readonly logo: string | null; readonly taille: 'l' | 'm' | 's' | 'xs'; readonly className?: string }) {
  const tailles = {
    // Tailles FIXES à toute largeur (32, 44, 48, 64 px ; initiales 12, 17, 18, 24) : la maquette ne les
    // rabat pas au bureau, la densité ×0,9 (ADR-0107) les aurait mises à 28,8 · 39,6 · 43,2 · 57,6.
    xs: 'size-[2rem] rounded-lg text-[0.75rem]',
    s: 'size-[2.75rem] rounded-xl text-titre-court',
    m: 'size-[3rem] rounded-xl text-[1.125rem]',
    l: 'size-[4rem] rounded-2xl text-[1.5rem]',
  } as const;
  return (
    <span
      className={cn(
        'relative inline-flex flex-none items-center justify-center overflow-hidden bg-primary font-display font-semibold text-primary-foreground',
        tailles[taille],
        className,
      )}
    >
      <LogoOuInitiales nom={nom} logoUrl={logo} />
    </span>
  );
}

export function BadgeVerifiee({ className }: { readonly className?: string }) {
  const t = useTranslations('invitationAccept.agence');
  return <BadgeCheck className={cn('size-[1.125rem] flex-none text-accent', className)} strokeWidth={1.75} role="img" aria-label={t('verifiee')} />;
}

/** « Plateau, Dakar · 214 biens » : la ville seule (ADR-0094 § 3) et le portefeuille public. */
function useDetailDeLAgence(apercu: ApercuDInvitation): string | null {
  const t = useTranslations('invitationAccept.agence');
  const agence = apercu.agence;
  if (!agence) return null;
  const biens = agence.biensPublics !== null && agence.biensPublics > 0 ? t('biens', { n: agence.biensPublics }) : null;
  return [agence.ville, biens].filter(Boolean).join(' · ') || null;
}

/** L'agence qui invite, au téléphone : logo, nom, badge, ville et biens. */
export function BlocAgence({ apercu, className }: { readonly apercu: ApercuDInvitation; readonly className?: string }) {
  const detail = useDetailDeLAgence(apercu);
  const agence = apercu.agence;
  if (!agence) return null;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <LogoDeLAgence nom={agence.nom} logo={agence.logo} taille="m" />
      <div className="min-w-0 leading-tight">
        <p className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-[-0.01em]">
          {agence.nom}
          {agence.verifiee ? <BadgeVerifiee /> : null}
        </p>
        {detail ? <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}

/** « Aïssatou vous invite comme bailleur » — le rôle en terracotta. */
/**
 * `texteSeul` : la même phrase sans élément (la copie `sr-only` du h1) — un élément dans un `sr-only` y
 * est rogné, et le balayage le compte comme une coupe.
 */
export function PhraseDInvitation({ apercu, texteSeul = false }: { readonly apercu: ApercuDInvitation; readonly texteSeul?: boolean }) {
  const t = useTranslations('invitationAccept');
  const role = t(`roles.${cleDuRole(apercu.role)}`);
  const enRole = { role: (morceaux: ReactNode) => (texteSeul ? <>{morceaux}</> : <span className="text-primary">{morceaux}</span>) };
  if (apercu.invitant) return <>{t.rich('titre.invitant', { prenom: apercu.invitant, libelle: role, ...enRole })}</>;
  if (apercu.agence) return <>{t.rich('titre.invitant', { prenom: apercu.agence.nom, libelle: role, ...enRole })}</>;
  return <>{t.rich('titre.sansInvitant', { libelle: role, ...enRole })}</>;
}

interface Promesse {
  readonly icone: LucideIcon;
  readonly titre: string;
  readonly detail: string;
}

/** Ce qui attend l'invité, selon son rôle — avec les seuls comptes que l'aperçu sert. */
function usePromesses(apercu: ApercuDInvitation): readonly Promesse[] {
  const t = useTranslations('invitationAccept.attente');
  switch (cleDuRole(apercu.role)) {
    case 'owner': {
      const biens = apercu.attente.biens ?? 0;
      return [
        { icone: Building2, titre: biens > 0 ? t('owner.biens', { n: biens }) : t('owner.biensSans'), detail: t('owner.biensDetail') },
        { icone: Wallet, titre: t('owner.loyers'), detail: t('owner.loyersDetail') },
        { icone: Receipt, titre: t('owner.quittances'), detail: t('owner.quittancesDetail') },
      ];
    }
    case 'tenant':
      return [
        { icone: Building2, titre: t('tenant.bail'), detail: t('tenant.bailDetail') },
        { icone: Wallet, titre: t('tenant.loyers'), detail: t('tenant.loyersDetail') },
        { icone: Receipt, titre: t('tenant.quittances'), detail: t('tenant.quittancesDetail') },
      ];
    case 'agent':
    case 'agent_senior':
    case 'agent_manager':
    case 'agency_admin':
      return [
        { icone: Inbox, titre: t('agent.prospects'), detail: t('agent.prospectsDetail') },
        { icone: Building2, titre: t('agent.biens'), detail: t('agent.biensDetail') },
        { icone: CalendarDays, titre: t('agent.agenda'), detail: t('agent.agendaDetail') },
      ];
    case 'service_provider': {
      const intervention = apercu.attente.intervention;
      return [
        intervention
          ? {
              icone: Wrench,
              titre: t('prestataire.intervention'),
              detail: intervention.bien ? `${intervention.titre} · ${intervention.bien}` : intervention.titre,
            }
          : { icone: Wrench, titre: t('prestataire.interventions'), detail: t('prestataire.interventionsDetail') },
        { icone: Receipt, titre: t('prestataire.devis'), detail: t('prestataire.devisDetail') },
      ];
    }
    default:
      return [];
  }
}

/**
 * « Ce qui vous attend » : la raison d'accepter, avant toute question. Au téléphone, une carte et les
 * titres seuls ; dans le panneau du bureau (`detaille`), nue, avec le détail de chaque ligne.
 */
export function CeQuiVousAttend({ apercu, detaille = false, className }: { readonly apercu: ApercuDInvitation; readonly detaille?: boolean; readonly className?: string }) {
  const t = useTranslations('invitationAccept.attente');
  const promesses = usePromesses(apercu);
  if (promesses.length === 0) return null;
  return (
    <section className={cn(detaille ? undefined : 'rounded-2xl border border-border bg-card p-4', className)}>
      <h2 className="text-[0.9375rem] font-semibold">{t('titre')}</h2>
      <ul className={cn('mt-3', detaille ? 'space-y-4' : 'space-y-3')}>
        {promesses.map((p) => (
          <li key={p.titre} className="flex items-start gap-3">
            <span className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-secondary text-primary-deep">
              <p.icone className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="min-w-0 leading-snug">
              <span className={cn('block text-[0.9375rem]', detaille ? 'font-semibold' : 'pt-1 font-medium')}>{p.titre}</span>
              {detaille ? <span className="block text-sm text-muted-foreground">{p.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** « Invitation pour m•••@gmail.com · valable jusqu'au 17 nov. » — le destinataire tel que l'API le masque. */
export function PourQui({ apercu, className }: { readonly apercu: ApercuDInvitation; readonly className?: string }) {
  const t = useTranslations('invitationAccept');
  const format = useFormatter();
  const date = apercu.expireLe ? format.dateTime(new Date(apercu.expireLe), { day: 'numeric', month: 'short' }) : null;
  const pour = apercu.destinataire?.masque ?? null;
  if (!pour && !date) return null;
  const riche = {
    fort: (morceaux: ReactNode) => <span className="font-medium text-encre-douce">{morceaux}</span>,
    ligne: (morceaux: ReactNode) => <span className="whitespace-nowrap">{morceaux}</span>,
  };
  return (
    <p className={cn('flex items-start gap-2 text-[0.8125rem] leading-snug text-muted-foreground', className)}>
      <Clock className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
      <span>
        {pour && date
          ? t.rich('pourQui.complet', { pour, date, ...riche })
          : pour
            ? t.rich('pourQui.seul', { pour, ...riche })
            : t.rich('pourQui.date', { date: date ?? '', ...riche })}
      </span>
    </p>
  );
}

/** Le panneau d'objet du bureau : l'agence qui invite, qui l'invite, et ce qui attend (maquette `PanneauAgence`). */
export function PanneauDeLAgence({ apercu }: { readonly apercu: ApercuDInvitation }) {
  const t = useTranslations('invitationAccept.agence');
  const agence = apercu.agence;
  const biens = agence?.biensPublics ?? null;
  const ligneDesBiens = [biens !== null && biens > 0 ? t('biens', { n: biens }) : null, agence?.verifiee ? t('verifieeLigne') : null]
    .filter(Boolean)
    .join(' · ');
  const initiale = (apercu.invitant ?? agence?.nom ?? '').trim().charAt(0).toUpperCase();
  return (
    <div className="rounded-3xl bg-secondary/60 p-9">
      {agence ? (
        <div className="flex items-center gap-4">
          <LogoDeLAgence nom={agence.nom} logo={agence.logo} taille="l" />
          <div className="min-w-0 leading-tight">
            <p className="flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.02em]">
              {agence.nom}
              {agence.verifiee ? <BadgeVerifiee className="size-5" /> : null}
            </p>
            {agence.ville ? <p className="mt-1 text-sm text-muted-foreground">{agence.ville}</p> : null}
            {ligneDesBiens ? <p className="mt-0.5 text-sm text-muted-foreground">{ligneDesBiens}</p> : null}
          </div>
        </div>
      ) : null}

      <div className={cn('flex items-center gap-3', agence ? 'mt-7 border-t border-foreground/10 pt-6' : null)}>
        {initiale ? (
          <span aria-hidden="true" className="inline-flex size-[2.75rem] flex-none items-center justify-center rounded-full bg-card text-[1rem] font-semibold text-primary-deep">
            {initiale}
          </span>
        ) : null}
        <p className="font-display text-xl font-semibold leading-snug tracking-[-0.01em]">
          <PhraseDInvitation apercu={apercu} />
        </p>
      </div>

      <CeQuiVousAttend apercu={apercu} detaille className="mt-7" />
    </div>
  );
}

/**
 * TCK-620 (ADR-0060) — l'encadré d'environnement de test : hors production, l'API rend le code au lieu
 * de l'envoyer. Rien sans code : en production, l'API n'en rend jamais. (`CodeDePreproduction` lit
 * l'espace `auth`, que `/invitations` ne sert pas.)
 */
/**
 * Hors production, le code que l'API laisse voir (`otp_preview`) : « Aucun SMS ne part d'ici.
 * Environnement de test. Votre code : 482 913 » — du texte seul, comme la maquette a-1.
 */
export function EncadreDeTest({ code, className }: { readonly code: string | null; readonly className?: string }) {
  const t = useTranslations('invitationAccept.test');
  if (!code) return null;
  const lisible = code.replace(/^(\d{3})(\d{3})$/, '$1 $2');
  return (
    <div
      role="status"
      data-testid="code-de-preproduction"
      className={cn('flex items-start gap-2.5 rounded-xl border border-dashed border-warning/60 bg-warning/10 px-3 py-2.5 text-[0.8125rem] leading-snug', className)}
    >
      <FlaskConical className="mt-0.5 size-4 flex-none text-warning" strokeWidth={1.75} aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{t('titre')}</span> {t('texte')}{' '}
        <span className="whitespace-nowrap">
          {t.rich('code', { code: lisible, fort: (morceaux) => <span className="font-semibold tabular-nums">{morceaux}</span> })}
        </span>
      </p>
    </div>
  );
}
