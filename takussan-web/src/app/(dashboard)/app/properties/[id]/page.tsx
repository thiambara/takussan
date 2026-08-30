import type { Metadata } from 'next';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { fetchTagsAction } from '@/app/actions/admin-tags';
import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { getToken } from '@/lib/session';
import { fetchDashboardProperty } from '@/lib/queries/properties-server';
import { ApiError } from '@/lib/api';
import { PropertyDetailTabs } from '@/components/property-dashboard/PropertyDetailTabs';
import { PropertyHeaderActions } from '@/components/property-dashboard/PropertyHeaderActions';
import { PropertyStatusBadge } from '@/components/property-dashboard/PropertyStatusBadge';
import { PropertyVisibilityBadge } from '@/components/property-dashboard/PropertyVisibilityBadge';
import { PropertyModerationBanner } from '@/components/property-form/PropertyModerationBanner';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.propertyDetail');
  return { title: t('metaTitle') };
}

/**
 * TCK-041 — page d'édition d'un bien existant.
 */

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const t = await getTranslations('dashboard.pages.propertyDetail');
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.

  const { id } = await params;
  const token = await getToken();
  // TCK-426 — NARROWING DE TYPE, PAS UNE DÉCISION. Le `layout.tsx` de ce segment a déjà refusé
  // l'absence de jeton, au-dessus de la frontière de suspension ; et `getMeAction()` redirige
  // vers `/auth/login` bien avant, depuis `(dashboard)/layout.tsx`. Cette branche est donc
  // inatteignable — mais `getToken()` rend `string | null` et le typage exige qu'on le dise.
  // *Ce qu'elle ne fait SURTOUT pas, c'est rediriger : sous un `loading.tsx`, un `redirect()` de
  // page rend 200 + le squelette au lieu du 307.*
  if (!token) return null;

  let property;
  try {
    property = await fetchDashboardProperty(token, id);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      // TCK-442 — **un panneau RENDU, plus un `redirect('/app')`.** Le ticket demandait de dire
      // lequel des deux était un choix : deux pages sœurs répondaient différemment au même 403,
      // `customers/[id]` par un panneau et celle-ci par une redirection muette. C'est la
      // redirection qui était l'oubli, pour deux raisons qui vont dans le même sens.
      //
      // · Sous le `loading.tsx` de ce segment, un `redirect()` de PAGE rend **200 + le squelette**
      //   au lieu du 307 (tableau mesuré de TCK-426) : l'utilisateur atterrissait sur `/app`, mais
      //   toute sonde lisait un succès. Le remonter dans le layout n'est pas possible ici — le
      //   refus vient de la RÉPONSE de l'API, pas de l'utilisateur.
      // · Et surtout, il ne DISAIT rien : on quittait la page sans savoir pourquoi. Le panneau
      //   nomme le refus et propose le retour, comme `CustomerDetailUnavailable`.
      return (
        <PropertyDetailUnavailable
          title={t('forbidden_title')}
          message={t('forbidden_message')}
          backLabel={t('back_cta')}
        />
      );
    }
    throw e;
  }

  const tagsResult = await fetchTagsAction({ filters: { type: 'amenity' }, perPage: 200 });
  const tags = tagsResult.ok ? (tagsResult.data?.data ?? []) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('eyebrow', { reference: property.reference_number ?? `#${property.id}` })}
        title={property.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PropertyStatusBadge
              status={property.status}
              statusLabel={property.status_label}
            />
            <PropertyVisibilityBadge visibility={property.visibility} />
            <span className="text-xs text-muted-foreground">
              {property.type_label}
              {property.contract_type_label
                ? ` · ${property.contract_type_label}`
                : ''}
              {property.location?.city ? ` · ${property.location.city}` : ''}
            </span>
          </span>
        }
        actions={<PropertyHeaderActions property={property} />}
      />

      <PropertyModerationBanner property={property} />

      <PropertyDetailTabs property={property} tags={tags} />
    </div>
  );
}

/**
 * L'écran d'un 403 sur la fiche d'un bien — le pendant de `CustomerDetailUnavailable`.
 *
 * `EmptyState` et non `ErrorState` : ce n'est pas une panne, il n'y a rien à réessayer. La seule
 * action utile est le retour à la liste.
 */
function PropertyDetailUnavailable({
  title,
  message,
  backLabel,
}: {
  readonly title: string;
  readonly message: string;
  readonly backLabel: string;
}) {
  return (
    <EmptyState
      icon={<AlertTriangle className="size-8" aria-hidden="true" />}
      title={title}
      description={message}
      action={
        <Link href="/app/properties" className={buttonVariants()}>
          {backLabel}
        </Link>
      }
    />
  );
}
