'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/toast';
import {
  getNotificationPreferencesAction,
  updateNotificationPreferencesAction,
} from '@/app/actions/notification-preferences';
import {
  EVENEMENTS_DE_PREFERENCE,
  GROUPES_DE_PREFERENCES,
  type NotificationChannel,
  type NotificationPreferenceCell,
  type NotificationPreferencesResponse,
} from '@/lib/notification-preferences';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { cn } from '@/lib/utils';

/**
 * TCK-070 — les préférences de notification, événement × canal, enregistrées à chaque case.
 *
 * TCK-2636 (maquette `app-profil` a-2, décision 7 (a) du porteur) — DEUX DESSINS d'une même donnée :
 *
 *  · sous `lg`, UNE RANGÉE PAR ÉVÉNEMENT, groupée sous son titre, les canaux en PUCES cochables qui
 *    passent à la ligne. La matrice de cinq colonnes ne tenait pas à 390 : la carte de chaque groupe
 *    était en `overflow-hidden`, l'en-tête « WhatsApp » commençait à x = 373 pour une carte qui
 *    s'arrêtait à 374 — le canal par défaut au Sénégal ne se réglait pas au téléphone ;
 *  · dès `lg`, LA MATRICE (elle a la place), en-têtes en français, une carte par groupe, et un cadre
 *    qui défile lui-même s'il manque de largeur (jamais `overflow-hidden`).
 *
 * Un seul des deux est monté (`useMatchesMedia`), pas deux cachés par CSS : sinon chaque case
 * existerait deux fois pour l'assistance et pour les tests.
 *
 * Icônes au trait 2 de la maquette (`stroke-2`, ADR-0106 § 2 : « trait d'icône de la maquette ») :
 * la portée de `/app` en pose 1,75 puis 1,5 par défaut.
 *
 * Une case `locked` dit pourquoi : en sous-ligne au téléphone (« SMS et WhatsApp : vérifiez votre
 * téléphone… »), en infobulle et dans le nom accessible au bureau. Deux cas se disent autrement :
 *  · `inapp_always_on` — « Appli » est toujours active : elle se dessine cochée, sans cadenas
 *    (la maquette la dessine ainsi), et ne se décoche pas ;
 *  · `channel_unavailable` — aucun envoi ne l'honorerait (TCK-588). Au téléphone la puce n'est pas
 *    proposée, et une ligne du groupe le dit (« Notification mobile : pas encore disponible. ») ; au
 *    bureau la case reste, verrouillée.
 */

const PREFS_KEY = ['notifications', 'preferences'] as const;
const CANAL_PUSH = 'push';
const RAISON_INDISPONIBLE = 'channel_unavailable';
const RAISON_TOUJOURS_ACTIVE = 'inapp_always_on';
/** `lg` (64rem) : la matrice. `matchMedia` lit le `rem` initial, 16 px, comme Tailwind. */
const REQUETE_MATRICE = '(min-width: 64rem)';

type Groupe = (typeof GROUPES_DE_PREFERENCES)[number];

function cellKey(event: string, channel: string): string {
  return `${event}|${channel}`;
}

function normalizePreferencesResponse(
  next: Partial<NotificationPreferencesResponse>,
  previous?: NotificationPreferencesResponse,
): NotificationPreferencesResponse {
  return {
    preferences: Array.isArray(next.preferences)
      ? next.preferences
      : (previous?.preferences ?? []),
    events: Array.isArray(next.events) ? next.events : (previous?.events ?? []),
    channels: Array.isArray(next.channels)
      ? next.channels
      : (previous?.channels ?? ['inapp', 'email', 'push', 'sms', 'whatsapp']),
    phone_verified:
      typeof next.phone_verified === 'boolean'
        ? next.phone_verified
        : (previous?.phone_verified ?? false),
  };
}

/** Une cellule que l'utilisateur ne peut pas changer et qui n'est pas « toujours active ». */
function verrouAvecRaison(cell: NotificationPreferenceCell): boolean {
  return cell.locked && cell.reason !== RAISON_TOUJOURS_ACTIVE;
}

export function NotificationPreferencesMatrix() {
  const t = useTranslations('profile.notifications');
  const tCommon = useTranslations('common.status');
  const locale = useLocale();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const toast = useToast();
  const auBureau = useMatchesMedia(REQUETE_MATRICE);
  const [localError, setLocalError] = useState<string | null>(null);
  const [replies, setReplies] = useState<ReadonlySet<string>>(() => new Set());

  // Repli sur le jeton brut pour un événement que le back émettrait sans que le front ne le connaisse.
  const labelEvenement = (event: string) =>
    (EVENEMENTS_DE_PREFERENCE as readonly string[]).includes(event) ? t(`events.${event}`) : event;

  const query = useQuery<NotificationPreferencesResponse, Error>({
    queryKey: PREFS_KEY,
    queryFn: async () => {
      const res = await getNotificationPreferencesAction();
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (entry: {
      event_type: string;
      channel: NotificationChannel;
      enabled: boolean;
    }) => {
      const res = await updateNotificationPreferencesAction([entry]);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: PREFS_KEY });
      const previous =
        queryClient.getQueryData<NotificationPreferencesResponse>(PREFS_KEY);
      if (previous) {
        queryClient.setQueryData<NotificationPreferencesResponse>(PREFS_KEY, {
          ...previous,
          preferences: previous.preferences.map((c) =>
            c.event_type === entry.event_type &&
            c.channel === entry.channel &&
            !c.locked
              ? { ...c, enabled: entry.enabled }
              : c,
          ),
        });
      }
      return { previous };
    },
    onError: (err, _entry, context) => {
      setLocalError(messageErreur(err));
      if (context?.previous) {
        queryClient.setQueryData(PREFS_KEY, context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<NotificationPreferencesResponse>(
        PREFS_KEY,
        (previous) => normalizePreferencesResponse(data, previous),
      );
      setLocalError(null);
      // « Enregistré » à CHAQUE changement : un toast par enregistrement, annoncé par sa région
      // vivante. Le `<p role="status">` d'avant gardait le même texte d'un enregistrement à
      // l'autre — un lecteur d'écran ne l'annonçait qu'une fois.
      toast.add({ title: t('saved'), type: 'success' });
    },
  });

  const data = query.data
    ? normalizePreferencesResponse(query.data)
    : undefined;

  const cellMap = useMemo(() => {
    const map = new Map<string, NotificationPreferenceCell>();
    if (data) {
      for (const cell of data.preferences) {
        map.set(cellKey(cell.event_type, cell.channel), cell);
      }
    }
    return map;
  }, [data]);

  function toggle(cell: NotificationPreferenceCell) {
    // Une case verrouillée n'envoie rien ; un clic pendant l'enregistrement précédent non plus
    // (sans désactiver toutes les cases, ce qui les faisait clignoter à chaque enregistrement).
    if (cell.locked || mutation.isPending) return;
    setLocalError(null);
    mutation.mutate({ event_type: cell.event_type, channel: cell.channel, enabled: !cell.enabled });
  }

  if (query.isError && !data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageErreur(query.error)}
      </p>
    );
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>;
  }

  const channels = data.channels;
  // Un canal que l'API ajoute avant le dictionnaire (`whatsapp`, relevé le 2026-09-16) faisait
  // lever `MISSING_MESSAGE` et renvoyait TOUTE la page vers la frontière d'erreur du tableau de
  // bord. Le libellé retombe sur la valeur brute plutôt que de casser l'écran.
  const channelLabel = (channel: string): string => {
    const key = `channels.${channel}`;
    return t.has(key) ? t(key) : channel;
  };
  const liste = (canaux: readonly string[]) =>
    new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(canaux.map(channelLabel));
  const raisonLongue = (reason: string | undefined): string | undefined =>
    reason === RAISON_TOUJOURS_ACTIVE
      ? t('reasons.inappAlwaysOn')
      : reason === 'phone_not_verified'
        ? t('reasons.phoneNotVerified')
        : reason === RAISON_INDISPONIBLE
          ? t('reasons.channelUnavailable')
          : reason === 'phone_without_whatsapp'
            ? t('reasons.phoneWithoutWhatsapp')
            : undefined;
  const nomDeLaCase = (cell: NotificationPreferenceCell) => {
    const nom = t('toggleAria', { event: labelEvenement(cell.event_type), channel: channelLabel(cell.channel) });
    const raison = cell.locked ? raisonLongue(cell.reason) : undefined;
    return raison ? `${nom} (${raison})` : nom;
  };
  const pushToujoursIndisponible = (evenements: readonly string[]) =>
    channels.includes(CANAL_PUSH) &&
    evenements.every((e) => {
      const cell = cellMap.get(cellKey(e, CANAL_PUSH));
      return !cell || cell.reason === RAISON_INDISPONIBLE;
    });
  const displayError = localError ?? (query.error ? messageErreur(query.error) : null);

  return (
    <div className="space-y-6">
      {displayError ? (
        <p role="alert" className="text-sm text-destructive">
          {displayError}
        </p>
      ) : null}

      {!data.phone_verified ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {t('smsDisabled')}{' '}
          <Link href="/app/profile" className="font-semibold underline">
            {t('verifyPhone')}
          </Link>
        </p>
      ) : null}

      {auBureau ? (
        <Matrice
          channels={channels}
          cellMap={cellMap}
          channelLabel={channelLabel}
          labelEvenement={labelEvenement}
          nomDeLaCase={nomDeLaCase}
          raisonLongue={raisonLongue}
          onToggle={toggle}
          pushIndisponible={pushToujoursIndisponible(EVENEMENTS_DE_PREFERENCE)}
        />
      ) : (
        <div className="divide-y divide-border">
          {GROUPES_DE_PREFERENCES.map((groupe) => (
            <GroupeEnRangees
              key={groupe.cle}
              groupe={groupe}
              ouvert={!replies.has(groupe.cle)}
              onBasculer={() =>
                setReplies((avant) => {
                  const apres = new Set(avant);
                  if (apres.has(groupe.cle)) apres.delete(groupe.cle);
                  else apres.add(groupe.cle);
                  return apres;
                })
              }
              channels={channels}
              cellMap={cellMap}
              channelLabel={channelLabel}
              liste={liste}
              labelEvenement={labelEvenement}
              nomDeLaCase={nomDeLaCase}
              onToggle={toggle}
              pushIndisponible={pushToujoursIndisponible(groupe.evenements)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RenduCommunProps {
  readonly channels: readonly NotificationChannel[];
  readonly cellMap: ReadonlyMap<string, NotificationPreferenceCell>;
  readonly channelLabel: (channel: string) => string;
  readonly labelEvenement: (event: string) => string;
  readonly nomDeLaCase: (cell: NotificationPreferenceCell) => string;
  readonly onToggle: (cell: NotificationPreferenceCell) => void;
  /** La notification mobile n'a pas de transport : elle se dit en une ligne, pas en puces mortes. */
  readonly pushIndisponible: boolean;
}

interface GroupeEnRangeesProps extends RenduCommunProps {
  readonly groupe: Groupe;
  readonly ouvert: boolean;
  readonly onBasculer: () => void;
  readonly liste: (canaux: readonly string[]) => string;
}

/** Téléphone et tablette : le groupe, repliable, puis une rangée par événement. */
function GroupeEnRangees({
  groupe,
  ouvert,
  onBasculer,
  channels,
  cellMap,
  channelLabel,
  liste,
  labelEvenement,
  nomDeLaCase,
  onToggle,
  pushIndisponible,
}: GroupeEnRangeesProps) {
  const t = useTranslations('profile.notifications');
  const idListe = `prefs-${groupe.cle}`;
  const evenements: readonly string[] = groupe.evenements;

  // Les canaux qu'aucun envoi n'honore pour un événement (TCK-588) : pas de puce, une ligne.
  const absents = channels.filter(
    (c) =>
      !(c === CANAL_PUSH && pushIndisponible) &&
      evenements.some((e) => cellMap.get(cellKey(e, c))?.reason === RAISON_INDISPONIBLE),
  );
  const absentsPartout = absents.filter((c) =>
    evenements.every((e) => cellMap.get(cellKey(e, c))?.reason === RAISON_INDISPONIBLE),
  );
  const absentsParfois = absents.filter((c) => !absentsPartout.includes(c));
  const actifs = [...channels]
    .reverse()
    .filter((c) => evenements.some((e) => cellMap.get(cellKey(e, c))?.enabled));

  return (
    <section>
      <h2>
        <button
          type="button"
          aria-expanded={ouvert}
          aria-controls={idListe}
          onClick={onBasculer}
          className="flex min-h-14 w-full items-center gap-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-corps font-semibold text-foreground">{t(`groups.${groupe.cle}`)}</span>
            {ouvert ? null : (
              <span className="block truncate text-ui text-muted-foreground">
                {t('resume', { nombre: evenements.length, canaux: actifs.map(channelLabel).join(', ') })}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn('size-5 flex-none stroke-2 text-muted-foreground transition-transform', ouvert && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </h2>
      {ouvert ? (
        <ul id={idListe} className="pb-2">
          {evenements.map((event) => {
            const cellules = channels
              .map((c) => cellMap.get(cellKey(event, c)))
              .filter((c): c is NotificationPreferenceCell => c !== undefined && c.reason !== RAISON_INDISPONIBLE);
            const parRaison = new Map<string, string[]>();
            for (const c of cellules) {
              if (!verrouAvecRaison(c)) continue;
              const raison = c.reason ?? 'autre';
              parRaison.set(raison, [...(parRaison.get(raison) ?? []), c.channel]);
            }
            return (
              <li key={event} className="border-t border-border/60 py-3" data-evenement={event}>
                <p className="text-corps text-foreground">{labelEvenement(event)}</p>
                {cellules.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cellules.map((cell) => (
                      <PuceDeCanal
                        key={cell.channel}
                        cell={cell}
                        nom={channelLabel(cell.channel)}
                        nomAccessible={nomDeLaCase(cell)}
                        onToggle={onToggle}
                      />
                    ))}
                  </div>
                ) : null}
                {[...parRaison].map(([raison, canaux]) => (
                  <p key={raison} className="mt-1.5 text-xs text-muted-foreground">
                    {raison === 'phone_not_verified'
                      ? t('verrous.phoneNotVerified', { canaux: liste(canaux) })
                      : raison === 'phone_without_whatsapp'
                        ? t('verrous.phoneWithoutWhatsapp', { canaux: liste(canaux) })
                        : t('verrous.autre', { canaux: liste(canaux) })}
                  </p>
                ))}
              </li>
            );
          })}
          {pushIndisponible ? <NoteVerrou>{t('pushIndisponible')}</NoteVerrou> : null}
          {absentsPartout.length > 0 ? (
            <NoteVerrou>{t('canauxAbsents.tous', { canaux: liste(absentsPartout) })}</NoteVerrou>
          ) : null}
          {absentsParfois.length > 0 ? (
            <NoteVerrou>{t('canauxAbsents.autres', { canaux: liste(absentsParfois) })}</NoteVerrou>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

function NoteVerrou({ children }: { readonly children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
      <Lock className="size-3.5 flex-none stroke-2" aria-hidden="true" />
      {children}
    </li>
  );
}

interface PuceDeCanalProps {
  readonly cell: NotificationPreferenceCell;
  readonly nom: string;
  readonly nomAccessible: string;
  readonly onToggle: (cell: NotificationPreferenceCell) => void;
}

/**
 * La puce d'un canal (maquette `PuceCanal`) : 32 px de rendu, 44 px de cible par le pseudo-élément
 * (même mécanique que `PuceDeFiltre`). Cochée : aplat `secondary`, encre `primary-deep`, coche.
 * Verrouillée : grisée, cadenas, et elle n'envoie rien. « Appli », toujours active, reste cochée.
 */
function PuceDeCanal({ cell, nom, nomAccessible, onToggle }: PuceDeCanalProps) {
  const verrou = verrouAvecRaison(cell);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={cell.enabled}
      aria-label={nomAccessible}
      disabled={cell.locked}
      data-canal={cell.channel}
      onClick={() => onToggle(cell)}
      className={cn(
        'relative inline-flex h-8 flex-none items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-ui font-medium outline-none select-none',
        'transition-[color,background-color,border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring',
        'before:absolute before:inset-x-0 before:top-1/2 before:h-controle before:-translate-y-1/2',
        cell.enabled ? 'border-primary/40 bg-secondary text-primary-deep' : 'border-border bg-card text-encre-douce',
        verrou && 'opacity-70',
        cell.locked && 'cursor-not-allowed',
      )}
    >
      {verrou ? (
        <Lock className="size-3 stroke-2" aria-hidden="true" />
      ) : cell.enabled ? (
        <Check className="size-3.5 stroke-2" aria-hidden="true" />
      ) : null}
      {nom}
    </button>
  );
}

interface MatriceProps extends RenduCommunProps {
  readonly raisonLongue: (reason: string | undefined) => string | undefined;
}

/**
 * Bureau : la matrice, une carte par groupe sous une rangée d'en-têtes commune (maquette
 * `MatricePrefs`). Chaque groupe est une table pour l'assistance — sa légende, ses en-têtes (lus,
 * non affichés : la rangée visible est commune). Sous 1280, le cadre défile, il ne rogne pas.
 */
function Matrice({
  channels,
  cellMap,
  channelLabel,
  labelEvenement,
  nomDeLaCase,
  raisonLongue,
  onToggle,
  pushIndisponible,
}: MatriceProps) {
  const t = useTranslations('profile.notifications');
  // Une colonne de 76 px par canal (sur l'échelle : la densité du bureau s'y applique), l'événement
  // prend le reste. Le nombre de canaux vient de l'API.
  const colonnes = { gridTemplateColumns: `minmax(0,1fr) repeat(${channels.length}, calc(var(--spacing) * 19))` };
  const rangee = 'grid items-center';

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-140 gap-4">
        <div
          aria-hidden="true"
          className={cn(rangee, '-mb-1 px-4 py-2 text-xs font-medium text-muted-foreground')}
          style={colonnes}
        >
          <span>{t('eventColumn')}</span>
          {channels.map((c) => (
            <span key={c} className="text-center">
              {channelLabel(c)}
            </span>
          ))}
        </div>
        {GROUPES_DE_PREFERENCES.map((groupe) => (
          <section key={groupe.cle} className="overflow-hidden rounded-xl border border-border bg-card">
            <h2 className="border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground">
              {t(`groups.${groupe.cle}`)}
            </h2>
            <div role="table" aria-label={t(`groups.${groupe.cle}`)}>
              <div role="rowgroup" className="sr-only">
                <div role="row">
                  <span role="columnheader">{t('eventColumn')}</span>
                  {channels.map((c) => (
                    <span key={c} role="columnheader">
                      {channelLabel(c)}
                    </span>
                  ))}
                </div>
              </div>
              <div role="rowgroup">
                {groupe.evenements.map((event) => (
                  <div
                    key={event}
                    role="row"
                    className={cn(rangee, 'min-h-12 border-b border-border/60 px-4 py-1 last:border-b-0')}
                    style={colonnes}
                  >
                    <span role="rowheader" className="min-w-0 text-sm text-foreground">
                      {labelEvenement(event)}
                    </span>
                    {channels.map((channel) => {
                      const cell = cellMap.get(cellKey(event, channel));
                      return (
                        <span key={channel} role="cell" className="flex justify-center">
                          {cell ? (
                            <CaseDeLaMatrice
                              cell={cell}
                              nomAccessible={nomDeLaCase(cell)}
                              raison={cell.locked ? raisonLongue(cell.reason) : undefined}
                              onToggle={onToggle}
                            />
                          ) : (
                            <span aria-hidden="true" className="text-muted-foreground">
                              —
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5 flex-none stroke-2" aria-hidden="true" />
          {pushIndisponible ? `${t('pushIndisponible')} ` : null}
          {t('enregistrementImmediat')}
        </p>
      </div>
    </div>
  );
}

interface CaseDeLaMatriceProps {
  readonly cell: NotificationPreferenceCell;
  readonly nomAccessible: string;
  readonly raison: string | undefined;
  readonly onToggle: (cell: NotificationPreferenceCell) => void;
}

/**
 * La case : `Checkbox` du produit (18 px) dans une cible de 40 px. Verrouillée, la maquette la
 * dessine en aplat — cadenas sur `muted`, ou coche sur `primary/35` si elle est active ; « Appli »,
 * toujours active, reste une case cochée. La raison est l'infobulle et la fin du nom accessible.
 */
function CaseDeLaMatrice({ cell, nomAccessible, raison, onToggle }: CaseDeLaMatriceProps) {
  const cible = 'inline-flex size-10 items-center justify-center rounded-md';
  if (verrouAvecRaison(cell)) {
    return (
      <span className={cn(cible, 'cursor-not-allowed')} title={raison}>
        <span
          role="checkbox"
          aria-checked={cell.enabled}
          aria-disabled="true"
          aria-label={nomAccessible}
          data-canal={cell.channel}
          className={cn(
            'inline-flex size-icone items-center justify-center rounded-case',
            cell.enabled ? 'bg-primary/35 text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {cell.enabled ? <Check className="size-3.5 stroke-2" aria-hidden="true" /> : <Lock className="size-3 stroke-2" aria-hidden="true" />}
        </span>
      </span>
    );
  }
  return (
    <label className={cn(cible, cell.locked ? 'cursor-default' : 'cursor-pointer hover:bg-muted')} title={raison}>
      <Checkbox
        checked={cell.enabled}
        // « Appli » : cochée, figée, sans le voile des cases désactivées (elle est active).
        readOnly={cell.locked}
        aria-readonly={cell.locked || undefined}
        aria-label={nomAccessible}
        data-canal={cell.channel}
        onCheckedChange={() => onToggle(cell)}
      />
    </label>
  );
}
