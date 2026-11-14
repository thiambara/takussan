'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Check, Pencil, Phone, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Cocher, GESTE, GESTE_CONTOUR } from '@/components/journee/pieces';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { echeanceDuReport, type Report } from '@/lib/journee/journee';
import { useModifierTache, useSupprimerTache, type ModificationDeTache, type TacheDeLaPage } from '@/lib/queries/taches';
import { echeanceDeLaDate, estFaite } from '@/lib/taches/taches';
import type { AgencyStaffMember } from '@/types/agent-crm';
import { cn } from '@/lib/utils';
import { ChoixDansUneListe } from './ChoixDansUneListe';
import { prenomDe, useEcheanceEnClair } from './LigneDeTache';

/** Qui peut modifier une tâche : son assigné ou son créateur (`TaskPolicy::update`). */
export function peutModifier(tache: Pick<TacheDeLaPage, 'assignee' | 'creator'>, moi: number | null): boolean {
  return moi !== null && (tache.assignee?.id === moi || tache.creator?.id === moi);
}

/** « Supprimer » n'est offert qu'au créateur (`TaskPolicy::delete`). */
export function peutSupprimer(tache: Pick<TacheDeLaPage, 'creator'>, moi: number | null): boolean {
  return moi !== null && tache.creator?.id === moi;
}

const lienDeLaCible = (c: NonNullable<TacheDeLaPage['taskable']>) => (c.type === 'customer' ? `/app/customers/${c.id}` : `/app/properties/${c.id}`);

interface FicheDeTacheProps {
  readonly tache: TacheDeLaPage;
  readonly maintenant: Date;
  readonly moi: number | null;
  readonly membres: readonly AgencyStaffMember[];
  /** La tâche telle que l'API la rend après un geste (l'assigné peut être le remplaçant). */
  readonly onModifiee: (tache: TacheDeLaPage) => void;
  readonly onSupprimee: () => void;
}

/**
 * « Tâche ouverte » (maquette `FicheTache`) : le titre (modifiable), le retard, « Reporter à »
 * (Demain · Lundi · Dans une semaine · Choisir…), à quoi elle se rattache, à qui elle est assignée,
 * quand elle a été créée, Appeler et WhatsApp pour un client, « Supprimer » pour son créateur.
 * « Marquer faite » est le pied de la feuille (`PiedDeFicheDeTache`).
 */
export function FicheDeTache({ tache, maintenant, moi, membres, onModifiee, onSupprimee }: FicheDeTacheProps) {
  const t = useTranslations('taches.fiche');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const echeanceEnClair = useEcheanceEnClair();
  const idAssigne = useId();
  const modifier = useModifierTache();
  const supprimer = useSupprimerTache();
  const [titre, setTitre] = useState<string | null>(null);
  const [choisir, setChoisir] = useState(false);
  const [date, setDate] = useState('');
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const modifiable = peutModifier(tache, moi);
  const faite = estFaite(tache);
  const { texte, retard } = echeanceEnClair(tache, maintenant);
  const cible = tache.taskable;
  const telephone = cible?.type === 'customer' && isReachable(cible.phone) ? cible.phone : null;
  const nomCible = cible?.label ?? null;

  const envoyer = (corps: Omit<ModificationDeTache, 'id'>, apres?: () => void) => {
    setErreur(null);
    modifier.mutate(
      { id: tache.id, ...corps },
      {
        onSuccess: (r) => {
          onModifiee({ ...tache, ...r.data });
          apres?.();
        },
        onError: (e) => setErreur(messageErreur(e, t('echec'))),
      },
    );
  };

  const reporter = (r: Report) => envoyer({ due_at: echeanceDuReport(r, maintenant) });

  // L'assigné courant, puis le personnel ; « Moi » toujours, même quand la liste est refusée.
  const choix = [
    ...(moi !== null ? [{ id: moi, name: t('moi') }] : []),
    ...(tache.assignee && tache.assignee.id !== moi ? [tache.assignee] : []),
    ...membres.filter((m) => m.id !== moi && m.id !== tache.assignee?.id),
  ];

  return (
    <div data-slot="fiche-de-tache">
      <div className="flex items-start gap-1">
        <Cocher
          className="-ml-2.5"
          faite={faite}
          disabled={!modifiable || modifier.isPending}
          libelle={t(faite ? 'rouvrir' : 'cocher', { titre: tache.title })}
          onClick={() => envoyer({ status: faite ? 'open' : 'done' })}
        />
        {titre === null ? (
          <div className="min-w-0 flex-1 pt-2">
            <p className={cn('text-lg font-semibold leading-snug', faite && 'text-muted-foreground line-through')}>{tache.title}</p>
            <p className={cn('mt-1 flex items-center gap-1 text-sm font-medium', retard && !faite ? 'text-destructive' : 'text-encre-douce')}>
              {retard && !faite ? <TriangleAlert className="size-3.5" strokeWidth={1.75} aria-hidden="true" /> : null}
              {texte}
            </p>
          </div>
        ) : (
          <form
            className="flex min-w-0 flex-1 items-center gap-2 pt-0.5"
            onSubmit={(e) => {
              e.preventDefault();
              const propre = titre.trim();
              if (propre && propre !== tache.title) envoyer({ title: propre }, () => setTitre(null));
              else setTitre(null);
            }}
          >
            <Input ref={(champ) => champ?.focus()} value={titre} onChange={(e) => setTitre(e.target.value)} aria-label={t('titre')} maxLength={255} />
            <Button type="submit" size="sm" disabled={!titre.trim() || modifier.isPending}>
              {t('enregistrer')}
            </Button>
          </form>
        )}
        {modifiable && titre === null ? (
          <button
            type="button"
            aria-label={t('modifierLeTitre')}
            onClick={() => setTitre(tache.title)}
            className="inline-flex size-11 flex-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
          >
            <Pencil className="size-4.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      {modifiable && !faite ? (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">{t('reporterA')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['demain', 'lundi', 'semaine'] as const).map((r) => (
              <button key={r} type="button" disabled={modifier.isPending} onClick={() => reporter(r)} className={cn(GESTE, GESTE_CONTOUR, 'rounded-full px-4')}>
                {t(`report.${r}`)}
              </button>
            ))}
            <button type="button" aria-expanded={choisir} onClick={() => setChoisir((c) => !c)} className={cn(GESTE, GESTE_CONTOUR, 'rounded-full px-4')}>
              {t('report.choisir')}
            </button>
          </div>
          {choisir ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DateTimePicker value={date} onValueChange={setDate} />
              <Button
                type="button"
                disabled={!echeanceDeLaDate(date) || modifier.isPending}
                onClick={() => {
                  const echeance = echeanceDeLaDate(date);
                  if (echeance) envoyer({ due_at: echeance }, () => setChoisir(false));
                }}
              >
                {t('report.valider')}
              </Button>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <dl className="mt-5 divide-y divide-border border-y border-border text-corps">
        {cible ? (
          <div className="flex min-h-12 items-center gap-3 py-2">
            <dt className="flex-none text-sm text-muted-foreground">{t('rattacheeA')}</dt>
            <dd className="min-w-0 flex-1 text-right">
              {nomCible ? (
                <Link href={lienDeLaCible(cible)} className="text-primary underline-offset-2 hover:underline">
                  {nomCible}
                </Link>
              ) : (
                t(`cache.${cible.type}`)
              )}
            </dd>
          </div>
        ) : null}
        <div className="flex min-h-12 items-center gap-3 py-2">
          <dt className="flex-none text-sm text-muted-foreground">
            <label htmlFor={idAssigne}>{t('assigneeA')}</label>
          </dt>
          <dd className="min-w-0 flex-1 text-right">
            {modifiable && choix.length > 1 ? (
              <ChoixDansUneListe
                id={idAssigne}
                className="ml-auto w-auto max-w-full border-transparent bg-transparent shadow-none"
                valeur={tache.assignee ? String(tache.assignee.id) : ''}
                disabled={modifier.isPending}
                options={[...(tache.assignee ? [] : [{ value: '', label: t('personne') }]), ...choix.map((m) => ({ value: String(m.id), label: m.name }))]}
                onChange={(v) => {
                  const id = Number.parseInt(v, 10);
                  if (Number.isInteger(id)) envoyer({ assigned_to_id: id });
                }}
              />
            ) : (
              <span id={idAssigne}>{tache.assignee ? (tache.assignee.id === moi ? t('moi') : tache.assignee.name) : t('personne')}</span>
            )}
          </dd>
        </div>
        {tache.created_at ? (
          <div className="flex min-h-12 items-center gap-3 py-2">
            <dt className="flex-none text-sm text-muted-foreground">{t('creee')}</dt>
            <dd className="min-w-0 flex-1 text-right">
              {tache.creator && tache.creator.id !== moi
                ? t('creeeLePar', { date: f.jourMois(tache.created_at, maintenant), nom: tache.creator.name })
                : f.jourMois(tache.created_at, maintenant)}
            </dd>
          </div>
        ) : null}
      </dl>

      {telephone && nomCible ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={telHref(telephone)} className={cn(GESTE, GESTE_CONTOUR)}>
            <Phone className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {t('appeler', { prenom: prenomDe(nomCible) })}
          </a>
          <a
            href={whatsappHref(telephone, t('messageWhatsApp', { prenom: prenomDe(nomCible), titre: tache.title }))}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(GESTE, 'bg-success text-success-foreground hover:bg-success/90')}
          >
            <IconeWhatsApp className="size-4" />
            {t('whatsapp')}
          </a>
        </div>
      ) : null}

      {erreur ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}

      {peutSupprimer(tache, moi) ? (
        confirmer ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={supprimer.isPending}
              onClick={() =>
                supprimer.mutate(
                  { id: tache.id },
                  { onSuccess: onSupprimee, onError: (e) => setErreur(messageErreur(e, t('echecSuppression'))) },
                )
              }
            >
              {t('confirmerSuppression')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmer(false)}>
              {t('annuler')}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmer(true)}
            className="mt-3 flex h-11 items-center gap-2 rounded-md text-corps font-medium text-destructive outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {t('supprimer')}
          </button>
        )
      ) : null}
    </div>
  );
}

/** Le pied de la feuille : « Marquer faite » (ou « Rouvrir »). */
export function PiedDeFicheDeTache({ tache, moi, onModifiee }: { readonly tache: TacheDeLaPage; readonly moi: number | null; readonly onModifiee: (t: TacheDeLaPage) => void }) {
  const t = useTranslations('taches.fiche');
  const messageErreur = useMessageErreurApi();
  const modifier = useModifierTache();
  const [erreur, setErreur] = useState<string | null>(null);
  const faite = estFaite(tache);
  if (!peutModifier(tache, moi)) return null;
  return (
    <div className="w-full">
      {erreur ? (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="w-full xl:ml-auto xl:flex xl:w-auto"
        variant={faite ? 'outline' : 'default'}
        disabled={modifier.isPending}
        onClick={() =>
          modifier.mutate(
            { id: tache.id, status: faite ? 'open' : 'done' },
            { onSuccess: (r) => onModifiee({ ...tache, ...r.data }), onError: (e) => setErreur(messageErreur(e, t('echec'))) },
          )
        }
      >
        {faite ? null : <Check className="size-4.5" aria-hidden="true" />}
        {t(faite ? 'rouvrirLaTache' : 'marquerFaite')}
      </Button>
    </div>
  );
}
