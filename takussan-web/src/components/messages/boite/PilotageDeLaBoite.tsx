'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { AlarmClock, Check, CheckCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { initiales } from '@/lib/fiche-publique';
import { useConversationContext, useGestesDeLaBoite } from '@/lib/queries/conversations';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/message';
import { choixDeRappel } from './pilotage';
import type { PilotageDeLaListe } from './RangeeDeLaBoite';

/** Le toast de « Traité » reste ce temps, le temps d'« Annuler ». */
export const DUREE_DU_TOAST_MS = 6_000;

type Cible = { readonly conversation: Conversation; readonly titre: string };

/**
 * TCK-2968 (ADR-0128 § 7) — les gestes de la boîte, tenus par la PAGE de la messagerie : « Traité » suivi
 * d'un toast avec « Annuler », « Rappelez-le-moi » (choix courts, en feuille au téléphone), « Ramener », et
 * « Confier » à un collègue (salle ou groupe, personnel seulement).
 *
 * Le toast est dessiné ici (maquette D3) plutôt que par `useToast` : la liste est aussi montée par le
 * widget flottant, hors des coques qui portent un `ToastProvider` — la page seule monte ces gestes.
 *
 * `actif` faux (impersonation : lecture seule) : aucun geste n'est rendu à la liste.
 */
export function usePilotageDeLaBoite({ actif }: { readonly actif: boolean }) {
  const { traiter, annulerTraite, rappeler, ramener, confier } = useGestesDeLaBoite();
  const messageErreur = useMessageErreurApi();
  const t = useTranslations('messaging.boite');
  const [toast, setToast] = useState<Cible | null>(null);
  const [rappel, setRappel] = useState<Cible | null>(null);
  const [aConfier, setAConfier] = useState<Conversation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const minuterie = setTimeout(() => setToast(null), DUREE_DU_TOAST_MS);
    return () => clearTimeout(minuterie);
  }, [toast]);

  const echec = (e: unknown) => setErreur(messageErreur(e, t('gestes.echec')));

  const pilotage: PilotageDeLaListe | undefined = actif
    ? {
        onTraite: (conversation, titre) => {
          setErreur(null);
          traiter.mutate({ id: conversation.id }, { onSuccess: () => setToast({ conversation, titre }), onError: echec });
        },
        onRappel: (conversation, titre) => {
          setErreur(null);
          setRappel({ conversation, titre });
        },
        onRamener: (conversation) => {
          setErreur(null);
          ramener.mutate({ id: conversation.id }, { onError: echec });
        },
        onConfier: (conversation) => {
          setErreur(null);
          setAConfier(conversation);
        },
      }
    : undefined;

  const rendu = actif ? (
    <>
      {toast ? (
        <ToastTraite
          titre={toast.titre}
          onAnnuler={() => {
            const id = toast.conversation.id;
            setToast(null);
            annulerTraite.mutate({ id }, { onError: echec });
          }}
        />
      ) : null}
      {erreur ? (
        <p role="alert" className="fixed inset-x-3 bottom-[calc(var(--barre-onglets-hauteur,0px)+0.75rem)] z-30 mx-auto max-w-lg rounded-xl bg-card px-4 py-3 text-sm text-destructive shadow-feuille lg:bottom-6">
          {erreur}
        </p>
      ) : null}
      <FeuilleRappel
        cible={rappel}
        onFermer={() => setRappel(null)}
        onChoisir={(jusqua) => {
          const cible = rappel;
          setRappel(null);
          if (cible) rappeler.mutate({ id: cible.conversation.id, until: jusqua.toISOString() }, { onError: echec });
        }}
      />
      <DialogueConfier
        conversation={aConfier}
        onFermer={() => setAConfier(null)}
        onChoisir={(userId) => {
          const cible = aConfier;
          setAConfier(null);
          if (cible) confier.mutate({ id: cible.id, userId }, { onError: echec });
        }}
      />
    </>
  ) : null;

  return { pilotage, rendu };
}

/** Le toast sombre de « Traité » (maquette D3) : le fil quitte « À vous » ; « Annuler » le rétablit. */
export function ToastTraite({ titre, onAnnuler }: { readonly titre: string; readonly onAnnuler: () => void }) {
  const t = useTranslations('messaging.boite.toast');
  return (
    <div
      role="status"
      data-testid="toast-traite"
      className="dark fixed inset-x-3 bottom-[calc(var(--barre-onglets-hauteur,0px)+0.75rem)] z-30 mx-auto flex max-w-[calc(var(--spacing)*130)] items-center gap-3 rounded-xl bg-background px-4 py-3 text-sm text-foreground shadow-feuille lg:bottom-6"
    >
      <CheckCheck className="size-5 flex-none" aria-hidden />
      <span className="min-w-0 flex-1 leading-snug">
        {t('traite', { titre })}
        <span className="block text-xs text-encre-douce">{t('traiteAide')}</span>
      </span>
      <button
        type="button"
        onClick={onAnnuler}
        className="relative flex-none rounded-sm font-semibold outline-none after:absolute after:-inset-x-2 after:-inset-y-3 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('annuler')}
      </button>
    </div>
  );
}

/** « Rappelez-le-moi » : les choix courts, calculés à l'ouverture (heure de Dakar). */
function FeuilleRappel({
  cible,
  onFermer,
  onChoisir,
}: {
  readonly cible: Cible | null;
  readonly onFermer: () => void;
  readonly onChoisir: (jusqua: Date) => void;
}) {
  const t = useTranslations('messaging.boite.rappel');
  const format = useFormatter();
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [ouvertPour, setOuvertPour] = useState<number | null>(null);
  // L'horloge est relevée à chaque ouverture (patron « valeur précédente »), pas une fois pour la page.
  if (cible && ouvertPour !== cible.conversation.id) {
    setOuvertPour(cible.conversation.id);
    setMaintenant(new Date());
  } else if (!cible && ouvertPour !== null) {
    setOuvertPour(null);
  }
  const choix = choixDeRappel(maintenant);
  return (
    <FeuilleDuBas open={cible !== null} onOpenChange={(o) => (o ? undefined : onFermer())} titre={t('titre', { titre: cible?.titre ?? '' })} bureau="dialogue">
      <ul className="divide-y divide-border/70" data-testid="choix-de-rappel">
        {choix.map((c) => (
          <li key={c.cle}>
            <button
              type="button"
              onClick={() => onChoisir(c.jusqua)}
              className="flex h-12 w-full items-center gap-3 text-left text-corps outline-none hover:bg-muted/50 focus-visible:bg-muted/50 lg:h-10"
            >
              <AlarmClock className="size-4 flex-none text-muted-foreground stroke-[1.75]" aria-hidden />
              <span className="min-w-0 flex-1">{t(`choix.${c.cle}`)}</span>
              <span className="flex-none text-ui tabular-nums text-muted-foreground">
                {format.dateTime(c.jusqua, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar' })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-lg bg-muted/60 p-2.5 text-sm text-encre-douce">{t('regle')}</p>
    </FeuilleDuBas>
  );
}

/**
 * « Confier ce fil » : les participants que l'API dit lecteurs des notes (`team_note_reader_ids` du contexte :
 * le personnel actif de l'agence du fil, avec ou sans ligne de relation), et « Personne ». L'API refuse tout autre choix (422 `messaging.assignee_*`).
 */
function DialogueConfier({
  conversation,
  onFermer,
  onChoisir,
}: {
  readonly conversation: Conversation | null;
  readonly onFermer: () => void;
  readonly onChoisir: (userId: number | null) => void;
}) {
  const t = useTranslations('messaging.boite.confier');
  const { user } = useAuth();
  const { data } = useConversationContext(conversation?.id ?? null, { enabled: conversation !== null });
  const agents = new Set(data?.data?.team_note_reader_ids ?? []);
  const personnel = (conversation?.participants ?? []).filter((p) => !p.left_at && agents.has(p.user_id) && p.user?.full_name);
  const actuel = conversation?.assigned_to?.id ?? null;
  const ligne = 'flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-corps outline-none hover:bg-muted/50 focus-visible:bg-muted/50';
  return (
    <FeuilleDuBas open={conversation !== null} onOpenChange={(o) => (o ? undefined : onFermer())} titre={t('titre')} bureau="dialogue">
      <p className="mb-2 text-sm text-muted-foreground">{t('aide')}</p>
      {personnel.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">{t('aucun')}</p>
      ) : (
        <ul data-testid="choix-du-collegue">
          {personnel.map((p) => (
            <li key={p.user_id}>
              <button type="button" onClick={() => onChoisir(p.user_id)} aria-pressed={actuel === p.user_id} className={cn(ligne, actuel === p.user_id && 'bg-foreground/6')}>
                <Avatar size="36">
                  {p.user?.avatar_url ? <AvatarImage src={p.user.avatar_url} alt="" /> : null}
                  <AvatarFallback>{initiales(p.user!.full_name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.user_id === user?.id ? t('vous', { nom: p.user!.full_name }) : p.user!.full_name}
                </span>
                {actuel === p.user_id ? <Check className="size-4 flex-none text-primary" aria-hidden /> : null}
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => onChoisir(null)} aria-pressed={actuel === null} className={cn(ligne, actuel === null && 'bg-foreground/6')}>
              <span className="min-w-0 flex-1 text-muted-foreground">{t('personne')}</span>
              {actuel === null ? <Check className="size-4 flex-none text-primary" aria-hidden /> : null}
            </button>
          </li>
        </ul>
      )}
    </FeuilleDuBas>
  );
}
