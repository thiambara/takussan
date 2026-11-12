'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';

import type { AppNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

import { LienDansLAgence } from './LienDansLAgence';
import { FondDeRangee, IconeDeFamille, useBalayage, useGestesSecondaires } from './NotificationRow';
import { useTexteNotification, type TexteNotification } from './texteNotification';
import { useQuand } from './useQuand';

/** Les lignes montrées d'emblée une fois le repli déplié ; « Voir les N autres » montre le reste. */
const LIGNES_D_EMBLEE = 3;

interface LigneReplieeProps {
  /** Les lignes repliées, de la plus récente à la plus ancienne. */
  readonly lignes: readonly AppNotification[];
  readonly onOpen: (notification: AppNotification) => void;
  readonly onToggleRead: (notification: AppNotification) => void;
  /** « Tout lire » du repli : chacune de ses lignes non lues. */
  readonly onLireTout: (lignes: readonly AppNotification[]) => void;
  readonly pending?: boolean;
  readonly maintenant: Date;
}

/** « 4 nov. » / « 9 novembre » : le libellé de la période d'un repli, comme la maquette (« Du 4 au 9 novembre »). */
function usePeriode(lignes: readonly AppNotification[], maintenant: Date): string {
  const t = useTranslations('nav.notifications');
  const fmt = useFormatteurs();
  const fin = new Date(lignes[0].created_at);
  const debut = new Date(lignes[lignes.length - 1].created_at);
  const memeAnnee = (d: Date) => d.getUTCFullYear() === maintenant.getUTCFullYear();
  const format = (d: Date, mois: boolean) =>
    fmt.date(d, {
      day: 'numeric',
      ...(mois ? { month: 'long' } : {}),
      ...(mois && !memeAnnee(d) ? { year: 'numeric' } : {}),
    });
  const jour = (d: Date) => d.toISOString().slice(0, 10);
  if (jour(debut) === jour(fin)) return format(fin, true);
  const memeMois = debut.getUTCFullYear() === fin.getUTCFullYear() && debut.getUTCMonth() === fin.getUTCMonth();
  return t('periode', { debut: format(debut, !memeMois), fin: format(fin, true) });
}

/**
 * Le titre d'un repli : le titre commun s'ils sont identiques (« Mise en avant terminée »), sinon le
 * titre court du code (`notifications.repli.titres.<code>`, « Intervention clôturée »), sinon « {le
 * premier} et N autres ». Le compte est nommé par le genre de la cible (« 16 biens »).
 */
function useTitreDuRepli(lignes: readonly AppNotification[], textes: readonly TexteNotification[]): {
  titre: string;
  identiques: boolean;
} {
  const t = useTranslations('notifications.repli');
  const identiques = textes.every((x) => x.titre === textes[0].titre);
  const code = lignes[0].code;
  const kind = lignes[0].target?.kind;
  const compte = t.has(`compte.${kind}`) ? t(`compte.${kind}`, { count: lignes.length }) : t('compte.autre', { count: lignes.length });
  if (identiques) return { titre: t('ligne', { titre: textes[0].titre, compte }), identiques };
  if (code && t.has(`titres.${code}`)) return { titre: t('ligne', { titre: t(`titres.${code}`), compte }), identiques };
  return { titre: t('etAutres', { titre: textes[0].titre, count: lignes.length - 1 }), identiques };
}

/** Une ligne dépliée : son lien, sa date, et son propre geste lu / non lu. */
function SousLigne({
  notification,
  texte,
  identiques,
  onOpen,
  onToggleRead,
  pending,
  maintenant,
}: {
  readonly notification: AppNotification;
  readonly texte: TexteNotification;
  /** Les titres du repli sont identiques : la ligne se nomme par son détail. */
  readonly identiques: boolean;
  readonly onOpen: (n: AppNotification) => void;
  readonly onToggleRead: (n: AppNotification) => void;
  readonly pending: boolean;
  readonly maintenant: Date;
}) {
  const t = useTranslations('nav.notifications');
  const quandDe = useQuand();
  const nonLue = !notification.read_at;
  const path = notification.target?.path;
  const agencyId = notification.target?.agency_id;
  const nom = identiques ? (texte.corps ?? texte.titre) : texte.titre;
  const corps: ReactNode = (
    <>
      <span className={cn('min-w-0 flex-1 truncate', nonLue && 'font-semibold')}>{nom}</span>
      <time dateTime={notification.created_at} className="flex-none text-xs text-muted-foreground">
        {quandDe(notification.created_at, maintenant)}
      </time>
    </>
  );
  const classe = 'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring';
  const ouvrir = () => onOpen(notification);
  return (
    <li className="flex items-center gap-1 border-b border-border/50 last:border-b-0" data-slot="ligne-depliee">
      {path && agencyId !== undefined ? (
        <LienDansLAgence path={path} agencyId={agencyId} onOpen={ouvrir} className={classe} classeSansLien={classe}>
          {corps}
        </LienDansLAgence>
      ) : path ? (
        <Link href={path} onClick={ouvrir} className={classe}>
          {corps}
        </Link>
      ) : (
        <span className={classe}>{corps}</span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => onToggleRead(notification)}
        aria-label={nonLue ? t('marquerLue') : t('marquerNonLue')}
        className="inline-flex size-8 flex-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
      >
        <span aria-hidden="true" className={cn('size-2.5 rounded-full', nonLue ? 'bg-primary' : 'border border-border')} />
      </button>
    </li>
  );
}

/**
 * TCK-2634 — des notifications consécutives de même nature, repliées en une ligne (maquette
 * `app-notifications`, « Mise en avant terminée · 9 biens › »). La ligne est un bouton qui déplie ;
 * dépliée, chaque ligne garde son lien et son geste. Son geste secondaire (balayage au téléphone,
 * bouton-icône au bureau) lit TOUTES ses lignes non lues — le compte des non-lues et la pagination
 * de l'API n'en sont pas changés.
 */
export function LigneRepliee({ lignes, onOpen, onToggleRead, onLireTout, pending = false, maintenant }: LigneReplieeProps) {
  const t = useTranslations('nav.notifications');
  const quandDe = useQuand();
  const rendre = useTexteNotification();
  const textes = lignes.map(rendre);
  const { titre, identiques } = useTitreDuRepli(lignes, textes);
  const periode = usePeriode(lignes, maintenant);
  const balayage = useBalayage();
  const [ouverte, setOuverte] = useState(false);
  const [toutes, setToutes] = useState(false);
  const idListe = useId();
  const nonLues = lignes.filter((l) => !l.read_at).length;
  const gestes = useGestesSecondaires({
    nonLue: true,
    pending,
    onBasculer: () => {
      balayage.fermer();
      onLireTout(lignes);
    },
    libelleBureau: t('toutLireLeRepli', { count: nonLues }),
    ouvrirLeBalayage: balayage.ouvrir,
  });
  const montrees = toutes ? lignes : lignes.slice(0, LIGNES_D_EMBLEE);

  return (
    <li className="relative overflow-hidden" data-slot="notification-repliee" data-non-lue={nonLues > 0 || undefined}>
      {nonLues > 0 ? gestes.panneau : null}
      <FondDeRangee nonLue={nonLues > 0} decalage={balayage.decalage} poignees={balayage.poignees}>
        <button
          type="button"
          aria-expanded={ouverte}
          aria-controls={idListe}
          onClick={() => setOuverte((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <IconeDeFamille notification={lignes[0]} compte={lignes.length} />
          <span className="min-w-0 flex-1">
            <span className={cn('block line-clamp-2 text-corps leading-snug text-foreground', nonLues > 0 ? 'font-semibold' : 'font-medium')}>
              {titre}
            </span>
            <span className="block truncate text-ui text-muted-foreground">{periode}</span>
            <time dateTime={lignes[0].created_at} className="mt-0.5 block text-xs text-muted-foreground">
              {quandDe(lignes[0].created_at, maintenant)}
            </time>
          </span>
          <ChevronDown
            className={cn('size-5 flex-none text-muted-foreground transition-transform motion-reduce:transition-none', ouverte && 'rotate-180')}
            aria-hidden="true"
          />
          <span className="sr-only">{ouverte ? t('replier') : t('deplier')}</span>
        </button>
        {nonLues > 0 ? gestes.bouton : null}
      </FondDeRangee>
      {ouverte ? (
        <ul id={idListe} className="border-t border-border/60 bg-muted/40 py-1 pr-4 pl-17 text-ui">
          {montrees.map((n, i) => (
            <SousLigne
              key={n.id}
              notification={n}
              texte={textes[i]}
              identiques={identiques}
              onOpen={onOpen}
              onToggleRead={onToggleRead}
              pending={pending}
              maintenant={maintenant}
            />
          ))}
          {!toutes && lignes.length > LIGNES_D_EMBLEE ? (
            <li>
              <button
                type="button"
                onClick={() => setToutes(true)}
                className="flex min-h-9 items-center rounded-md font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                {t('voirAutres', { count: lignes.length - LIGNES_D_EMBLEE })}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
