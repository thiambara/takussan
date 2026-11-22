'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ApiError } from '@/lib/api';
import { reduirePhotosSousPlafond } from '@/lib/reduire-photo';
import { useUploadInventoryRoomPhotos } from '@/lib/queries/inventory';

import { INVENTORY_PHOTO_MAX_BYTES } from './parcours';

/** Une photo prise et pas encore jointe : en cours d'envoi, ou en attente du réseau. */
export interface PhotoEnAttente {
  readonly id: number;
  readonly fichier: File;
  readonly piece: string;
  readonly element?: string;
  readonly apercu: string;
  readonly statut: 'envoi' | 'attente';
}

/**
 * Une réponse 4xx est un REFUS (la photo, ou la pièce qu'elle vise, n'est pas acceptée) : la renvoyer
 * ne changera rien. 408 et 429 restent des attentes, comme une panne du réseau ; 401 aussi : la session
 * expirée pendant une longue coupure relève de l'interception d'authentification, la photo attend la
 * reconnexion au lieu de quitter la file (q3 de la contre-vérification de 065941306).
 */
function estUnRefus(e: unknown): boolean {
  return e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 408 && e.status !== 429;
}

/**
 * TCK-2647 (AC4) — la file des photos de l'état des lieux : chaque photo prise est réduite sous
 * 5 Mo, puis envoyée SEULE (`POST …/room-photos`, une par appel — TCK-2370 : un lot dépassait la
 * borne du proxy). Un échec n'arrête pas la file : la suivante part quand même, et la photo
 * refusée est réessayée une fois à la fin du passage ; si elle échoue encore, elle reste « en
 * attente du réseau », réessayée au retour du réseau (`online`) ou par « Réessayer ».
 *
 * `avantEnvoi` court avant CHAQUE photo, dans sa version du dernier rendu : l'API n'accepte une photo
 * que pour une pièce (et un élément) DÉJÀ enregistrés (`UploadRoomPhotosInventoryRequest`, `Rule::in`)
 * — une pièce ajoutée ou un élément nommé depuis le dernier `PATCH` s'enregistre d'abord. Le juger en
 * tête du passage seulement laissait partir sans `PATCH` la photo d'un élément ajouté PENDANT qu'une
 * autre était en vol : 422, et la photo quittait la file (contre-vérification de 065941306, r1). S'il
 * échoue, la photo n'est pas envoyée et la file attend le réseau.
 *
 * Un REFUS (4xx) n'attend pas le réseau : la photo quitte la file, et `refus` le dit.
 *
 * La file vit au niveau du parcours, pas de la pièce : passer à la pièce suivante pendant un envoi
 * n'en perd rien. Quitter le parcours, si : `vider()` rend le nombre de photos restées, que le
 * parcours lit avant de partir.
 */
export function useFileDePhotos(inventoryId: number, avantEnvoi?: () => Promise<boolean>) {
  const upload = useUploadInventoryRoomPhotos(inventoryId);
  const [file, setFile] = useState<readonly PhotoEnAttente[]>([]);
  const [refus, setRefus] = useState<unknown>(null);
  const fileRef = useRef<readonly PhotoEnAttente[]>([]);
  const passe = useRef<Promise<void> | null>(null);
  const prochainId = useRef(1);
  // La version du dernier rendu : un passage né avant l'ajout d'un élément juge les pièces d'aujourd'hui.
  const avantEnvoiRef = useRef(avantEnvoi);
  useLayoutEffect(() => {
    avantEnvoiRef.current = avantEnvoi;
  });

  const poser = (suivante: readonly PhotoEnAttente[]) => {
    fileRef.current = suivante;
    setFile(suivante);
  };

  const retirer = (p: PhotoEnAttente) => {
    URL.revokeObjectURL(p.apercu);
    poser(fileRef.current.filter((x) => x.id !== p.id));
  };

  /** `true` quand la photo a quitté la file (envoyée, ou refusée) ; `false` quand elle attend le réseau. */
  const envoyerUne = async (p: PhotoEnAttente): Promise<boolean> => {
    poser(fileRef.current.map((x) => (x.id === p.id ? { ...x, statut: 'envoi' } : x)));
    try {
      await upload.mutateAsync({ files: [p.fichier], roomName: p.piece, elementLabel: p.element });
      retirer(p);
      return true;
    } catch (e) {
      if (estUnRefus(e)) {
        setRefus(e);
        retirer(p);
        return true;
      }
      poser(fileRef.current.map((x) => (x.id === p.id ? { ...x, statut: 'attente' } : x)));
      return false;
    }
  };

  /** Les pièces enregistrées d'abord ; `false` : la file entière attend le réseau. */
  const piecesPretes = async (): Promise<boolean> => {
    const avant = avantEnvoiRef.current;
    if (!avant || (await avant())) return true;
    poser(fileRef.current.map((x) => ({ ...x, statut: 'attente' as const })));
    return false;
  };

  /** Un passage sur toute la file, puis un second sur les seules photos refusées au premier. */
  const passer = async () => {
    const refusees: PhotoEnAttente[] = [];
    for (let p = fileRef.current.find((x) => x.statut === 'envoi'); p; p = fileRef.current.find((x) => x.statut === 'envoi')) {
      if (!(await piecesPretes())) return;
      if (!(await envoyerUne(p))) refusees.push(p);
    }
    for (const p of refusees) {
      if (!fileRef.current.some((x) => x.id === p.id)) continue;
      if (!(await piecesPretes())) return;
      await envoyerUne(p);
    }
  };

  /**
   * Le passage en cours, ou un neuf, jusqu'à ce qu'aucune photo n'attende son tour : une photo prise
   * pendant la fin d'un passage (son second tour) n'y est plus ramassée, le passage suivant la prend.
   * Rend le nombre de photos restées dans la file (celles qui attendent le réseau).
   */
  const vider = async (): Promise<number> => {
    do {
      passe.current ??= passer().finally(() => {
        passe.current = null;
      });
      await passe.current;
    } while (fileRef.current.some((x) => x.statut === 'envoi'));
    return fileRef.current.length;
  };

  const ajouter = async (fichiers: readonly File[], piece: string, element?: string) => {
    if (fichiers.length === 0) return;
    setRefus(null);
    const reduites = await reduirePhotosSousPlafond(Array.from(fichiers), INVENTORY_PHOTO_MAX_BYTES);
    const neuves = reduites.map((fichier) => ({
      id: prochainId.current++,
      fichier,
      piece,
      element,
      apercu: URL.createObjectURL(fichier),
      statut: 'envoi' as const,
    }));
    poser([...fileRef.current, ...neuves]);
    await vider();
  };

  /** Remet en route les photos qui attendent le réseau ; rend le nombre de photos restées. */
  const reessayer = async (): Promise<number> => {
    if (fileRef.current.length === 0) return 0;
    poser(fileRef.current.map((x) => ({ ...x, statut: 'envoi' as const })));
    return vider();
  };

  useEffect(() => {
    const auRetour = () => {
      if (fileRef.current.some((x) => x.statut === 'attente')) void reessayer();
    };
    window.addEventListener('online', auRetour);
    return () => window.removeEventListener('online', auRetour);
  });

  return { file, refus, ajouter, reessayer };
}
