'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import { CalendarClock, CreditCard, Inbox } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useCompteursDuMenu } from '@/components/layout/useCompteursDuMenu';
import { buttonVariants } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user';
import { useEspacePublic } from './useEspacePublic';
import { useRappelDuPersona } from './useRappelDuPersona';

interface ContenuDuRappel {
  readonly icone: ComponentType<{ className?: string }>;
  readonly titre: string;
  readonly detail: string | null;
  readonly action: string;
  readonly href: string;
}

/**
 * TCK-2493 (ADR-0091, validé par le porteur le 2026-11-08) — en tête de l'accueil CONNECTÉ, ce qui
 * attend le persona, sans quitter le site public : le loyer dû ou en retard du locataire, la
 * prochaine visite, les demandes à traiter du personnel. Rien quand rien n'attend : une carte vide
 * ou « Tout est à jour » prendrait la place des biens pour ne rien dire.
 *
 * Un seul rappel, le plus pressant : un retard avant une échéance, une échéance avant une visite, une
 * visite avant une file. Les compteurs sont ceux du menu (`useCompteursDuMenu`).
 */
export function CarteDeRappel() {
  const { user } = useAuth();
  return user ? <RappelDuCompte user={user} /> : null;
}

function RappelDuCompte({ user }: { readonly user: User }) {
  const t = useTranslations('navigationPublique.rappel');
  const f = useFormatteurs();
  const espace = useEspacePublic(user);
  const compteurs = useCompteursDuMenu(espace.entrees, { agencyIsStandard: espace.agencyIsStandard });
  const rappel = useRappelDuPersona(espace.persona);
  const demandes = espace.entrees.find((e) => e.id === 'demandes' && !e.locked);
  const visites = espace.entrees.find((e) => e.id === 'visites' && !e.locked);
  const aTraiter = demandes ? compteurs.unhandledLeads : 0;

  const contenu = ((): ContenuDuRappel | null => {
    if (rappel.retard) {
      return {
        icone: CreditCard,
        titre: t('loyer.retardTitre'),
        detail: t('loyer.retardDetail', { count: rappel.retard.nombre, montant: f.montant(rappel.retard.montant) }),
        action: t('loyer.action'),
        href: '/app/payments',
      };
    }
    if (rappel.loyer) {
      return {
        icone: CreditCard,
        titre: t('loyer.titre'),
        detail: t('loyer.detail', {
          montant: f.montant(rappel.loyer.montant, rappel.loyer.devise),
          date: f.date(rappel.loyer.echeance, { day: 'numeric', month: 'short' }),
        }),
        action: t('loyer.action'),
        href: '/app/payments',
      };
    }
    if (rappel.visite) {
      const detail = [rappel.visite.bien, aTraiter > 0 ? t('aussiDemandes', { count: aTraiter }) : null]
        .filter(Boolean)
        .join(' · ');
      return {
        icone: CalendarClock,
        titre: t('visite.titre', {
          date: f.dateTime(rappel.visite.date, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        }),
        detail: detail || null,
        action: t('visite.action'),
        href: visites?.href ?? '/app/visits',
      };
    }
    if (demandes && aTraiter > 0) {
      return {
        icone: Inbox,
        titre: t('demandes.titre', { count: aTraiter }),
        detail: null,
        action: t('demandes.action'),
        href: demandes.hrefATraiter ?? demandes.href,
      };
    }
    if (visites && compteurs.pendingVisits > 0) {
      return {
        icone: CalendarClock,
        titre: t('visitesEnAttente.titre', { count: compteurs.pendingVisits }),
        detail: null,
        action: t('visitesEnAttente.action'),
        href: visites.hrefATraiter ?? visites.href,
      };
    }
    return null;
  })();

  if (!contenu) return null;
  const Icone = contenu.icone;
  return (
    <section
      aria-label={t('region')}
      data-slot="carte-de-rappel"
      className="flex max-w-2xl items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
    >
      <span className="inline-flex size-10 flex-none items-center justify-center rounded-xl bg-secondary text-primary-deep" aria-hidden>
        <Icone className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-semibold text-foreground">{contenu.titre}</p>
        {contenu.detail ? <p className="truncate text-[0.8125rem] text-muted-foreground">{contenu.detail}</p> : null}
      </div>
      <Link href={contenu.href} className={cn(buttonVariants({ size: 'sm' }), 'h-10 flex-none rounded-full px-4 text-sm font-semibold')}>
        {contenu.action}
      </Link>
    </section>
  );
}
