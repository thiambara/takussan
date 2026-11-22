'use client';

import { useId } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ITEM_ORDER, isItemDone, lienDeLEtape } from '@/components/tenant/TenantOnboardingChecklistWidget';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useResumeDuLoyer } from '@/lib/queries/payments';
import { useCompleteOnboardingItem, useTenantOnboardingChecklist } from '@/lib/queries/tenant-onboarding';
import { cn } from '@/lib/utils';
import type { TenantOnboardingChecklistItem } from '@/types/tenant-onboarding';

import { TitreBloc } from '../pieces';

/**
 * TCK-2852 (maquette `app-accueil` a, écran « Locataire », `CheckListEntree`) — « Votre entrée dans
 * les lieux » : les étapes de la check-list d'entrée (TCK-266) du bail que l'accueil montre (celui du
 * résumé du loyer, le même que « Mon logement »), cochées ou à faire, et « N étapes restantes ».
 *
 *  - au TÉLÉPHONE (`forme="telephone"`), sous « Mon logement », sous l'intertitre « À finir » ;
 *  - au BUREAU (`forme="bureau"`), dans la colonne de gauche, sous « Derniers paiements ».
 *
 * La page monte les deux formes, chacune masquée hors de sa largeur : l'ordre du document diffère
 * (téléphone : après le logement ; bureau : colonne de gauche). Même requête, même cache.
 *
 * Elle disparaît, intertitre compris, quand la check-list est finie, absente ou illisible : ce bloc
 * n'a rien à dire d'autre. Elle remplace, pour le persona locataire, le bandeau de tête de TCK-266.
 *
 * Écart de donnée à la maquette : ses étapes (« Bail signé le 28 août », « Envoyer l'attestation
 * d'assurance ») ne sont pas celles de la check-list servie (`welcome_seen`, `inventory_completed`,
 * `first_payment`, `documents_acknowledged`) ; ce sont ces dernières qui s'affichent.
 */
export function EntreeDansLesLieux({ forme, className }: { readonly forme: 'telephone' | 'bureau'; readonly className?: string }) {
  const t = useTranslations('accueil.locataire.entree');
  const tEtapes = useTranslations('tenant.onboarding.items');
  const id = useId();
  const resume = useResumeDuLoyer();
  const leaseId = resume.data?.data?.lease?.id ?? null;
  const lue = useTenantOnboardingChecklist(leaseId);
  const accuse = useCompleteOnboardingItem(leaseId ?? 0);
  const messageErreur = useMessageErreurApi();

  const checklist = lue.data?.data ?? null;
  if (leaseId === null || !checklist || checklist.completed_at !== null) return null;

  const restantes = ITEM_ORDER.filter((item) => !isItemDone(checklist, item)).length;
  const titreId = `${id}-titre`;
  const telephone = forme === 'telephone';

  const carte = (
    <section
      aria-labelledby={telephone ? `${id}-a-finir` : titreId}
      data-slot="entree-dans-les-lieux"
      data-forme={forme}
      className={cn('rounded-2xl border border-border bg-card p-4', telephone && 'mx-4', !telephone && className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        {telephone ? (
          <p id={titreId} className="text-corps font-semibold">
            {t('titre')}
          </p>
        ) : (
          <h2 id={titreId} className="text-corps font-semibold">
            {t('titre')}
          </h2>
        )}
        <span className="flex-none text-ui text-muted-foreground">{t('restantes', { n: restantes })}</span>
      </div>
      <ul className="mt-3 space-y-1">
        {ITEM_ORDER.map((item) => (
          <li key={item}>
            <Etape
              item={item}
              titre={tEtapes(`${item}.title`)}
              fait={isItemDone(checklist, item)}
              href={lienDeLEtape(item, leaseId)}
              enCours={accuse.isPending && item === 'documents_acknowledged'}
              onAccuser={item === 'documents_acknowledged' ? () => accuse.mutate({ item: 'documents_acknowledged' }) : undefined}
            />
          </li>
        ))}
      </ul>
      {accuse.isError ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {messageErreur(accuse.error)}
        </p>
      ) : null}
    </section>
  );

  if (!telephone) return carte;
  return (
    <div className={cn('space-y-2', className)}>
      <TitreBloc id={`${id}-a-finir`}>{t('aFinir')}</TitreBloc>
      {carte}
    </div>
  );
}

const LIGNE = 'flex min-h-9 w-full items-center gap-2.5 rounded-lg text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring';

function Etape({
  item,
  titre,
  fait,
  href,
  enCours,
  onAccuser,
}: {
  readonly item: TenantOnboardingChecklistItem;
  readonly titre: string;
  readonly fait: boolean;
  readonly href: string | null;
  readonly enCours: boolean;
  readonly onAccuser?: () => void;
}) {
  const contenu = (
    <>
      {fait ? (
        <CheckCircle2 className="size-4.5 flex-none text-success" aria-hidden="true" />
      ) : (
        <span className="size-4.5 flex-none rounded-full border-[1.5px] border-dashed border-foreground/40" aria-hidden="true" />
      )}
      <span className={cn('min-w-0 flex-1', fait && 'text-muted-foreground line-through')}>{titre}</span>
      {fait ? null : enCours ? (
        <Loader2 className="size-4 flex-none animate-spin text-muted-foreground" aria-hidden="true" />
      ) : href || onAccuser ? (
        <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      ) : null}
    </>
  );
  if (fait) {
    return (
      <span className={LIGNE} data-etape={item} data-fait="oui">
        {contenu}
      </span>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cn(LIGNE, 'hover:text-primary-deep')} data-etape={item} data-fait="non">
        {contenu}
      </Link>
    );
  }
  if (onAccuser) {
    return (
      <button type="button" onClick={onAccuser} disabled={enCours} className={cn(LIGNE, 'hover:text-primary-deep disabled:opacity-60')} data-etape={item} data-fait="non">
        {contenu}
      </button>
    );
  }
  return (
    <span className={LIGNE} data-etape={item} data-fait="non">
      {contenu}
    </span>
  );
}
