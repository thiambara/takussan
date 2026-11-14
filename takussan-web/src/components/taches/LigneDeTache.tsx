'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { Building2, CalendarClock, Check, Phone, TriangleAlert, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Cocher, ROND } from '@/components/journee/pieces';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { TacheDeLaPage } from '@/lib/queries/taches';
import { estFaite, groupeDe, issueDuBalayage } from '@/lib/taches/taches';
import { cn } from '@/lib/utils';

/** Le prénom d'un client rattaché, pour « Appeler Awa » et le message WhatsApp. */
export const prenomDe = (libelle: string) => libelle.split(' ')[0] ?? libelle;

/** L'échéance d'une tâche en clair : le retard (« En retard depuis le 17 oct. »), l'heure du jour, ou la date. */
export function useEcheanceEnClair() {
  const t = useTranslations('taches.ligne');
  const f = useFormatteurs();
  return (tache: Pick<TacheDeLaPage, 'due_at' | 'status'>, maintenant: Date): { readonly texte: string; readonly retard: boolean } => {
    if (!tache.due_at) return { texte: t('sansEcheance'), retard: false };
    const groupe = groupeDe(tache, maintenant);
    if (groupe === 'retard') return { texte: t('enRetardDepuis', { date: f.jourMois(tache.due_at, maintenant) }), retard: true };
    if (groupe === 'aujourdhui') return { texte: t('aujourdhuiA', { heure: f.heure(tache.due_at) }), retard: false };
    return { texte: f.date(tache.due_at, { weekday: 'short', day: 'numeric', month: 'short' }), retard: false };
  };
}

interface LigneDeTacheProps {
  readonly tache: TacheDeLaPage;
  readonly maintenant: Date;
  /** Au bureau, dans une colonne : sans les gestes de contact. */
  readonly dense?: boolean;
  readonly enCours: boolean;
  readonly onCocher: (tache: TacheDeLaPage) => void;
  readonly onOuvrir: (tache: TacheDeLaPage) => void;
  readonly onReporter: (tache: TacheDeLaPage) => void;
}

/**
 * Une ligne de « Tâches » (maquette `LigneTache`) : le cercle à cocher, le titre (barré une fois
 * faite), le bien ou le client nommé, l'échéance (rouge si passée), Appeler et WhatsApp pour un
 * client joignable. Toucher la ligne ouvre la tâche. Au doigt, balayer à droite la coche, à gauche
 * ouvre « Reporter » — le cercle et la feuille restent le chemin sans geste.
 */
export function LigneDeTache({ tache, maintenant, dense, enCours, onCocher, onOuvrir, onReporter }: LigneDeTacheProps) {
  const t = useTranslations('taches.ligne');
  const echeanceEnClair = useEcheanceEnClair();
  const faite = estFaite(tache);
  const { texte, retard } = echeanceEnClair(tache, maintenant);
  const cible = tache.taskable;
  const libelleCible = cible ? (cible.label ?? t(`cache.${cible.type}`)) : null;
  const telephone = cible?.type === 'customer' && isReachable(cible.phone) ? cible.phone : null;

  const depart = useRef<{ x: number; y: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const largeur = useRef(0);

  const commencer = (e: PointerEvent<HTMLLIElement>) => {
    if (e.pointerType !== 'touch' || enCours) return;
    depart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    largeur.current = e.currentTarget.getBoundingClientRect().width;
  };
  const suivre = (e: PointerEvent<HTMLLIElement>) => {
    const d = depart.current;
    if (!d || d.id !== e.pointerId) return;
    const x = e.clientX - d.x;
    // Un défilement vertical n'est pas un balayage.
    if (dx === 0 && Math.abs(e.clientY - d.y) > Math.abs(x)) {
      depart.current = null;
      return;
    }
    setDx(faite ? Math.min(0, x) : x);
  };
  const finir = () => {
    const issue = issueDuBalayage(dx, largeur.current);
    depart.current = null;
    setDx(0);
    if (issue === 'fait') onCocher(tache);
    if (issue === 'reporter') onReporter(tache);
  };

  return (
    <li
      data-slot="ligne-de-tache"
      data-tache={tache.id}
      onPointerDown={commencer}
      onPointerMove={suivre}
      onPointerUp={finir}
      onPointerCancel={() => {
        depart.current = null;
        setDx(0);
      }}
      className={cn('relative overflow-hidden', dx !== 0 && 'touch-none', dx > 0 ? 'bg-success' : dx < 0 ? 'bg-warning' : null)}
    >
      {dx > 0 ? (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 flex w-26 items-center justify-center gap-1.5 text-sm font-semibold text-success-foreground">
          <Check className="size-5" />
          {t('fait')}
        </span>
      ) : dx < 0 ? (
        <span aria-hidden="true" className="absolute inset-y-0 right-0 flex w-26 items-center justify-center gap-1.5 text-sm font-semibold text-foreground">
          <CalendarClock className="size-5" />
          {t('reporter')}
        </span>
      ) : null}
      <div
        style={dx !== 0 ? { transform: `translateX(${dx}px)` } : undefined}
        className={cn('relative flex items-center gap-1 py-2 pr-4', dense ? 'bg-card pl-1' : 'bg-background pl-1.5')}
      >
        <Cocher faite={faite} disabled={enCours} libelle={t(faite ? 'rouvrir' : 'cocher', { titre: tache.title })} onClick={() => onCocher(tache)} />
        <button
          type="button"
          onClick={() => onOuvrir(tache)}
          className="min-w-0 flex-1 rounded-md py-0.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <span className={cn('block text-corps font-medium leading-snug', faite && 'text-muted-foreground line-through')}>{tache.title}</span>
          {libelleCible ? (
            <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              {cible?.type === 'customer' ? (
                <UserRound className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Building2 className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
              )}
              <span className="truncate">{libelleCible}</span>
            </span>
          ) : null}
          <span className={cn('mt-0.5 flex items-center gap-1 text-ui font-medium tabular-nums', retard && !faite ? 'text-destructive' : 'text-encre-douce')}>
            {retard && !faite ? <TriangleAlert className="size-3.5" strokeWidth={1.75} aria-hidden="true" /> : null}
            {texte}
          </span>
        </button>
        {telephone && !dense && libelleCible ? (
          <>
            <a href={telHref(telephone)} aria-label={t('appeler', { nom: libelleCible })} className={cn(ROND, 'border border-border bg-card text-foreground hover:bg-muted')}>
              <Phone className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
            </a>
            <a
              href={whatsappHref(telephone, t('messageWhatsApp', { prenom: prenomDe(libelleCible) }))}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('whatsapp', { nom: libelleCible })}
              className={cn(ROND, 'ml-1 bg-success text-success-foreground')}
            >
              <IconeWhatsApp className="size-4.5" />
            </a>
          </>
        ) : null}
      </div>
    </li>
  );
}
