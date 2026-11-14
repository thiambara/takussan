'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, CircleDashed, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { FilDAriane } from '@/components/console/PageHeader';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { BoutonFlecheDeRetour } from '@/components/navigation-publique/FlecheDeRetour';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { inventoryKeys, useContexteDuBail, useInventory, useUpdateInventory, type ContexteDuBail as Contexte } from '@/lib/queries/inventory';
import { cn } from '@/lib/utils';
import type { Inventory, InventoryRoom } from '@/types/inventory';

import { ContexteDuBail, ligneDuBail } from './ContexteDuBail';
import { EcranDUnePiece } from './EcranDUnePiece';
import { curseurALApparition, indexDeReprise, montant, nomDuLocataire, piecesPourLeServeur, qualifies, totalDesRetenues } from './parcours';
import { useFileDePhotos } from './useFileDePhotos';

/**
 * TCK-2647 — le parcours de terrain d'un brouillon d'état des lieux : une pièce par écran (maquette
 * `app-etats-des-lieux`, approche A, écrans a-1 et a-3).
 *
 *  · REPRISE : il s'ouvre sur la première pièce non terminée (`rooms.*.completed`), ou sur
 *    `?piece=N` quand on revient sur une pièce ;
 *  · « Pièce suivante » ENREGISTRE (`PATCH`, toutes les pièces) AVANT de changer d'écran : un échec
 *    garde la saisie à l'écran, dit « Réessayer », et n'avance pas ;
 *  · l'en-tête dit toujours le bien, le locataire et le bail (P1) — au téléphone, l'en-tête de la pièce
 *    (flèche « Pièce précédente », « 1 / 6 », la barre de progression), au bureau la liste des pièces ;
 *  · à la dernière pièce, « Terminer les pièces » mène au récapitulatif et aux signatures (TCK-2648).
 *
 * Au téléphone, la page déclare un état « conversation » à la coque : ni son en-tête ni la barre
 * d'onglets — l'en-tête de la pièce porte la flèche, comme celui d'un fil de la messagerie.
 */
export function ParcoursDeTerrain({ inventory, pieceDemandee }: { readonly inventory: Inventory; readonly pieceDemandee?: number | null }) {
  const contexte = useContexteDuBail(inventory.lease_id, { avecLocataire: false });
  const entree = useInventory(inventory.type === 'move_out' ? (inventory.entry_inventory_id ?? null) : null);
  const bail = contexte.data?.data ?? null;
  return <Parcours inventory={inventory} bail={bail} entree={entree.data?.data ?? null} pieceDemandee={pieceDemandee} />;
}

function Parcours({
  inventory,
  bail,
  entree,
  pieceDemandee,
}: {
  readonly inventory: Inventory;
  readonly bail: Contexte | null;
  readonly entree: Inventory | null;
  readonly pieceDemandee?: number | null;
}) {
  const t = useTranslations('inventory.terrain');
  const tContexte = useTranslations('inventory.terrain.contexte');
  const tConsole = useTranslations('console.pageHeader');
  const f = useFormatteurs();
  const router = useRouter();
  const queryClient = useQueryClient();
  const bureau = useMatchesMedia('(width >= 48rem)');
  const patch = useUpdateInventory(inventory.id);
  const messageErreur = useMessageErreurApi();

  const [rooms, setRooms] = useState<readonly InventoryRoom[]>(inventory.rooms);
  // Les pièces telles que le serveur les a : une photo ne s'envoie que pour une pièce (et un élément)
  // qu'il connaît déjà (`UploadRoomPhotosInventoryRequest`, `Rule::in`).
  const enregistrees = useRef(JSON.stringify(piecesPourLeServeur(inventory.rooms, inventory.type)));
  const [photosRestees, setPhotosRestees] = useState(0);
  const [courant, setCourant] = useState(() => {
    // Un entier dans [1, n] (q4 de la contre-vérification de 065941306 : `?piece=2.5` rendait un écran vide).
    const demande = pieceDemandee && Number.isInteger(pieceDemandee) && pieceDemandee >= 1 && pieceDemandee <= inventory.rooms.length ? pieceDemandee - 1 : null;
    return demande ?? Math.min(indexDeReprise(inventory.rooms), Math.max(inventory.rooms.length - 1, 0));
  });
  const [enregistreA, setEnregistreA] = useState<Date | null>(null);
  const [echec, setEchec] = useState(false);
  const [ajout, setAjout] = useState<string | null>(null);

  const room = rooms[courant];
  const sortie = inventory.type === 'move_out';
  const derniere = courant >= rooms.length - 1;
  const suivante = rooms[courant + 1];
  const titre = t(sortie ? 'titre.move_out' : 'titre.move_in');
  const titreDuBien = bail?.property?.title ?? '';
  const locataire = inventory.tenant?.full_name || (bail ? nomDuLocataire(bail.tenant) : '');
  const caution = montant(bail?.deposit_amount);
  const retenues = totalDesRetenues(rooms);

  const enregistrer = async (pieces: readonly InventoryRoom[]): Promise<boolean> => {
    setEchec(false);
    const corps = piecesPourLeServeur(pieces, inventory.type);
    try {
      await patch.mutateAsync({ rooms: corps });
      enregistrees.current = JSON.stringify(corps);
      setEnregistreA(new Date());
      return true;
    } catch {
      setEchec(true);
      return false;
    }
  };

  // Avant chaque passage de la file : la pièce ou l'élément ajoutés depuis le dernier `PATCH`
  // s'enregistrent d'abord, sans quoi l'API refuserait la photo (422).
  const photos = useFileDePhotos(inventory.id, () =>
    JSON.stringify(piecesPourLeServeur(rooms, inventory.type)) === enregistrees.current ? Promise.resolve(true) : enregistrer(rooms),
  );

  // La file vit en mémoire : un rechargement, la fermeture de l'onglet ou un retour hors du site la
  // perdraient sans le dire. Le navigateur demande confirmation tant qu'une photo n'est pas partie (q2 de
  // la contre-vérification de 065941306). La navigation DANS l'application n'est pas gardée ici :
  // « Terminer » et « Enregistrer et quitter » vident la file avant de partir.
  const photosEnFile = photos.file.length > 0;
  useEffect(() => {
    if (!photosEnFile) return;
    const retenir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', retenir);
    return () => window.removeEventListener('beforeunload', retenir);
  }, [photosEnFile]);

  /**
   * Avant de QUITTER le parcours : la file vit dans cet écran, partir la perdrait. Elle se vide d'abord ;
   * des photos qui attendent encore le réseau retiennent l'agent, et l'écran le dit.
   */
  const photosEnvoyees = async (): Promise<boolean> => {
    const restees = await photos.reessayer();
    setPhotosRestees(restees);
    return restees === 0;
  };

  const allerA = (i: number) => {
    setCourant(i);
    setEchec(false);
    document.getElementById(CONTENU_PRINCIPAL_ID)?.scrollTo({ top: 0 });
  };

  const pieceSuivante = async () => {
    const faites = rooms.map((r, i) => (i === courant ? { ...r, completed: true } : r));
    setRooms(faites);
    if (!(await enregistrer(faites))) return;
    if (derniere) {
      // Toutes les pièces parcourues : le récapitulatif et les signatures sur place (TCK-2648, et
      // `?piece=` tombe) — une fois les photos parties.
      if (!(await photosEnvoyees())) return;
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.detail(inventory.id) });
      router.replace(`/app/inventories/${inventory.id}?etape=signatures`);
      return;
    }
    allerA(courant + 1);
  };

  const quitter = async () => {
    if ((await enregistrer(rooms)) && (await photosEnvoyees())) router.push('/app/inventories');
  };

  const changer = (r: InventoryRoom) => setRooms((avant) => avant.map((x, i) => (i === courant ? r : x)));
  const ajouterUnePiece = (nom: string) => setRooms((avant) => (avant.some((r) => r.name === nom) ? avant : [...avant, { name: nom, condition: 'good', notes: null, completed: false, elements: [] }]));
  const retirerLaPiece =
    rooms.length > 1
      ? () => {
          setRooms((avant) => avant.filter((_, i) => i !== courant));
          setCourant((c) => Math.min(c, rooms.length - 2));
        }
      : undefined;

  if (!room) return null;

  const nbQualifies = qualifies(room);
  const nbElements = room.elements?.length ?? 0;
  const libelleSuivante = derniere ? t('piece.terminer') : t('piece.suivante', { piece: suivante?.name ?? '' });
  const action = echec ? t('piece.reessayer') : libelleSuivante;
  const contexteCourt = [titreDuBien, locataire].filter(Boolean).join(' · ');

  const ligneDesRetenues = (long: boolean) => (
    <>
      <span className={long ? 'text-primary-deep' : 'flex-1 text-muted-foreground'}>{t('sortie.retenues')} </span>
      <span className="font-semibold tabular-nums">{f.montantCourt(retenues)}</span>
      {caution !== null ? (
        <span className={cn('tabular-nums', long ? 'text-encre-douce' : 'text-muted-foreground')}>
          {' '}
          {t(long ? 'sortie.surCautionLong' : 'sortie.surCaution', { caution: f.montantCourt(caution) })}
        </span>
      ) : null}
    </>
  );

  const ecran = (
    <EcranDUnePiece
      key={courant}
      inventory={inventory}
      room={room}
      index={courant}
      total={rooms.length}
      onChange={changer}
      onRetirerLaPiece={retirerLaPiece}
      onAjouterUnePiece={ajouterUnePiece}
      attente={photos.file.filter((p) => p.piece === room.name)}
      onPhotos={(fichiers, element) => void photos.ajouter(fichiers, room.name, element)}
      onReessayer={() => void photos.reessayer()}
      bureau={bureau}
      entree={entree}
      aDroite={
        sortie ? (
          <p className="rounded-xl bg-secondary px-4 py-2.5 text-sm" aria-live="polite">
            {ligneDesRetenues(true)}
          </p>
        ) : null
      }
    />
  );

  const messages = [
    echec ? t('piece.echec') : null,
    photosRestees > 0 && photos.file.length > 0 ? t('piece.photosNonEnvoyees', { n: photos.file.length }) : null,
    photos.refus ? messageErreur(photos.refus, t('piece.photoRefusee')) : null,
  ].filter((m): m is string => m !== null);
  const alerte =
    messages.length > 0 ? (
      <div role="alert" className="space-y-1 text-sm text-destructive">
        {messages.map((m) => (
          <p key={m}>{m}</p>
        ))}
      </div>
    ) : null;

  if (bureau) {
    const faites = rooms.filter((r) => r.completed === true).length;
    return (
      <div data-slot="parcours-de-terrain">
        <DeclarerEnTete forme="detail" titre={titre} repli="/app/inventories" />
        <FilDAriane
          label={tConsole('breadcrumb')}
          etapes={[{ label: t('fil.liste'), href: '/app/inventories' }, ...(titreDuBien ? [{ label: titreDuBien }] : []), { label: t(sortie ? 'fil.sortie' : 'fil.entree') }]}
        />
        <div className="flex items-start gap-4 max-xl:flex-wrap">
          <div className="min-w-0 flex-1 max-xl:basis-72">
            <h1 className="font-display text-2xl font-semibold tracking-titre text-foreground">{titre}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[
                enregistreA ? t('piece.enregistreA', { heure: f.heure(enregistreA) }) : null,
                contexteCourt,
                sortie && bail ? ligneDuBail(tContexte, { ...bail, tenant: null }) : null,
                sortie && entree?.conducted_at ? t('sortie.compareA', { date: f.date(entree.conducted_at, { day: 'numeric', month: 'short', year: 'numeric' }) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex flex-none items-center gap-2 max-xl:flex-wrap">
            <Button type="button" variant="outline" disabled={patch.isPending} onClick={() => void quitter()}>
              {t('piece.quitter')}
            </Button>
            <Button type="button" disabled={patch.isPending} onClick={() => void pieceSuivante()}>
              {action}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        {alerte ? <div className="mt-3">{alerte}</div> : null}
        <div className={cn('mt-6 grid grid-cols-1 items-start gap-6', !sortie && 'xl:grid-cols-[calc(var(--spacing)*89)_1fr]')}>
          {sortie ? null : (
            <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label={t('liste.titre')}>
              <div className="border-b border-border p-4">
                {bail ? <ContexteDuBail bail={bail} type={inventory.type} quand={inventory.conducted_at} /> : null}
                <div className="mt-3 flex items-center gap-2 text-ui text-muted-foreground">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(((faites + 0.5) / rooms.length) * 100)}%` }} />
                  </span>
                  <span className="tabular-nums">{t('piece.rang', { rang: courant + 1, total: rooms.length })}</span>
                </div>
              </div>
              <ol>
                {rooms.map((r, i) => {
                  const enCours = i === courant;
                  const photosDeLaPiece = inventory.room_photos?.find((g) => g.room_name === r.name)?.photos.length ?? 0;
                  return (
                    <li key={`${r.name}-${i}`} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => allerA(i)}
                        aria-current={enCours ? 'step' : undefined}
                        className={cn(
                          'flex h-12 w-full items-center gap-3 px-4 text-left text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring',
                          enCours && 'bg-secondary/70 font-semibold',
                        )}
                      >
                        {r.completed ? (
                          <Check className="size-4 text-success" strokeWidth={2.25} aria-label={t('liste.faite')} />
                        ) : enCours ? (
                          <span className="inline-flex size-4 items-center justify-center" aria-hidden>
                            <span className="size-2.5 rounded-full bg-primary" />
                          </span>
                        ) : (
                          <CircleDashed className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                        )}
                        <span className="min-w-0 flex-1 truncate">{t('piece.rangEtNom', { rang: i + 1, piece: r.name })}</span>
                        <span className="text-xs font-normal tabular-nums text-muted-foreground">
                          {t('liste.detail', { elements: r.elements?.length ?? 0, photos: photosDeLaPiece })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {ajout === null ? (
                <button
                  type="button"
                  onClick={() => setAjout('')}
                  className="flex h-12 w-full items-center gap-3 border-t border-border px-4 text-sm font-medium text-primary outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <Plus className="size-4" aria-hidden />
                  {t('demarrer.autrePiece')}
                </button>
              ) : (
                <div className="flex gap-2 border-t border-border p-2">
                  <Input
                    ref={curseurALApparition}
                    aria-label={t('demarrer.nomDeLaPiece')}
                    placeholder={t('demarrer.nomDeLaPiece')}
                    value={ajout}
                    maxLength={255}
                    onChange={(e) => setAjout(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (ajout.trim()) ajouterUnePiece(ajout.trim());
                        setAjout(null);
                      }
                      if (e.key === 'Escape') setAjout(null);
                    }}
                    className="flex-1"
                  />
                </div>
              )}
            </section>
          )}
          {ecran}
        </div>
      </div>
    );
  }

  return (
    <PagePleineLargeur data-slot="parcours-de-terrain">
      <DeclarerEnTete forme="detail" titre={titre} conversation />
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background">
        <div className="flex h-14 items-center gap-1 px-1">
          {/* La flèche unique (TCK-2617) : la pièce précédente, ou « Enregistrer et quitter » à la première. */}
          <BoutonFlecheDeRetour
            libelle={courant > 0 ? t('piece.precedente') : t('piece.quitter')}
            onClick={() => (courant > 0 ? allerA(courant - 1) : void quitter())}
          />
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-titre-court font-semibold text-foreground">{room.name}</h1>
            <p className="truncate text-ui text-muted-foreground">
              {[sortie ? t('contexte.sortie') : null, contexteCourt].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="flex-none pr-4 text-corps font-semibold tabular-nums">
            {courant + 1} <span className="font-normal text-muted-foreground">/ {rooms.length}</span>
          </span>
        </div>
        <div className="flex gap-1 px-4 pb-2.5" aria-hidden>
          {rooms.map((r, i) => (
            <span key={i} className={cn('h-1.5 flex-1 rounded-full', r.completed && i !== courant ? 'bg-success' : i === courant ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
        <p className="sr-only">{bail ? ligneDuBail(tContexte, bail) : null}</p>
      </header>
      {ecran}
      <BarreDAction>
        <div>
          {alerte ? <div className="mb-2">{alerte}</div> : null}
          {sortie ? (
            <p className="mb-2.5 flex items-baseline gap-2 text-sm" aria-live="polite">
              {ligneDesRetenues(false)}
            </p>
          ) : (
            <p className="mb-2 flex items-center justify-center gap-1.5 text-ui text-muted-foreground" aria-live="polite">
              <Check className="size-3.5 text-success" strokeWidth={2.25} aria-hidden />
              {t('piece.qualifies', { n: nbQualifies, total: nbElements })}
              {enregistreA ? ` · ${t('piece.enregistreA', { heure: f.heure(enregistreA) })}` : null}
            </p>
          )}
          <Button type="button" size="xl" className="h-14 w-full gap-2 rounded-xl text-base font-semibold" disabled={patch.isPending} onClick={() => void pieceSuivante()}>
            {action}
            <ArrowRight className="size-5" aria-hidden />
          </Button>
        </div>
      </BarreDAction>
    </PagePleineLargeur>
  );
}
