'use client';

import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Mic, Square, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { minutesSecondes } from './onde';
import { PastilleDeNoteVocale } from './PastilleDeNoteVocale';
import {
  VOICE_NOTE_MAX_SECONDS,
  useEnregistreurDeNoteVocale,
  type ModeDEnregistrement,
  type NoteVocale,
} from './useEnregistreurDeNoteVocale';

interface EnregistreurDeNoteVocaleProps {
  /**
   * `toucher` (défaut) : toucher le micro démarre, le toucher à nouveau arrête — le geste de la
   * messagerie. `appui` : « gardez le micro appuyé » (maquette `app-interventions`, écran
   * « Locataire — signaler ») — relâcher arrête ; au clavier, Espace ou Entrée tenus.
   */
  readonly mode?: ModeDEnregistrement;
  /** La note enregistrée, puis `null` quand l'utilisateur la supprime. Rien n'est envoyé ici. */
  readonly onChange: (note: NoteVocale | null) => void;
  /** Vrai de l'enregistrement jusqu'à la suppression de la note : l'écran peut s'effacer devant elle. */
  readonly onActif?: (actif: boolean) => void;
  readonly className?: string;
}

type NoteAffichee = NoteVocale & { readonly url: string };

/**
 * TCK-2901 (ADR-0113 § 1) — L'enregistreur de note vocale réutilisable : appuyer pour enregistrer,
 * réécouter (`PastilleDeNoteVocale`, « Message vocal · 0:18 »), supprimer. Il rend à son appelant un
 * fichier, son type MIME et sa durée (`onChange`) et n'appelle AUCUN endpoint : l'écran qui l'emploie
 * l'envoie avec son propre geste (la demande d'intervention, TCK-2902). Pour vider l'enregistreur
 * après un envoi, l'appelant le remonte (`key`).
 *
 * Rien n'est rendu sur un navigateur sans `MediaRecorder` : un bouton qui ne peut pas marcher est un
 * défaut. Un refus du micro s'affiche.
 */
export function EnregistreurDeNoteVocale({ mode = 'toucher', onChange, onActif, className }: EnregistreurDeNoteVocaleProps) {
  const t = useTranslations('common.noteVocale');
  const [note, setNote] = useState<NoteAffichee | null>(null);
  const enregistreur = useEnregistreurDeNoteVocale({
    mode,
    onDebut: () => onActif?.(true),
    onSansNote: () => onActif?.(false),
    onNote: (rendue) => {
      setNote({ ...rendue, url: URL.createObjectURL(rendue.blob) });
      onChange(rendue);
    },
  });
  const { supporte, enregistre, ecoule } = enregistreur;

  useEffect(() => () => {
    if (note) URL.revokeObjectURL(note.url);
  }, [note]);

  if (!supporte) return null;

  if (note) {
    return (
      <div className={cn('flex items-center gap-2', className)} data-testid="note-vocale-enregistree">
        <PastilleDeNoteVocale src={note.url} duree={note.duration} className="min-w-0" />
        <button
          type="button"
          onClick={() => {
            setNote(null);
            onChange(null);
            onActif?.(false);
          }}
          aria-label={t('supprimer')}
          className="inline-flex size-11 flex-none items-center justify-center rounded-full text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Trash2 className="size-5 stroke-[1.75]" aria-hidden="true" />
        </button>
      </div>
    );
  }

  /*
   * Mode `appui` : un seul bouton reçoit l'appui ET le relâchement — il reste le même élément pendant
   * l'enregistrement, et capture le pointeur pour qu'un doigt qui glisse hors du disque arrête quand
   * même. Pas de `onClick` : le clic qui suit le relâchement ne doit rien redémarrer.
   */
  const gestes =
    mode === 'appui'
      ? {
          onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
            // Seul le bouton principal (ou le doigt) enregistre.
            if (e.button > 0) return;
            e.preventDefault();
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              // Pas de capture possible : le relâchement sur le disque arrête quand même.
            }
            void enregistreur.demarrer();
          },
          onPointerUp: () => enregistreur.arreter(),
          onPointerCancel: () => enregistreur.arreter(),
          onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              void enregistreur.demarrer();
            }
          },
          onKeyUp: (e: KeyboardEvent<HTMLButtonElement>) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              enregistreur.arreter();
            }
          },
          // Un appui long ouvrirait le menu contextuel du téléphone.
          onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
        }
      : { onClick: () => (enregistre ? enregistreur.arreter() : void enregistreur.demarrer()) };

  const nom = enregistre ? (mode === 'appui' ? t('relacher') : t('arreter')) : mode === 'appui' ? t('maintenir') : t('enregistrer');

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <button
        type="button"
        {...gestes}
        aria-label={nom}
        aria-pressed={mode === 'appui' ? enregistre : undefined}
        className={cn(
          'inline-flex size-12 flex-none touch-none select-none items-center justify-center rounded-full border outline-none focus-visible:ring-3 focus-visible:ring-ring',
          enregistre
            ? 'border-bord-danger bg-destructive/10 text-destructive'
            : 'border-border bg-card text-foreground hover:bg-muted',
        )}
        data-testid="micro-note-vocale"
      >
        {enregistre && mode === 'toucher' ? (
          <Square className="size-4 fill-current" aria-hidden="true" />
        ) : (
          <Mic className="size-5" strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
      {enregistre ? (
        <span className="inline-flex items-center gap-2 text-sm text-encre-douce" data-testid="note-vocale-chrono">
          <span className="size-2.5 flex-none animate-pulse rounded-full bg-destructive motion-reduce:animate-none" aria-hidden="true" />
          <span className="tabular-nums">
            {minutesSecondes(ecoule)}
            <span className="text-muted-foreground"> / {minutesSecondes(VOICE_NOTE_MAX_SECONDS)}</span>
          </span>
          {mode === 'appui' ? <span className="text-muted-foreground">· {t('relacher')}</span> : null}
        </span>
      ) : null}
      {enregistreur.erreur === 'micro' ? (
        <p role="alert" className="w-full text-xs text-destructive">{t('micRefuse')}</p>
      ) : null}
    </div>
  );
}
