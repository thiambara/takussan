'use client';

import Image from 'next/image';
import { Home, MapPin, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isReachable, telHref } from '@/components/crm/contact';
import { EcrireA } from '@/components/messages/EcrireA';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { initiales } from '@/lib/fiche-publique';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useResumeDuLoyer } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';

/**
 * TCK-2852 (maquette `app-accueil` a, écran « Locataire », bureau, colonne de droite) — la carte du
 * logement : la photo du bien (160 px), son titre, son lieu (« quartier, ville »), « Bail jusqu'au … ·
 * 250 000 F par mois », puis l'agent du bail — avatar, nom, « Dakar Immo · votre agent » — et « Écrire ».
 *
 * Tout vient du résumé du loyer (`/api/me/rent-summary`, champs de TCK-2851), déjà lu par la carte du
 * loyer : aucune requête de plus.
 *
 * « Écrire » est `EcrireA` : le fil à deux qui existe déjà avec l'agent (jamais un second), sinon le
 * brouillon, qui ouvre `/app/messages?conversation=…` au premier envoi (TCK-2632). L'API admet ce
 * contact (`MessagingReach`, règle 5, TCK-2851).
 *
 * Sans agent (`lease.agent = null` : aucun, ou plus personnel actif de l'agence) : « Géré par
 * {agence} ». L'agence n'a pas de compte à qui écrire (le contrat ne sert aucun destinataire) : le
 * geste devient « Appeler » quand son téléphone est joignable, et disparaît sinon — jamais un bouton
 * qui échoue.
 *
 * Écart de donnée à la maquette : l'adresse avec la rue (« Villa 9042, … ») — l'API ne sert que le
 * quartier et la ville, par choix (TCK-2851).
 */
export function CarteDuLogement({ className }: { readonly className?: string }) {
  const t = useTranslations('accueil.locataire.logement');
  const f = useFormatteurs();
  const resume = useResumeDuLoyer();
  const bail = resume.data?.data?.lease ?? null;
  if (!bail) return null;

  const agence = bail.agency;
  const agent = bail.agent ?? null;
  const photo = bail.property?.cover_url ?? null;
  const lieu = bail.property?.address_line ?? null;
  const telephone = agence?.phone ?? resume.data?.data?.offline_payment?.agency_phone ?? null;
  const loyer = bail.monthly_rent != null ? f.montantCourt(bail.monthly_rent, bail.currency ?? resume.data?.data?.currency ?? null) : null;
  const finDuBail = bail.end_date ? f.date(bail.end_date, { day: 'numeric', month: 'long', year: 'numeric', dateStyle: undefined }) : null;
  const ligneDuBail = finDuBail && loyer ? t('bailEtLoyer', { date: finDuBail, loyer }) : finDuBail ? t('bailJusquau', { date: finDuBail }) : loyer ? t('loyerParMois', { loyer }) : null;

  return (
    <section aria-labelledby="carte-du-logement" data-slot="carte-du-logement" className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="relative flex h-40 items-center justify-center bg-muted text-muted-foreground">
        {photo ? (
          <Image src={photo} alt="" fill sizes="(min-width: 1280px) 400px, 100vw" className="object-cover" data-slot="photo-du-logement" />
        ) : (
          <Home className="size-8" strokeWidth={1.5} aria-hidden="true" />
        )}
      </div>
      <div className="p-4">
        <h2 id="carte-du-logement" className="text-corps font-semibold">
          {bail.property?.title ?? t('bienSansTitre')}
        </h2>
        {lieu ? (
          <p className="mt-0.5 flex items-center gap-1 text-ui text-muted-foreground">
            <MapPin className="size-3.5 flex-none" aria-hidden="true" />
            <span className="truncate">{lieu}</span>
          </p>
        ) : null}
        {ligneDuBail ? <p className="mt-2 text-ui text-muted-foreground">{ligneDuBail}</p> : null}

        {agent ? (
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-4" data-slot="agent-du-bail">
            {/* L'avatar comme la messagerie (`BrouillonDirect`) : `AvatarImage`, jamais `next/image` (hôte libre). */}
            <Avatar size="36" aria-hidden="true" data-slot="avatar-de-l-agent">
              {agent.avatar_url ? <AvatarImage src={agent.avatar_url} alt="" /> : null}
              <AvatarFallback>{initiales(agent.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{agent.name}</p>
              <p className="truncate text-xs text-muted-foreground">{agence?.name ? t('votreAgent', { agence: agence.name }) : t('votreAgentSansAgence')}</p>
            </div>
            <EcrireA
              personne={{ id: agent.user_id, nom: agent.name }}
              libelle={t('ecrire')}
              titre={t('messageA', { nom: agent.name })}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-none')}
              data-slot="ecrire-a-l-agent"
            />
          </div>
        ) : agence?.name || isReachable(telephone) ? (
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-4" data-slot="agence-du-bail">
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{agence?.name ? t('gerePar', { agence: agence.name }) : null}</p>
            {isReachable(telephone) ? (
              <a href={telHref(telephone)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-none')}>
                <Phone className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('appeler')}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
