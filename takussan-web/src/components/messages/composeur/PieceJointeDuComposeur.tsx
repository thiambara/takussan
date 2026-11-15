'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Camera, FileText, Image as IconeImage, Loader2, Paperclip, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ACCEPTE_IMAGE,
  ACCEPTE_PDF,
  natureDeLaPiece,
  preparerImage,
  refusApresReduction,
  refusAvantReduction,
  tailleLisible,
  type NatureDePiece,
  type RefusDePiece,
} from '@/lib/messages/piece-jointe';

/** La pièce prête à partir avec le prochain envoi, et son aperçu local. */
export interface PieceEnAttente {
  readonly fichier: File;
  readonly nature: NatureDePiece;
  /** `URL.createObjectURL` de l'image, révoquée quand la pièce change. `null` pour un PDF. */
  readonly apercu: string | null;
}

const CLE_DU_REFUS: Record<RefusDePiece, 'type' | 'imageTropLourde' | 'pdfTropLourd'> = {
  type: 'type',
  'image-trop-lourde': 'imageTropLourde',
  'pdf-trop-lourd': 'pdfTropLourd',
};

/**
 * TCK-2632 — l'état de la pièce du composeur : le choix, le refus AVANT l'envoi (type, 10 Mo pour
 * un PDF, 8 Mo pour une image APRÈS réduction), la réduction d'une image de plus de 20 Mpx, et
 * l'aperçu local.
 */
export function usePieceEnAttente() {
  const t = useTranslations('messaging.composer');
  const [piece, setPiece] = useState<PieceEnAttente | null>(null);
  const [preparation, setPreparation] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const tour = useRef(0);

  useEffect(() => {
    const url = piece?.apercu;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [piece?.apercu]);

  async function choisir(brut: File) {
    const moi = ++tour.current;
    setRefus(null);
    const avant = refusAvantReduction(brut);
    if (avant) {
      setPiece(null);
      setRefus(t(`refus.${CLE_DU_REFUS[avant]}`));
      return;
    }
    const nature = natureDeLaPiece(brut)!;
    let fichier = brut;
    if (nature === 'image') {
      setPreparation(true);
      try {
        fichier = await preparerImage(brut);
      } finally {
        if (moi === tour.current) setPreparation(false);
      }
      if (moi !== tour.current) return;
      const apres = refusApresReduction(fichier);
      if (apres) {
        setPiece(null);
        setRefus(t(`refus.${CLE_DU_REFUS[apres]}`));
        return;
      }
    }
    setPiece({ fichier, nature, apercu: nature === 'image' ? URL.createObjectURL(fichier) : null });
  }

  function retirer() {
    tour.current++;
    setPiece(null);
    setPreparation(false);
    setRefus(null);
  }

  return { piece, preparation, refus, setRefus, choisir, retirer };
}

interface BoutonDePieceJointeProps {
  readonly onChoisir: (fichier: File) => void;
  readonly desactive?: boolean;
  /** Au téléphone, « Prendre une photo » ouvre l'appareil (`capture`). */
  readonly appareilPhoto: boolean;
}

/**
 * « 📎 » (maquette `app-messagerie`, `Composeur`) : photo, appareil photo au téléphone, PDF. Chaque
 * entrée ouvre un sélecteur de fichiers qui n'accepte QUE ce que l'API reçoit : le refus de type
 * reste pour un fichier glissé ou un navigateur qui ignore `accept`.
 */
export function BoutonDePieceJointe({ onChoisir, desactive, appareilPhoto }: BoutonDePieceJointeProps) {
  const t = useTranslations('messaging.composer');
  const photo = useRef<HTMLInputElement>(null);
  const appareil = useRef<HTMLInputElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const recevoir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onChoisir(f);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={desactive}
          aria-label={t('joindre')}
          data-testid="joindre-une-piece"
          className="-ml-2 inline-flex size-11 flex-none items-center justify-center rounded-full text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
        >
          <Paperclip className="size-5 stroke-[1.75]" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => photo.current?.click()}>
            <IconeImage className="size-4 text-muted-foreground stroke-[1.75]" aria-hidden="true" />
            {t('photo')}
          </DropdownMenuItem>
          {appareilPhoto ? (
            <DropdownMenuItem onClick={() => appareil.current?.click()}>
              <Camera className="size-4 text-muted-foreground stroke-[1.75]" aria-hidden="true" />
              {t('appareilPhoto')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => pdf.current?.click()}>
            <FileText className="size-4 text-muted-foreground stroke-[1.75]" aria-hidden="true" />
            {t('pdf')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={photo} type="file" accept={ACCEPTE_IMAGE} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={recevoir} data-testid="champ-photo" />
      <input ref={appareil} type="file" accept={ACCEPTE_IMAGE} capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={recevoir} />
      <input ref={pdf} type="file" accept={ACCEPTE_PDF} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={recevoir} data-testid="champ-pdf" />
    </>
  );
}

interface ApercuDeLaPieceProps {
  readonly piece: PieceEnAttente | null;
  readonly preparation: boolean;
  readonly onRetirer: () => void;
}

/** La pièce choisie, au-dessus du champ : la vignette d'une photo, la carte d'un PDF, et « Retirer ». */
export function ApercuDeLaPiece({ piece, preparation, onRetirer }: ApercuDeLaPieceProps) {
  const t = useTranslations('messaging.composer');
  const locale = useLocale();
  if (!piece && !preparation) return null;
  return (
    <div data-slot="piece-en-attente" className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-background p-2">
      {preparation ? (
        <p role="status" className="flex items-center gap-2 text-ui text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t('preparation')}
        </p>
      ) : piece ? (
        <>
          {piece.apercu ? (
            // eslint-disable-next-line @next/next/no-img-element -- un aperçu local (`blob:`), que `next/image` ne sert pas.
            <img src={piece.apercu} alt="" className="size-14 flex-none rounded-lg object-cover outline -outline-offset-1 outline-foreground/10" />
          ) : (
            <span className="inline-flex size-14 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileText className="size-6 stroke-[1.75]" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-ui font-medium text-foreground">{piece.fichier.name}</span>
            <span className="block text-xs tabular-nums text-muted-foreground">
              {piece.nature === 'image' ? t('photo') : t('pdf')} · {tailleLisible(piece.fichier.size, locale)}
            </span>
          </span>
          <button
            type="button"
            onClick={onRetirer}
            aria-label={t('retirer', { nom: piece.fichier.name })}
            className="inline-flex size-11 flex-none items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring sm:size-9"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </>
      ) : null}
    </div>
  );
}
