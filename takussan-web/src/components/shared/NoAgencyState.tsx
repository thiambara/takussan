'use client';

import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { entreeAdmin } from '@/lib/access/pages-admin';
import { useAccesAdmin } from '@/lib/access/acces-admin-contexte';

interface NoAgencyStateProps {
  /** Titre de PAGE, déjà traduit par l'appelant — pas le titre de l'état vide. */
  readonly title?: string;
}

/**
 * L'écran « aucune agence rattachée », rendu par 8 pages du tableau de bord.
 *
 * Il était le seul état vide DÉJÀ partagé du dépôt — et il était partagé **à côté**
 * d'`EmptyState`, pas au-dessus : il recopiait sa propre pastille d'icône, son propre
 * `rounded-2xl bg-card p-12 text-center` et son propre empilement titre/corps/CTA. Un
 * second état vide partagé n'est pas mieux qu'un état vide ad-hoc, c'est pire : il a huit
 * consommateurs qui croient tous suivre la convention.
 *
 * Il ne rend donc plus que ce qui lui est PROPRE — le cadrage de page et le contenu — et délègue
 * la forme à `EmptyState` (TCK-291).
 */
export function NoAgencyState({ title }: NoAgencyStateProps) {
  const t = useTranslations('errors.noAgency');
  // TCK-633 (lot B) — avec un fournisseur, le CTA mène à la première page `/admin/*` accessible, et
  // disparaît s'il n'y en a aucune. Sans fournisseur (le layout `/app` n'en monte pas encore, E5),
  // le lien d'avant : ce composant ne connaît pas les rôles et ne peut pas dériver de repli.
  const acces = useAccesAdmin();
  const href = acces === null ? '/admin' : (entreeAdmin(acces)?.href ?? null);

  return (
    <div className="space-y-6">
      {title && (
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-balance text-foreground">{title}</h1>
        </div>
      )}
      <EmptyState
        icon={<Building2 className="size-8" aria-hidden="true" />}
        title={t('title')}
        description={t('body')}
        action={
          href === null ? undefined : (
            <Link href={href} className={buttonVariants({ variant: 'outline' })}>
              {t('cta')}
            </Link>
          )
        }
      />
    </div>
  );
}
