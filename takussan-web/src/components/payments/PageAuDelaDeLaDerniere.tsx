'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileSearch } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';

import type { MetaDePagination } from './pagination-de-l-adresse';

interface PageAuDelaDeLaDerniereProps {
  readonly meta: MetaDePagination;
  /**
   * Comment changer de page. Par défaut, `?page=` dans l'adresse, les autres paramètres gardés
   * (onglet, filtres, `per_page`) — l'écriture de `PropertyPagination`. Le registre du prestataire
   * passe la sienne (`?factures_page=`).
   */
  readonly allerA?: (page: number) => void;
}

/**
 * TCK-2805 — la page demandée est au-delà de la dernière : la liste a des lignes, pas cette page.
 *
 * Distinct de l'état vide, que les tables gardent pour `meta.total === 0` : « aucune facture » sur
 * une liste qui en compte vingt-cinq envoyait l'utilisateur chercher une panne qui n'existe pas, et
 * ne lui laissait aucun contrôle pour revenir (la pagination ne se rend qu'avec des lignes).
 *
 * Le traitement est celui du ticket et de la liste publique (TCK-2499, `SearchEmpty`) : un message
 * calme et les chemins vers les pages qui existent. Pas de retour silencieux à la dernière page
 * (`/app/properties`, TCK-2638) : un lien partagé qui change de contenu sans le dire trompe autant.
 */
export function PageAuDelaDeLaDerniere({ meta, allerA }: PageAuDelaDeLaDerniereProps) {
  const t = useTranslations('payments.pageAuDela');
  const router = useRouter();
  const adresse = useSearchParams();
  const derniere = Math.max(meta.last_page, 1);

  const aller =
    allerA ??
    ((page: number) => {
      const params = new URLSearchParams(adresse?.toString() ?? '');
      if (page <= 1) params.delete('page');
      else params.set('page', String(page));
      router.replace(`?${params.toString()}`);
    });

  return (
    <EmptyState
      data-etat="page-au-dela"
      icon={<FileSearch className="size-8" aria-hidden="true" />}
      title={t('title')}
      description={t('description', { derniere, total: meta.total })}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* Une seule page : « la page 1 » et « la première page » sont le même geste. */}
          {derniere > 1 ? (
            <Button type="button" onClick={() => aller(derniere)}>
              {t('derniere', { numero: derniere })}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => aller(1)}>
            {t('premiere')}
          </Button>
        </div>
      }
    />
  );
}
