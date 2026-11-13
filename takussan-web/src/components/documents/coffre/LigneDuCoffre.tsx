'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BadgeCheck, ChevronRight, ClipboardCheck, Download, FileText, IdCard, ReceiptText, ScrollText, TriangleAlert } from 'lucide-react';

import { StatusBadge } from '@/components/console/StatusBadge';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { EntreeVue } from '@/lib/documents/coffre';
import { cn } from '@/lib/utils';

/**
 * TCK-2656 — une entrée du coffre : sa tuile, son nom, sa ligne de détail et ses marques
 * (« Généré par Takussan », « Vérifié », « Vérification en cours », « expire dans 42 jours »).
 *
 * Maquette : `LigneDoc` (téléphone) et `LigneDocBureau` (bureau) de `app-documents-pieces.tsx`.
 * Écarts tenus par les règles de l'app : la marque « Généré » prend le ton `info` de `StatusBadge`
 * (la maquette écrit l'accent de MARQUE, réservé aux badges *featured* — garde `aplat-accent`).
 */

function IconeDeLEntree({ vue, className }: { readonly vue: EntreeVue; readonly className?: string }) {
  const props = { className, strokeWidth: 1.5, 'aria-hidden': true as const };
  switch (vue.nature) {
    case 'contrat':
      return <ScrollText {...props} />;
    case 'edlEntree':
    case 'edlSortie':
      return <ClipboardCheck {...props} />;
    case 'piece':
      return vue.entree.category === 'id_card' || vue.entree.category === 'passport' ? <IdCard {...props} /> : <FileText {...props} />;
    default:
      return <ReceiptText {...props} />;
  }
}

export function TuileDEntree({ vue, className, iconeClassName }: { readonly vue: EntreeVue; readonly className?: string; readonly iconeClassName?: string }) {
  return (
    <span className={cn('inline-flex size-10 flex-none items-center justify-center rounded-lg bg-secondary text-primary-deep', className)}>
      <IconeDeLEntree vue={vue} className={cn('size-5', iconeClassName)} />
    </span>
  );
}

/** Les marques d'une entrée, ou `null` quand elle n'en porte aucune. */
export function useMarques() {
  const t = useTranslations('documents.coffre.marques');
  const f = useFormatteurs();

  return function marques(vue: EntreeVue, court = false) {
    const e = vue.entree;
    const morceaux: React.ReactNode[] = [];
    if (e.kind === 'generated') {
      morceaux.push(<StatusBadge key="g" tone="info" label={court ? t('genereCourt') : t('genere')} className="text-legende" />);
    }
    if (e.kind === 'uploaded' && e.is_verified === true) {
      morceaux.push(<StatusBadge key="v" tone="success" icon={<BadgeCheck aria-hidden="true" />} label={t('verifie')} className="text-legende" />);
    }
    if (e.kind === 'uploaded' && e.is_verified === false) {
      morceaux.push(<StatusBadge key="a" tone="neutral" label={t('attente')} className="text-legende" />);
    }
    const ech = vue.echeance;
    if (ech?.etat === 'bientot' || ech?.etat === 'aujourdhui') {
      morceaux.push(
        <StatusBadge
          key="e"
          tone="attention"
          icon={<TriangleAlert aria-hidden="true" />}
          label={ech.etat === 'bientot' ? t('expireDans', { jours: ech.jours }) : t('expireAujourdhui')}
          className="text-legende font-semibold"
        />,
      );
    } else if (ech?.etat === 'expiree') {
      morceaux.push(<StatusBadge key="e" tone="danger" label={t('expireeLe', { date: f.jourMois(ech.le) })} className="text-legende" />);
    } else if (ech?.etat === 'plusTard') {
      morceaux.push(
        <span key="e" className="whitespace-nowrap text-legende text-muted-foreground">
          {t('expireLe', { date: f.jourMois(ech.le) })}
        </span>,
      );
    }
    return morceaux.length > 0 ? morceaux : null;
  };
}

interface LigneDuCoffreProps {
  readonly vue: EntreeVue;
  readonly nom: string;
  readonly detail: string;
  /** Bureau large : le toucher choisit l'aperçu, le geste est le bouton de fin de ligne. */
  readonly bureau: boolean;
  readonly choisie: boolean;
  readonly onChoisir: () => void;
  readonly onTelecharger: (chemin: string, nom: string) => void;
}

export function LigneDuCoffre({ vue, nom, detail, bureau, choisie, onChoisir, onTelecharger }: LigneDuCoffreProps) {
  const t = useTranslations('documents.coffre');
  const marques = useMarques()(vue, bureau);
  const geste = vue.geste;

  const contenu = (
    <>
      <TuileDEntree vue={vue} className={bureau ? 'size-9' : undefined} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn('block truncate font-medium', bureau ? 'text-sm' : 'text-corps')}>{nom}</span>
        <span className={cn('mt-0.5 block truncate text-muted-foreground', bureau ? 'text-xs' : 'text-ui')}>{detail}</span>
        {marques ? <span className={cn('mt-1.5 flex flex-wrap items-center gap-1.5', bureau && 'w1440:hidden')}>{marques}</span> : null}
      </span>
    </>
  );
  const fin =
    geste.geste === 'ouvrir' ? (
      <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
    ) : geste.geste === 'telecharger' ? (
      <Download className={cn('flex-none text-encre-douce', bureau ? 'size-4' : 'size-5')} strokeWidth={1.75} aria-hidden="true" />
    ) : null;

  const zone = 'flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring';

  if (bureau) {
    return (
      <li data-testid="entree-du-coffre" className={cn('flex items-center gap-3 px-4 py-2.5', choisie && 'bg-muted')}>
        <button type="button" aria-pressed={choisie} onClick={onChoisir} className={cn(zone, 'rounded-md')}>
          {contenu}
        </button>
        {marques ? <span className="hidden flex-none items-center gap-1.5 w1440:flex">{marques}</span> : null}
        {geste.geste === 'telecharger' ? (
          <button
            type="button"
            onClick={() => onTelecharger(geste.chemin, nom)}
            aria-label={t('telechargerNomme', { nom })}
            className="inline-flex size-8 flex-none items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
          >
            {fin}
          </button>
        ) : geste.geste === 'ouvrir' ? (
          <Link
            href={`/app/documents/${geste.documentId}`}
            aria-label={t('ouvrirNomme', { nom })}
            className="inline-flex size-8 flex-none items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
          >
            {fin}
          </Link>
        ) : null}
      </li>
    );
  }

  // Téléphone : la ligne entière est le geste (télécharger, ou ouvrir la fiche).
  return (
    <li data-testid="entree-du-coffre">
      {geste.geste === 'ouvrir' ? (
        <Link href={`/app/documents/${geste.documentId}`} className={cn(zone, 'px-4 py-3')}>
          {contenu}
          {fin}
          <span className="sr-only">{t('ouvrir')}</span>
        </Link>
      ) : geste.geste === 'telecharger' ? (
        <button type="button" onClick={() => onTelecharger(geste.chemin, nom)} className={cn(zone, 'w-full px-4 py-3')}>
          {contenu}
          <span className="-mr-2 inline-flex size-11 flex-none items-center justify-center">
            {fin}
            <span className="sr-only">{t('telecharger')}</span>
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{contenu}</div>
      )}
    </li>
  );
}
