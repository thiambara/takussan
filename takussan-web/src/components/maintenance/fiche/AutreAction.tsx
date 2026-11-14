'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpDown, Ban, Check, ChevronDown, ClipboardCheck, Eye, FileText, MoreHorizontal, Play, RotateCcw, Archive } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { SheetClose } from '@/components/ui/sheet';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { aDesAutresActions, autresActions, PRIORITES_DECROISSANTES } from '@/lib/maintenance/fiche';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import { useRequestMaintenanceQuote, useTransitionMaintenanceStatus, useUpdateMaintenanceRequest } from '@/lib/queries/maintenance';
import { cn } from '@/lib/utils';
import type { MaintenancePriority, MaintenanceStatus } from '@/types/maintenance';

/**
 * TCK-2653 — « Autre action » (maquette « Fiche — Autre action ») : un menu au bureau, la feuille de
 * « ⋯ » de l'en-tête au téléphone. Dans l'ordre : « Demander un devis d'abord », les transitions que le SERVEUR permet
 * (`abilities.transitions`), chacune avec sa phrase d'effet, « Changer la priorité », « Saisir le
 * rapport de fin » quand un prestataire tient la demande ; puis, séparé, « Annuler la demande ».
 *
 * Rien n'est inventé : sans `abilities.transitions`, aucun statut n'est proposé ; « Terminée » ne
 * l'est jamais (elle passe par le rapport), ni « Assignée » sans prestataire (`autresActions`).
 *
 * L'annulation se confirme ; l'API ne prend pas de motif (`PUT …/status` n'accepte que `status`) :
 * la confirmation le dit au lieu de demander un motif que personne ne lirait.
 */
type Entree =
  | { readonly cle: 'devis' }
  | { readonly cle: 'transition'; readonly statut: MaintenanceStatus }
  | { readonly cle: 'priorite' }
  | { readonly cle: 'rapport' };

/** Les statuts qui ont une phrase d'effet écrite ; les autres se disent « Passer en « … » ». */
const PHRASES: readonly MaintenanceStatus[] = ['acknowledged', 'in_progress', 'open', 'closed'];

/** Les écritures d'« Autre action », levées dans la fiche : le menu du bureau et la feuille du téléphone les partagent, et la fiche dit l'échec. */
export function useEcrituresDAutreAction(id: number) {
  const devis = useRequestMaintenanceQuote(id);
  const transition = useTransitionMaintenanceStatus(id);
  const priorite = useUpdateMaintenanceRequest(id);
  return { devis, transition, priorite, enCours: devis.isPending || transition.isPending || priorite.isPending, erreur: devis.error ?? transition.error ?? priorite.error };
}
export type EcrituresDAutreAction = ReturnType<typeof useEcrituresDAutreAction>;

/** Le message d'échec d'« Autre action », s'il y en a un. */
export function EchecDAutreAction({ ecritures, className }: { readonly ecritures: EcrituresDAutreAction; readonly className?: string }) {
  const t = useTranslations('maintenance.fiche.autre');
  const messageErreur = useMessageErreurApi();
  if (!ecritures.erreur) return null;
  return (
    <p role="alert" className={cn('text-xs text-destructive', className)}>
      {messageErreur(ecritures.erreur, t('echec'))}
    </p>
  );
}

/**
 * L'état d'« Autre action », levé dans la fiche : le menu du bureau, la liste de « ⋯ » au téléphone
 * (montée par la coque, hors de l'arbre de la page) et les deux feuilles qui en partent (priorité,
 * confirmation de l'annulation) le partagent. Les feuilles restent dans la page : fermer « ⋯ » ne les
 * démonte pas.
 */
export function useAutreAction(request: InterventionEnFile, ecritures: EcrituresDAutreAction, onRapport: () => void) {
  const actions = autresActions(request);
  const [choixPriorite, setChoixPriorite] = useState(false);
  const [annulation, setAnnulation] = useState(false);
  const entrees: Entree[] = [
    ...(actions.devis ? [{ cle: 'devis' } as const] : []),
    ...actions.transitions.map((statut) => ({ cle: 'transition', statut }) as const),
    ...(actions.priorite ? [{ cle: 'priorite' } as const] : []),
    ...(actions.rapport ? [{ cle: 'rapport' } as const] : []),
  ];
  const agir = (e: Entree) => {
    if (e.cle === 'devis') ecritures.devis.mutate();
    else if (e.cle === 'transition') ecritures.transition.mutate({ status: e.statut });
    else if (e.cle === 'priorite') setChoixPriorite(true);
    else onRapport();
  };
  return {
    request,
    ecritures,
    entrees,
    annulable: actions.annuler,
    present: aDesAutresActions(actions),
    agir,
    demanderLAnnulation: () => setAnnulation(true),
    choixPriorite,
    setChoixPriorite,
    annulation,
    setAnnulation,
  };
}
export type EtatDAutreAction = ReturnType<typeof useAutreAction>;

/** Le titre, la phrase d'effet et l'icône d'une entrée. */
function useLibelles() {
  const t = useTranslations('maintenance.fiche.autre');
  const tStatut = useTranslations('maintenance.status');
  const titre = (e: Entree) =>
    e.cle === 'transition' ? (PHRASES.includes(e.statut) ? t(`transitions.${e.statut}.titre`) : t('transitions.autre.titre', { statut: tStatut(e.statut) })) : t(`${e.cle}.titre`);
  const texte = (e: Entree) => (e.cle === 'transition' ? (PHRASES.includes(e.statut) ? t(`transitions.${e.statut}.texte`) : t('transitions.autre.texte')) : t(`${e.cle}.texte`));
  return { t, titre, texte };
}

/** L'icône d'une entrée (un composant par cas : rien n'est créé au rendu). */
function IconeDEntree({ e, className }: { readonly e: Entree | 'annuler'; readonly className: string }) {
  const p = { className, strokeWidth: 1.75, 'aria-hidden': true } as const;
  if (e === 'annuler') return <Ban {...p} />;
  if (e.cle === 'devis') return <FileText {...p} />;
  if (e.cle === 'priorite') return <ArrowUpDown {...p} />;
  if (e.cle === 'rapport') return <ClipboardCheck {...p} />;
  switch (e.statut) {
    case 'acknowledged':
      return <Eye {...p} />;
    case 'in_progress':
      return <Play {...p} />;
    case 'open':
      return <RotateCcw {...p} />;
    case 'closed':
      return <Archive {...p} />;
    default:
      return <MoreHorizontal {...p} />;
  }
}

const cleDe = (e: Entree | 'annuler') => (e === 'annuler' ? 'annuler' : e.cle === 'transition' ? `transition-${e.statut}` : e.cle);

function ContenuDeLigne({ e }: { readonly e: Entree | 'annuler' }) {
  const { t, titre, texte } = useLibelles();
  const annuler = e === 'annuler';
  return (
    <>
      <IconeDEntree e={e} className={cn('size-5 flex-none', annuler ? 'text-destructive' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn('block text-base font-medium', annuler && 'text-destructive')}>{annuler ? t('annuler.titre') : titre(e)}</span>
        <span className={cn('block text-ui', annuler ? 'text-destructive' : 'text-muted-foreground')}>{annuler ? t('annuler.texte') : texte(e)}</span>
      </span>
    </>
  );
}

/** Le bureau : « Autre action », un menu sous le bouton. */
export function AutreActionMenu({ etat }: { readonly etat: EtatDAutreAction }) {
  const t = useTranslations('maintenance.fiche.autre');
  if (!etat.present) return null;
  const ligne = (e: Entree | 'annuler') => (
    <DropdownMenuItem key={cleDe(e)} data-action={cleDe(e)} onClick={() => (e === 'annuler' ? etat.demanderLAnnulation() : etat.agir(e))} disabled={etat.ecritures.enCours} className="min-h-14 items-center gap-3 py-2.5">
      <ContenuDeLigne e={e} />
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" data-slot="autre-action" />}>
        {t('bouton')}
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[calc(var(--spacing)*94.44)] px-3 py-1">
        {etat.entrees.map(ligne)}
        {etat.annulable ? (
          <>
            <DropdownMenuSeparator />
            {ligne('annuler')}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Le téléphone : les entrées, dans la feuille de « ⋯ » de l'en-tête (`DeclarerEnTete actions`, maquette
 * « Fiche — Autre action »). Chaque entrée ferme la feuille (`SheetClose`) avant d'agir.
 */
export function AutreActionListe({ etat }: { readonly etat: EtatDAutreAction }) {
  const ligne = (e: Entree | 'annuler') => (
    <li key={cleDe(e)}>
      <SheetClose
        render={<button type="button" />}
        data-action={cleDe(e)}
        onClick={() => (e === 'annuler' ? etat.demanderLAnnulation() : etat.agir(e))}
        disabled={etat.ecritures.enCours}
        className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
      >
        <ContenuDeLigne e={e} />
      </SheetClose>
    </li>
  );
  return (
    <ul data-slot="autre-action-liste" className="divide-y divide-border">
      {etat.entrees.map(ligne)}
      {etat.annulable ? ligne('annuler') : null}
    </ul>
  );
}

/** Les deux feuilles qui partent d'« Autre action » : choisir la priorité, confirmer l'annulation. */
export function FeuillesDAutreAction({ etat }: { readonly etat: EtatDAutreAction }) {
  const t = useTranslations('maintenance.fiche.autre');
  const { request, ecritures } = etat;
  return (
    <>
      <FeuilleDuBas open={etat.choixPriorite} onOpenChange={etat.setChoixPriorite} titre={t('priorite.titre')}>
        <ChoixDePriorite
          actuelle={request.priority}
          onChoisir={(p) => {
            etat.setChoixPriorite(false);
            if (p !== request.priority) ecritures.priorite.mutate({ priority: p });
          }}
        />
      </FeuilleDuBas>

      <FeuilleDuBas
        open={etat.annulation}
        onOpenChange={etat.setAnnulation}
        titre={t('annuler.confirmerTitre')}
        pied={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => etat.setAnnulation(false)}>
              {t('annuler.garder')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={ecritures.transition.isPending}
              onClick={() => {
                ecritures.transition.mutate({ status: 'cancelled' }, { onSuccess: () => etat.setAnnulation(false) });
              }}
            >
              {t('annuler.confirmer')}
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">{t('annuler.confirmerTexte', { titre: request.title })}</p>
      </FeuilleDuBas>
    </>
  );
}

function ChoixDePriorite({ actuelle, onChoisir }: { readonly actuelle: MaintenancePriority; readonly onChoisir: (p: MaintenancePriority) => void }) {
  const tPriorite = useTranslations('maintenance.priority');
  return (
    <ul className="space-y-1">
      {PRIORITES_DECROISSANTES.map((p) => (
        <li key={p}>
          <button type="button" aria-pressed={p === actuelle} onClick={() => onChoisir(p)} className="flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-left text-base outline-none hover:bg-muted focus-visible:bg-muted">
            <span className="min-w-0 flex-1">{tPriorite(p)}</span>
            {p === actuelle ? <Check className="size-4 text-primary" strokeWidth={1.75} aria-hidden="true" /> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
