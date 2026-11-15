'use client';

import { useId, useState, type ReactNode } from 'react';
import { Camera, Clock, CloudUpload, Ellipsis, ImagePlus, Info, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console/StatusBadge';
import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import {
  INVENTORY_CONDITIONS,
  type Inventory,
  type InventoryElement,
  type InventoryElementState,
  type InventoryRoom,
  type InventoryRoomPhoto,
} from '@/types/inventory';

import { CLE_D_ETAT, Pastilles } from './Pastilles';
import { curseurALApparition, degrade, estAbime, ETAT_MANQUANT, ETAT_USE, montant, retenueProposable } from './parcours';
import type { PhotoEnAttente } from './useFileDePhotos';

const ACCEPTE_IMAGE = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/** Les photos d'une pièce, jointes : celles de la pièce, puis celles d'un élément nommé. */
function photosDe(inventory: Inventory, piece: string): readonly InventoryRoomPhoto[] {
  return inventory.room_photos?.find((g) => g.room_name === piece)?.photos ?? [];
}

const TON: Record<InventoryElementState, 'success' | 'attention' | 'danger'> = {
  bon: 'success',
  usé: 'attention',
  endommagé: 'danger',
  manquant: 'danger',
};

export interface EcranDUnePieceProps {
  readonly inventory: Inventory;
  readonly room: InventoryRoom;
  readonly index: number;
  readonly total: number;
  readonly onChange: (room: InventoryRoom) => void;
  readonly onRetirerLaPiece?: () => void;
  readonly onAjouterUnePiece: (nom: string) => void;
  readonly attente: readonly PhotoEnAttente[];
  readonly onPhotos: (fichiers: readonly File[], element?: string) => void;
  readonly onReessayer: () => void;
  readonly bureau: boolean;
  /** Sortie : l'entrée reprise (sa date, le compte de ses photos), quand elle est lue. */
  readonly entree?: Inventory | null;
  /** Bureau : ce qui se pose à droite du titre de la pièce (les retenues proposées d'une sortie). */
  readonly aDroite?: ReactNode;
}

/**
 * TCK-2647 — l'écran « Une pièce » (maquette a-1) et sa variante de SORTIE (a-3) : « Prendre une
 * photo » d'abord (l'appareil arrière, `capture="environment"`), les vignettes de 64 px, chaque
 * élément sur une ligne avec ses pastilles, « Abîmé » qui ouvre « Précisez » et une photo dédiée,
 * « + Ajouter un élément », « Note de la pièce ». Au bureau (`bureau`), la pièce en tableau.
 *
 * Rien de l'ancien formulaire ne se perd (audit famille 4, § 4) : le nom libre d'un élément, ses
 * notes, son retrait et « Manquant » vivent dans la feuille de l'élément (toucher son nom) ; le nom de
 * la pièce, son état, son retrait et l'ajout d'une pièce dans celle de la pièce.
 */
export function EcranDUnePiece(props: EcranDUnePieceProps) {
  const { inventory, room, onChange, bureau } = props;
  const t = useTranslations('inventory.terrain.piece');
  const [elementOuvert, setElementOuvert] = useState<number | null>(null);
  const [nouveau, setNouveau] = useState<string | null>(null);
  const sortie = inventory.type === 'move_out';
  const elements = room.elements ?? [];
  const dateCourte = useDateCourte();

  const changerElement = (i: number, patch: Partial<InventoryElement>) =>
    onChange({ ...room, elements: elements.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  const ajouterElement = () => {
    const label = (nouveau ?? '').trim();
    if (label) onChange({ ...room, elements: [...elements, { label, state: null, notes: null }] });
    setNouveau(null);
  };

  const ajout =
    nouveau === null ? (
      <button
        type="button"
        onClick={() => setNouveau('')}
        className={cn(
          'flex w-full items-center font-medium text-primary outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring',
          bureau ? 'gap-2 px-4 py-3 text-sm' : 'h-14 gap-2.5 px-4 text-corps',
        )}
      >
        <Plus className={bureau ? 'size-4' : 'size-5'} aria-hidden />
        {t('ajouterElement')}
      </button>
    ) : (
      <div className="flex gap-2 px-4 py-2.5">
        <Input
          ref={curseurALApparition}
          aria-label={t('nomElement')}
          placeholder={t('nomElement')}
          value={nouveau}
          maxLength={255}
          onChange={(e) => setNouveau(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              ajouterElement();
            }
            if (e.key === 'Escape') setNouveau(null);
          }}
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={ajouterElement}>
          {t('ajouter')}
        </Button>
      </div>
    );

  const feuilles = (
    <>
      {elementOuvert !== null && elements[elementOuvert] ? (
        <FeuilleDeLElement
          element={elements[elementOuvert]}
          onFermer={() => setElementOuvert(null)}
          onChange={(patch) => changerElement(elementOuvert, patch)}
          onRetirer={() => {
            onChange({ ...room, elements: elements.filter((_, j) => j !== elementOuvert) });
            setElementOuvert(null);
          }}
        />
      ) : null}
    </>
  );

  const note = (
    <div className={bureau ? undefined : 'px-4 py-5'}>
      <label htmlFor={`note-${props.index}`} className="mb-1.5 block text-sm font-medium text-foreground">
        {t('note')} <span className="font-normal text-muted-foreground">{t('facultatif')}</span>
      </label>
      <Textarea
        id={`note-${props.index}`}
        value={room.notes ?? ''}
        maxLength={1000}
        onChange={(e) => onChange({ ...room, notes: e.target.value || null })}
        placeholder={t('notePlaceholder')}
        className={bureau ? 'min-h-11' : 'min-h-18'}
      />
    </div>
  );

  if (bureau) {
    return (
      <div className="space-y-5" data-slot="une-piece" data-piece={room.name}>
        <EnTeteDeLaPieceAuBureau {...props} />
        {/* Sortie au bureau (maquette a-3) : le tableau d'abord, les photos sont celles des éléments ;
            le dépôt de photos de la pièce reste, sous le tableau. */}
        {sortie ? null : <PhotosAuBureau {...props} />}
        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full border-collapse">
            <caption className="sr-only">{t('elements')}</caption>
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <Th className="pl-4">{t('colElement')}</Th>
                {sortie ? <Th className="w-50">{t('colEntree', { date: dateCourte(props.entree?.conducted_at) })}</Th> : null}
                <Th className={sortie ? 'w-82.5' : 'w-57.5'}>{sortie ? t('colSortie', { date: dateCourte(inventory.conducted_at) }) : t('colEtat')}</Th>
                <Th>{t('colPrecision')}</Th>
                {sortie ? <Th className="w-35 pr-4 text-right">{t('colRetenue')}</Th> : <Th className="w-17.5 pr-4">{t('colPhoto')}</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {elements.map((e, i) => (
                <RangeeDElement key={`${e.label}-${i}`} {...props} element={e} i={i} onElement={(patch) => changerElement(i, patch)} onOuvrir={() => setElementOuvert(i)} />
              ))}
            </tbody>
          </table>
          <div className="border-t border-border">{ajout}</div>
        </section>
        {sortie ? <NoteDUsure className="max-w-205" /> : null}
        {sortie ? <PhotosAuBureau {...props} /> : null}
        {note}
        {feuilles}
      </div>
    );
  }

  return (
    <div data-slot="une-piece" data-piece={room.name}>
      <PhotosAuTelephone {...props} />
      <TitreDeBloc action={<FeuilleDeLaPiece {...props} />}>
        {sortie ? t('elementsSortie', { date: dateCourte(props.entree?.conducted_at) }) : t('elements')}
      </TitreDeBloc>
      <ul className="divide-y divide-border border-y border-border bg-card">
        {elements.map((e, i) => (
          <li key={`${e.label}-${i}`}>
            <LigneDElement {...props} element={e} i={i} onElement={(patch) => changerElement(i, patch)} onOuvrir={() => setElementOuvert(i)} />
          </li>
        ))}
        <li>{ajout}</li>
      </ul>
      {sortie ? <NoteDUsure className="px-4 py-4" /> : null}
      {note}
      {feuilles}
    </div>
  );
}

/** « 10 nov. 2026 » : la date d'un état des lieux (l'entrée reprise, ou cette sortie), ou rien. */
function useDateCourte(): (iso: string | null | undefined) => string {
  const f = useFormatteurs();
  return (iso) => (iso ? f.date(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
}

function Th({ children, className }: { readonly children?: ReactNode; readonly className?: string }) {
  return <th className={cn('h-10 whitespace-nowrap px-3 text-left text-xs font-medium text-muted-foreground', className)}>{children}</th>;
}

function Td({ children, className }: { readonly children?: ReactNode; readonly className?: string }) {
  return <td className={cn('h-14 px-3 align-middle text-sm', className)}>{children}</td>;
}

function TitreDeBloc({ children, action }: { readonly children: ReactNode; readonly action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-2 pt-5">
      <h2 className="min-w-0 flex-1 text-ui font-semibold text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

function NoteDUsure({ className }: { readonly className?: string }) {
  const t = useTranslations('inventory.terrain.sortie');
  return (
    <p className={cn('flex gap-2.5 text-ui leading-relaxed text-muted-foreground', className)}>
      <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden />
      {t('usure')}
    </p>
  );
}

/** Une vignette de 64 px : jointe, ou en attente du réseau (l'icône de nuage). */
function Vignette({ src, enAttente, alt, className }: { readonly src: string; readonly enAttente?: boolean; readonly alt: string; readonly className?: string }) {
  return (
    <span className={cn('relative block size-16 flex-none overflow-hidden rounded-lg bg-muted', className)}>
      {/* URL signée de l'API, ou un aperçu local (`blob:`) : ni `next/image` ni son optimiseur n'y ont accès. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={cn('size-full object-cover', enAttente && 'opacity-60')} />
      {enAttente ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-card">
            <CloudUpload className="size-4" strokeWidth={1.75} aria-hidden />
          </span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Une entrée de fichier image : `capture="environment"` ouvre l'appareil arrière (comme la
 * maintenance) ; sans lui, la galerie, en sélection multiple.
 */
function EntreePhoto({
  id,
  appareil,
  multiple,
  onFichiers,
}: {
  readonly id: string;
  readonly appareil?: boolean;
  readonly multiple?: boolean;
  readonly onFichiers: (f: readonly File[]) => void;
}) {
  return (
    <input
      id={id}
      type="file"
      accept={ACCEPTE_IMAGE}
      {...(appareil ? { capture: 'environment' as const } : {})}
      multiple={multiple}
      className="sr-only"
      tabIndex={-1}
      data-slot={appareil ? 'entree-appareil' : 'entree-galerie'}
      onChange={(e) => {
        const fichiers = Array.from(e.target.files ?? []);
        e.target.value = '';
        onFichiers(fichiers);
      }}
    />
  );
}

/** Le bouton visible qui ouvre une entrée de fichier : un `<button>` focalisable, l'entrée cachée. */
function BoutonDeFichier({ cible, className, children, label }: { readonly cible: string; readonly className?: string; readonly children: ReactNode; readonly label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => document.getElementById(cible)?.click()}
      className={cn('outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring', className)}
    >
      {children}
    </button>
  );
}

function PhotosAuTelephone({ inventory, room, attente, onPhotos, onReessayer, entree }: EcranDUnePieceProps) {
  const t = useTranslations('inventory.terrain.piece');
  const id = useId();
  const jointes = photosDe(inventory, room.name).filter((p) => !p.element_label);
  const enAttente = attente.filter((p) => !p.element);
  const enPanne = enAttente.some((p) => p.statut === 'attente');
  const sortie = inventory.type === 'move_out';
  return (
    <div className="px-4 pt-4">
      <EntreePhoto id={`${id}-appareil`} appareil onFichiers={(f) => onPhotos(f)} />
      <EntreePhoto id={`${id}-galerie`} multiple onFichiers={(f) => onPhotos(f)} />
      <BoutonDeFichier cible={`${id}-appareil`} className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-foreground text-base font-semibold text-background hover:bg-foreground/90">
        <Camera className="size-5.5" strokeWidth={1.75} aria-hidden />
        {t('prendrePhoto')}
      </BoutonDeFichier>
      <div className="mt-3 flex items-center gap-2 overflow-x-auto">
        {jointes.map((p, i) => (
          <Vignette key={p.id} src={p.preview_url ?? p.url} alt={t('photoAlt', { index: i + 1, piece: room.name })} />
        ))}
        {enAttente.map((p) => (
          <Vignette key={`a${p.id}`} src={p.apercu} enAttente alt={t('photoEnAttente')} />
        ))}
        <BoutonDeFichier
          cible={`${id}-galerie`}
          label={t('ajouterPhotos')}
          className="inline-flex size-16 flex-none items-center justify-center rounded-lg border border-dashed border-controle-vide text-encre-douce hover:bg-muted/50"
        >
          <ImagePlus className="size-5" strokeWidth={1.75} aria-hidden />
        </BoutonDeFichier>
        {sortie ? (
          <p className="pl-1 text-ui leading-snug text-muted-foreground">
            {t('photosDeSortie', { n: jointes.length + enAttente.length })}
            <br />
            {t('photosDEntree', { n: entree ? photosDe(entree, room.name).length : 0 })}
          </p>
        ) : null}
      </div>
      {sortie ? null : (
        <p className="mt-2 flex items-center gap-1.5 text-ui text-muted-foreground" aria-live="polite">
          <Clock className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden />
          {t('photosEtat', { envoyees: jointes.length, attente: enAttente.length })}
          {enPanne ? (
            <button type="button" onClick={onReessayer} className="ml-1 font-medium text-primary underline-offset-2 hover:underline">
              {t('reessayerPhotos')}
            </button>
          ) : null}
        </p>
      )}
    </div>
  );
}

function PhotosAuBureau({ inventory, room, attente, onPhotos, onReessayer }: EcranDUnePieceProps) {
  const t = useTranslations('inventory.terrain.piece');
  const id = useId();
  const [survol, setSurvol] = useState(false);
  const jointes = photosDe(inventory, room.name).filter((p) => !p.element_label);
  const enAttente = attente.filter((p) => !p.element);
  return (
    <div className="grid grid-cols-5 gap-3">
      {jointes.map((p, i) => (
        <span key={p.id} className="block aspect-4/3 overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.preview_url ?? p.url} alt={t('photoAlt', { index: i + 1, piece: room.name })} className="size-full object-cover" />
        </span>
      ))}
      {enAttente.map((p) => (
        <span key={`a${p.id}`} className="relative block aspect-4/3 overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.apercu} alt={t('photoEnAttente')} className="size-full object-cover opacity-60" />
          {p.statut === 'attente' ? (
            <button type="button" onClick={onReessayer} className="absolute inset-x-2 bottom-2 rounded-md bg-card px-2 py-1 text-xs font-medium text-primary">
              {t('reessayerPhotos')}
            </button>
          ) : null}
        </span>
      ))}
      <EntreePhoto id={`${id}-galerie`} multiple onFichiers={(f) => onPhotos(f)} />
      {/* Le dépôt de fichiers (souris) sur la zone ; le bouton reste la voie du clavier et du doigt. */}
      <div
        className="col-span-2"
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          onPhotos(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/')));
        }}
      >
        <BoutonDeFichier
          cible={`${id}-galerie`}
          className={cn(
            'flex aspect-8/3 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-encre-douce hover:bg-muted/40',
            survol ? 'border-primary bg-secondary/40' : 'border-controle-vide',
          )}
        >
          <ImagePlus className="size-5" strokeWidth={1.75} aria-hidden />
          {t('deposer')}
          <span className="text-xs text-muted-foreground">{t('deposerAide')}</span>
        </BoutonDeFichier>
      </div>
    </div>
  );
}

function EnTeteDeLaPieceAuBureau({ inventory, room, index, total, onChange, onRetirerLaPiece, onAjouterUnePiece, aDroite }: EcranDUnePieceProps) {
  const t = useTranslations('inventory.terrain.piece');
  const sortie = inventory.type === 'move_out';
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-display text-xl font-semibold tracking-titre text-foreground">{t('rangEtNom', { rang: index + 1, piece: room.name })}</h2>
      {sortie ? (
        <span className="text-sm tabular-nums text-muted-foreground">{t('rang', { rang: index + 1, total })}</span>
      ) : (
        <StatusBadge tone="primary" label={t('enCours')} />
      )}
      <span className="ml-auto flex items-center gap-4">
        {aDroite}
        <FeuilleDeLaPiece inventory={inventory} room={room} index={index} total={total} onChange={onChange} onRetirerLaPiece={onRetirerLaPiece} onAjouterUnePiece={onAjouterUnePiece} />
      </span>
    </div>
  );
}

interface LigneProps extends EcranDUnePieceProps {
  readonly element: InventoryElement;
  readonly i: number;
  readonly onElement: (patch: Partial<InventoryElement>) => void;
  readonly onOuvrir: () => void;
}

/** La photo d'un élément : jointe (vignette), en attente, ou la tuile qui ouvre l'appareil. */
function PhotoDeLElement({ inventory, room, attente, onPhotos, element, taille }: LigneProps & { readonly taille: 'size-9' | 'size-12' }) {
  const t = useTranslations('inventory.terrain.piece');
  const id = useId();
  const jointe = photosDe(inventory, room.name).find((p) => p.element_label === element.label);
  const enAttente = attente.find((p) => p.element === element.label);
  if (jointe || enAttente) {
    return (
      <span className={cn('relative block flex-none overflow-hidden rounded-lg bg-muted', taille)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={jointe ? (jointe.preview_url ?? jointe.url) : enAttente?.apercu}
          alt={t('photoElement', { element: element.label })}
          className={cn('size-full object-cover', !jointe && 'opacity-60')}
        />
      </span>
    );
  }
  return (
    <>
      <EntreePhoto id={`${id}-element`} appareil onFichiers={(f) => onPhotos(f.slice(0, 1), element.label)} />
      <BoutonDeFichier
        cible={`${id}-element`}
        label={t('photoElement', { element: element.label })}
        className={cn('inline-flex flex-none items-center justify-center rounded-lg border border-dashed border-controle-vide text-encre-douce hover:bg-muted/50', taille)}
      >
        <Camera className={taille === 'size-9' ? 'size-4.5' : 'size-5'} strokeWidth={1.75} aria-hidden />
      </BoutonDeFichier>
    </>
  );
}

/** Sortie : « Retenue sur la caution 35 000 F ✕ », ou « Ajouter une retenue » puis le montant. */
function Retenue({ element, onElement, bureau }: LigneProps) {
  const t = useTranslations('inventory.terrain.sortie');
  const f = useFormatteurs();
  const [saisie, setSaisie] = useState<string | null>(null);
  const valeur = montant(element.retention_amount);
  if (saisie !== null) {
    const valider = () => {
      const n = Number(saisie.replace(/\s/g, ''));
      if (Number.isFinite(n) && n > 0) onElement({ retention_amount: Math.round(n) });
      setSaisie(null);
    };
    return (
      <div className={cn('flex gap-2', bureau ? 'justify-end' : undefined)}>
        <Input
          ref={curseurALApparition}
          inputMode="numeric"
          aria-label={t('montant', { element: element.label })}
          placeholder={t('montantPlaceholder')}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value.replace(/[^\d\s]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              valider();
            }
            if (e.key === 'Escape') setSaisie(null);
          }}
          className={cn('tabular-nums', bureau ? 'w-28' : 'flex-1')}
        />
        <Button type="button" variant="outline" onClick={valider}>
          {t('valider')}
        </Button>
      </div>
    );
  }
  if (valeur !== null && valeur > 0) {
    return bureau ? (
      <span className="inline-flex items-center gap-1">
        <span className="font-semibold tabular-nums">{f.montantCourt(valeur)}</span>
        <button type="button" aria-label={t('retirer', { element: element.label })} onClick={() => onElement({ retention_amount: null })} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
          <X className="size-3.5" aria-hidden />
        </button>
      </span>
    ) : (
      <div className="flex h-12 items-center gap-3 rounded-lg border border-border bg-card px-3">
        <span className="flex-1 text-sm font-medium">{t('retenue')}</span>
        <button type="button" onClick={() => setSaisie(String(valeur))} className="text-base font-semibold tabular-nums">
          {f.montantCourt(valeur)}
        </button>
        <button type="button" aria-label={t('retirer', { element: element.label })} onClick={() => onElement({ retention_amount: null })} className="-mr-1.5 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setSaisie('')}
      className={cn('font-medium text-primary hover:underline', bureau ? 'text-ui' : 'flex h-12 w-full items-center rounded-lg border border-dashed border-controle-vide px-3 text-sm')}
    >
      {t('ajouterRetenue')}
    </button>
  );
}

/** « Précisez » sous un élément abîmé ou manquant : la note de l'élément, qui figure dans les réserves. */
function Precision({ element, onElement, bureau }: LigneProps) {
  const t = useTranslations('inventory.terrain.piece');
  const id = useId();
  return (
    <div className="min-w-0 flex-1">
      <Input
        id={id}
        aria-label={t('precisezPour', { element: element.label })}
        aria-describedby={bureau ? undefined : `${id}-aide`}
        placeholder={t('precisez')}
        value={element.notes ?? ''}
        maxLength={200}
        onChange={(e) => onElement({ notes: e.target.value || null })}
        className={bureau ? 'h-9' : 'min-h-12 rounded-lg border-2 border-destructive/50 text-corps'}
      />
      {bureau ? null : (
        <p id={`${id}-aide`} className="mt-1 text-xs text-muted-foreground">
          {t('precisezAide')}
        </p>
      )}
    </div>
  );
}

/** Le nom de l'élément, qui ouvre sa feuille (nom libre, manquant, note, retrait). */
function NomDeLElement({ element, onOuvrir, className }: { readonly element: InventoryElement; readonly onOuvrir: () => void; readonly className?: string }) {
  const t = useTranslations('inventory.terrain.piece');
  return (
    <button
      type="button"
      onClick={onOuvrir}
      aria-label={t('modifierElement', { element: element.label })}
      className={cn('min-w-0 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring rounded-sm', className)}
    >
      {element.label}
    </button>
  );
}

function LigneDElement(props: LigneProps) {
  const { element, onElement, onOuvrir, inventory } = props;
  const t = useTranslations('inventory.terrain');
  const sortie = inventory.type === 'move_out';
  const abime = estAbime(element.state);
  const estDegrade = sortie && degrade(element);
  return (
    <div className={cn(sortie ? 'px-4 py-3' : 'px-4 py-2.5', estDegrade && element.state !== ETAT_USE && 'bg-destructive/6')} data-slot="ligne-d-element">
      {sortie ? (
        <div className="flex items-center gap-3">
          <span className="block size-11 flex-none overflow-hidden rounded-lg bg-muted">
            {element.entry_thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={element.entry_thumbnail_url} alt={t('sortie.photoEntree', { element: element.label })} className="size-full object-cover" />
            ) : null}
          </span>
          <div className="min-w-0 flex-1 leading-snug">
            <NomDeLElement element={element} onOuvrir={onOuvrir} className="block truncate text-corps font-semibold" />
            {element.entry_state ? (
              <p className="text-ui text-muted-foreground">
                {t.rich('sortie.entree', { etat: t(`etats.${CLE_D_ETAT[element.entry_state]}`), b: (c) => <span className="font-medium text-encre-douce">{c}</span> })}
              </p>
            ) : null}
          </div>
          {estDegrade && element.state !== ETAT_USE ? <StatusBadge tone="danger" label={t('sortie.degrade')} /> : null}
          {element.state === ETAT_MANQUANT ? <StatusBadge tone="danger" label={t('etats.manquant')} /> : null}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 leading-tight">
            <NomDeLElement element={element} onOuvrir={onOuvrir} className="text-corps font-medium" />
            {element.state === ETAT_MANQUANT ? <StatusBadge tone="danger" label={t('etats.manquant')} className="mt-1" /> : null}
          </div>
          <Pastilles valeur={element.state} onChange={(s) => onElement({ state: s })} element={element.label} className="w-53.5" />
        </div>
      )}
      {sortie ? <Pastilles valeur={element.state} onChange={(s) => onElement({ state: s })} element={element.label} className="mt-2.5" /> : null}
      {abime ? (
        <div className="mt-2.5 space-y-2.5">
          <div className="flex gap-2.5">
            <Precision {...props} />
            <PhotoDeLElement {...props} taille="size-12" />
          </div>
          {sortie && retenueProposable(element) ? <Retenue {...props} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function RangeeDElement(props: LigneProps) {
  const { element, onElement, onOuvrir, inventory } = props;
  const t = useTranslations('inventory.terrain');
  const sortie = inventory.type === 'move_out';
  const abime = estAbime(element.state);
  const estDegrade = sortie && degrade(element) && element.state !== ETAT_USE;
  const h = sortie ? 'h-18' : undefined;
  return (
    <tr className={estDegrade ? 'bg-destructive/5' : undefined} data-slot="ligne-d-element">
      <Td className={cn('pl-4 font-medium', h)}>
        <NomDeLElement element={element} onOuvrir={onOuvrir} />
        {element.state === ETAT_MANQUANT ? <StatusBadge tone="danger" label={t('etats.manquant')} className="ml-2" /> : null}
      </Td>
      {sortie ? (
        <Td className={h}>
          <span className="flex items-center gap-2.5">
            <span className="block size-12 flex-none overflow-hidden rounded-lg bg-muted">
              {element.entry_thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={element.entry_thumbnail_url} alt={t('sortie.photoEntree', { element: element.label })} className="size-full object-cover" />
              ) : null}
            </span>
            {element.entry_state ? <StatusBadge tone={TON[element.entry_state]} label={t(`etats.${CLE_D_ETAT[element.entry_state]}`)} /> : null}
          </span>
        </Td>
      ) : null}
      <Td className={h}>
        <span className="flex items-center gap-2.5">
          {sortie ? <PhotoDeLElement {...props} taille="size-12" /> : null}
          <Pastilles valeur={element.state} onChange={(s) => onElement({ state: s })} element={element.label} compact />
        </span>
      </Td>
      <Td className={cn('text-encre-douce', h)}>{abime ? <Precision {...props} /> : <span className="text-muted-foreground">—</span>}</Td>
      {sortie ? (
        <Td className={cn('pr-4 text-right', h)}>{retenueProposable(element) ? <Retenue {...props} /> : <span className="text-muted-foreground">—</span>}</Td>
      ) : (
        <Td className="pr-4">{abime ? <PhotoDeLElement {...props} taille="size-9" /> : <Camera className="size-4.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />}</Td>
      )}
    </tr>
  );
}

/** La feuille d'un élément : son nom libre, « Manquant », sa note, et son retrait. */
function FeuilleDeLElement({
  element,
  onFermer,
  onChange,
  onRetirer,
}: {
  readonly element: InventoryElement;
  readonly onFermer: () => void;
  readonly onChange: (patch: Partial<InventoryElement>) => void;
  readonly onRetirer: () => void;
}) {
  const t = useTranslations('inventory.terrain.feuilleElement');
  const id = useId();
  return (
    <FeuilleDuBas open onOpenChange={(o) => (o ? undefined : onFermer())} titre={element.label}>
      <div className="space-y-4 pb-2">
        <div>
          <label htmlFor={`${id}-nom`} className="mb-1.5 block text-sm font-medium">
            {t('nom')}
          </label>
          <Input id={`${id}-nom`} value={element.label} maxLength={255} onChange={(e) => onChange({ label: e.target.value })} />
        </div>
        <label className="flex min-h-12 items-center gap-3 text-corps">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={element.state === ETAT_MANQUANT}
            onChange={(e) => onChange({ state: e.target.checked ? ETAT_MANQUANT : null })}
          />
          {t('manquant')}
        </label>
        <div>
          <label htmlFor={`${id}-note`} className="mb-1.5 block text-sm font-medium">
            {t('note')}
          </label>
          <Textarea id={`${id}-note`} value={element.notes ?? ''} maxLength={200} onChange={(e) => onChange({ notes: e.target.value || null })} className="min-h-18" />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-12 flex-1 text-destructive" onClick={onRetirer}>
            {t('retirer')}
          </Button>
          <Button type="button" className="h-12 flex-1" onClick={onFermer}>
            {t('fermer')}
          </Button>
        </div>
      </div>
    </FeuilleDuBas>
  );
}

/** La feuille de la pièce : son nom, son état, son retrait, et l'ajout d'une pièce. */
function FeuilleDeLaPiece({ room, onChange, onRetirerLaPiece, onAjouterUnePiece }: Pick<EcranDUnePieceProps, 'room' | 'onChange' | 'onRetirerLaPiece' | 'onAjouterUnePiece'> & Partial<EcranDUnePieceProps>) {
  const t = useTranslations('inventory.terrain.feuillePiece');
  const tConditions = useTranslations('inventory.conditions');
  const id = useId();
  const [ouverte, setOuverte] = useState(false);
  const [nouvelle, setNouvelle] = useState('');
  return (
    <FeuilleDuBas
      open={ouverte}
      onOpenChange={setOuverte}
      titre={room.name}
      declencheur={
        // « ⋯ » nommé « Modifier la pièce » : la maquette n'a rien sur cette ligne, et un libellé y
        // repoussait sur deux lignes le titre de la sortie (« Les éléments — entrée du … rappelée »).
        <button
          type="button"
          aria-label={t('modifier')}
          title={t('modifier')}
          className="-my-2 -mr-2 inline-flex size-9 flex-none items-center justify-center rounded-full text-encre-douce outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Ellipsis className="size-5" aria-hidden />
        </button>
      }
    >
      <div className="space-y-4 pb-2">
        <div>
          <label htmlFor={`${id}-nom`} className="mb-1.5 block text-sm font-medium">
            {t('nom')}
          </label>
          <Input id={`${id}-nom`} value={room.name} maxLength={255} onChange={(e) => onChange({ ...room, name: e.target.value })} />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t('etat')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {INVENTORY_CONDITIONS.map((c) => (
              <label key={c} className={cn('flex h-12 items-center gap-2.5 rounded-lg border px-3 text-sm font-medium', room.condition === c ? 'border-primary bg-secondary/70' : 'border-border')}>
                <input type="radio" name={`${id}-etat`} className="accent-primary" checked={room.condition === c} onChange={() => onChange({ ...room, condition: c })} />
                {tConditions(c)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex gap-2">
          <Input aria-label={t('nouvelle')} placeholder={t('nouvelle')} value={nouvelle} maxLength={255} onChange={(e) => setNouvelle(e.target.value)} className="flex-1" />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (nouvelle.trim()) onAjouterUnePiece(nouvelle.trim());
              setNouvelle('');
            }}
          >
            {t('ajouter')}
          </Button>
        </div>
        {onRetirerLaPiece ? (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-destructive"
            onClick={() => {
              onRetirerLaPiece();
              setOuverte(false);
            }}
          >
            {t('retirer')}
          </Button>
        ) : null}
      </div>
    </FeuilleDuBas>
  );
}
