'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CircleCheck, Phone } from 'lucide-react';

import { isReachable, telHref } from '@/components/crm/contact';
import { ErrorState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { DATE_COURTE, useFormatteurs } from '@/lib/format/useFormatteurs';
import { estTuileDuLocataire } from '@/lib/maintenance/signalement';
import { useMaintenanceRequest } from '@/lib/queries/maintenance';
import { useResumeDuLoyer } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';

import { EtapesDeLaDemande } from './EtapesDeLaDemande';

/**
 * TCK-2654 — « Demande envoyée » : l'écran où mène le signalement du locataire. Maquette retenue :
 * `app-interventions` a, écran « Locataire — demande envoyée » (téléphone ; bureau : carte de 480 px).
 *
 * Une URL à elle (`/app/maintenance/{id}/envoyee`) plutôt qu'un état du formulaire : l'écran se relit
 * (retour arrière, rechargement) et se mesure sans écrire une demande.
 *
 *  · L'agence est celle du bien (`property.agency`, `include=property`). Son téléphone vient du résumé
 *    du loyer du locataire (`GET /api/me/rent-summary`), retenu seulement s'il parle du MÊME bail :
 *    sans lui, « Appeler l'agence » n'est pas rendu (un lien sans numéro ne mène nulle part).
 *  · Ni coût ni devis : l'API ne les sert pas au demandeur (TCK-2652), et cet écran n'en lit aucun.
 *  · Les quatre étapes suivent le statut (`EtapesDeLaDemande`).
 *  · Rendu au seul DEMANDEUR (décision du 2026-11-13) : tout autre lecteur est renvoyé à la fiche
 *    normale. Le renvoi est fait ici, au client : posé dans un `layout.tsx` du segment, il vivrait sous le
 *    repli de `[id]/loading.tsx` et rendrait 200 avec le squelette (TCK-426, `etats-de-route.test.ts`).
 *    L'API sert la demande à ces lecteurs de toute façon : l'écran ne leur montre rien de plus.
 *
 * Écarts de donnée à la maquette : « l'agence répond d'ordinaire dans l'heure » (aucune mesure ne le
 * sert) et « 1 message vocal » (la note vocale est hors périmètre) ne sont pas rendus.
 */

export function DemandeEnvoyee({ id }: { readonly id: number }) {
  const t = useTranslations('maintenance.locataire.envoyee');
  const tTuiles = useTranslations('maintenance.locataire.signaler.tuiles');
  const tCategorie = useTranslations('maintenance.category');
  const tCommon = useTranslations('common');
  const f = useFormatteurs();
  const router = useRouter();
  const { user } = useAuth();
  const demande = useMaintenanceRequest(id);
  const d = demande.data?.data;
  const autreLecteur = d !== undefined && user != null && d.requester_id !== user.id;
  // Le résumé du loyer est celui du locataire connecté : lu pour le seul demandeur.
  const resume = useResumeDuLoyer({ enabled: d !== undefined && !autreLecteur });

  useEffect(() => {
    if (autreLecteur) router.replace(`/app/maintenance/${id}`);
  }, [autreLecteur, id, router]);

  if (demande.isLoading || autreLecteur) return <Skeleton className="mx-auto h-96 max-w-120 rounded-2xl" />;
  if (demande.isError || !d) {
    return <ErrorState message={t('erreur')} onRetry={() => void demande.refetch()} retryLabel={tCommon('actions.retry')} />;
  }

  const agence = d.property?.agency?.name ?? null;
  const bail = resume.data?.data.lease ?? null;
  const telephone = bail !== null && d.lease_id !== null && bail.id === d.lease_id ? (bail.agency?.phone ?? null) : null;
  const photos = d.media?.photos ?? [];
  const premiere = photos[0] ?? null;
  const categorie = estTuileDuLocataire(d.category) ? tTuiles(d.category) : tCategorie(d.category);
  const aujourdhui = f.date(d.created_at, DATE_COURTE) === f.date(new Date(), DATE_COURTE);

  return (
    <div className="md:flex md:justify-center md:pb-16 md:pt-4">
      <div
        className="flex flex-col items-center px-5 pb-10 pt-10 text-center md:w-[30rem] md:max-w-full md:rounded-2xl md:border md:border-border md:bg-card md:p-8"
        data-slot="demande-envoyee"
      >
        <span className="inline-flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
          <CircleCheck className="size-8" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h2 className="mt-5 font-display text-affiche-22 font-semibold leading-tight tracking-titre text-foreground">
          {agence ? t('recue', { agence }) : t('recueSansNom')}
        </h2>
        <p className="mt-2 text-corps leading-snug text-muted-foreground">{t('prevenu')}</p>

        <div className="mt-6 w-full rounded-xl border border-border bg-card p-4 text-left">
          <div className="flex items-center gap-3">
            {premiere ? (
              <span className="size-14 flex-none overflow-hidden rounded-lg bg-muted">
                {/* URL d'API signée (TCK-1024) : `next/image` ne l'optimise pas. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={premiere.thumbnail_url ?? premiere.url} alt="" className="size-full object-cover" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-corps font-semibold text-foreground">{d.title}</span>
              <span className="mt-0.5 block text-ui text-muted-foreground">
                {t('resume', {
                  categorie,
                  urgence: t(d.priority === 'urgent' ? 'urgence.urgent' : 'urgence.normal'),
                  photos: photos.length,
                })}
              </span>
              <span className="block text-ui text-muted-foreground">
                {t('envoyeeLe', {
                  jour: aujourdhui ? 'aujourdhui' : 'autre',
                  date: f.jourMois(d.created_at),
                  heure: f.heure(d.created_at),
                })}
              </span>
            </span>
          </div>
          <EtapesDeLaDemande statut={d.status} className="mt-5" />
        </div>

        <div className="mt-6 w-full space-y-2.5">
          <Link href={`/app/maintenance/${d.id}`} className={cn(buttonVariants({ size: 'xl' }), 'w-full')}>
            {t('voir')}
          </Link>
          {isReachable(telephone) ? (
            <a href={telHref(telephone)} className={cn(buttonVariants({ variant: 'outline', size: 'xl' }), 'w-full')}>
              <Phone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
              {t('appeler')}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
