'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, FileDown } from 'lucide-react';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { useTranslations } from 'next-intl';

import { FilDAriane } from '@/components/console/PageHeader';
import { StatusBadge } from '@/components/console/StatusBadge';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { SheetClose } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useContexteDuBail, useSubmitInventory, useUpdateInventory, type ContexteDuBail as Contexte } from '@/lib/queries/inventory';
import { cn } from '@/lib/utils';
import type { Inventory, InventoryCondition, InventoryElementState, InventoryRoomPhoto } from '@/types/inventory';

import { ContexteDuBail, LigneDuType, ligneDuBail } from './ContexteDuBail';
import { CLE_D_ETAT } from './Pastilles';
import { ETAT_ENDOMMAGE, ETAT_MANQUANT, ETAT_USE, nomDuLocataire } from './parcours';
import { MentionFigee, SignatureDeLAgence, SignatureDuBailleurAttendue, SignatureDuLocataire, elide } from './SignaturesSurPlace';

/**
 * TCK-2648 — « Récapitulatif et signatures » : la fin du tour (maquette `app-etats-des-lieux`, approche
 * A, écran a-2). L'agent relit avec le locataire les comptes et les réserves, le fait signer sur son
 * téléphone (code SMS, ADR-0098), signe pour le bailleur, puis « Terminer » rend la fiche, figée, et
 * son PDF.
 *
 *  · Ouvert par `?etape=signatures` (la dernière pièce du parcours y mène ; la fiche y renvoie par
 *    « Faire signer sur place ») : un état de la page, pas une route.
 *  · Le BROUILLON se fige au premier geste de signature (`POST …/submit`, qui refuse un élément non
 *    qualifié) : le locataire signe un contenu qui ne bouge plus. Avant, l'état général et les notes se
 *    modifient ici (`PATCH`) ; après, ils se lisent.
 *  · « Terminer » ne s'active que les deux signatures posées. Il ne promet aucun envoi : à la seconde
 *    signature, l'API fige l'état des lieux et n'envoie rien (le PDF se télécharge depuis la fiche).
 */

const CONDITIONS: readonly InventoryCondition[] = ['excellent', 'good', 'fair', 'poor'];
const RESERVES: readonly InventoryElementState[] = [ETAT_USE, ETAT_ENDOMMAGE, ETAT_MANQUANT];

interface Reserve {
  readonly piece: string;
  readonly element: string;
  readonly etat: InventoryElementState;
  readonly note: string | null;
  readonly photo: InventoryRoomPhoto | null;
}

/** Les éléments Usé, Abîmé ou Manquant, avec leur note et la photo de l'élément (la première). */
export function reservesDe(inventory: Inventory): Reserve[] {
  return inventory.rooms.flatMap((room) => {
    const photos = inventory.room_photos?.find((g) => g.room_name === room.name)?.photos ?? [];
    return (room.elements ?? [])
      .filter((e) => e.state != null && RESERVES.includes(e.state))
      .map((e) => ({
        piece: room.name,
        element: e.label,
        etat: e.state as InventoryElementState,
        note: e.notes ?? null,
        photo: photos.find((p) => p.element_label === e.label) ?? null,
      }));
  });
}

export function RecapEtSignatures({ inventory }: { readonly inventory: Inventory }) {
  const contexte = useContexteDuBail(inventory.lease_id);
  return <Recap inventory={inventory} bail={contexte.data?.data ?? null} />;
}

function Recap({ inventory, bail }: { readonly inventory: Inventory; readonly bail: Contexte | null }) {
  const t = useTranslations('inventory.terrain.recap');
  const tTerrain = useTranslations('inventory.terrain');
  const tContexte = useTranslations('inventory.terrain.contexte');
  const tConsole = useTranslations('console.pageHeader');
  const router = useRouter();
  const { user } = useAuth();
  const bureau = useMatchesMedia('(width >= 48rem)');
  const messageErreur = useMessageErreurApi();
  const soumettre = useSubmitInventory(inventory.id);
  const [codeEnvoye, setCodeEnvoye] = useState(false);

  const brouillon = inventory.status === 'draft';
  const modifiable = brouillon && inventory.abilities?.update === true;
  const roles = inventory.can_sign_as ?? [];
  const signe = inventory.status === 'signed';

  const nomLocataire = inventory.tenant?.full_name || nomDuLocataire(bail?.tenant) || t('leLocataire');
  const prenom = inventory.tenant?.first_name || bail?.tenant?.first_name || nomLocataire;
  const titreDuBien = inventory.property?.title ?? bail?.property?.title ?? '';
  const sortie = inventory.type === 'move_out';

  const nbElements = inventory.rooms.reduce((n, r) => n + (r.elements?.length ?? 0), 0);
  const nbPhotos = (inventory.room_photos ?? []).reduce((n, g) => n + g.photos.length, 0);
  const reserves = reservesDe(inventory);

  // Le premier geste fige le brouillon : la soumission refuse un élément non qualifié, et le contenu
  // que le locataire signe ne bouge plus.
  const avantDeSigner = async (): Promise<string | null> => {
    if (inventory.status !== 'draft') return null;
    try {
      await soumettre.mutateAsync();
      return null;
    } catch (erreur) {
      return messageErreur(erreur);
    }
  };

  // « le code d'Aminata » (le code est parti) ou « la signature de Moussa ».
  const elision = elide(prenom);
  const ceQuiManqueAuLocataire = codeEnvoye
    ? t(elision ? 'manque.codeDElide' : 'manque.codeDe', { prenom })
    : t(elision ? 'manque.signatureDElide' : 'manque.signatureDe', { prenom });
  const locataireSigne = inventory.tenant_signed;
  const agenceSigne = inventory.owner_signed;
  const manque = signe
    ? t('manque.aucun')
    : !locataireSigne && !agenceSigne
      ? t('manque.lesDeux', { locataire: ceQuiManqueAuLocataire })
      : !locataireSigne
        ? t('manque.locataire', { locataire: ceQuiManqueAuLocataire })
        : t('manque.agence');

  const blocLocataire =
    roles.includes('tenant_onsite') || locataireSigne ? (
      <SignatureDuLocataire
        inventory={inventory}
        nom={nomLocataire}
        prenom={prenom}
        avantDeSigner={avantDeSigner}
        onEtat={(e) => setCodeEnvoye(e.codeEnvoye)}
      />
    ) : (
      <LocataireDepuisSonCompte nom={nomLocataire} />
    );
  const blocAgence =
    roles.includes('landlord') || agenceSigne ? (
      <SignatureDeLAgence inventory={inventory} signataire={user?.full_name ?? ''} avantDeSigner={avantDeSigner} />
    ) : (
      <SignatureDuBailleurAttendue inventory={inventory} />
    );

  const terminer = () => router.replace(`/app/inventories/${inventory.id}`);
  // Revenir aux pièces : le parcours tant que le brouillon se modifie ; figé, les pièces se RELISENT
  // sur la fiche (le locataire les relit avec l'agent avant de signer).
  const lienDesPieces = modifiable ? `/app/inventories/${inventory.id}?piece=1` : `/app/inventories/${inventory.id}#pieces`;

  const recapitulatif = (
    <>
      <Chiffres pieces={inventory.rooms.length} elements={nbElements} photos={nbPhotos} />
      <EtatGeneral inventory={inventory} modifiable={modifiable} />
      <TitreDeBloc
        className="pt-1"
        action={
          inventory.rooms.length > 0 ? (
            <Link href={lienDesPieces} className="underline-offset-2 hover:underline">
              {t('toutRelire')}
            </Link>
          ) : null
        }
      >
        {t('reserves', { n: reserves.length })}
      </TitreDeBloc>
      {reserves.length > 0 ? <ListeDesReserves reserves={reserves} grandes={bureau} /> : null}
    </>
  );

  if (bureau) {
    return (
      <div data-slot="recap-et-signatures">
        <DeclarerEnTete forme="detail" titre={t('titre')} repli={`/app/inventories/${inventory.id}`} />
        <FilDAriane
          label={tConsole('breadcrumb')}
          etapes={[
            { label: tTerrain('fil.liste'), href: '/app/inventories' },
            ...(titreDuBien ? [{ label: titreDuBien }] : []),
            { label: tTerrain(sortie ? 'fil.sortie' : 'fil.entree') },
          ]}
        />
        <div className="flex items-start gap-4 max-xl:flex-wrap">
          <div className="min-w-0 flex-1 max-xl:basis-72">
            <h1 className="font-display text-2xl font-semibold tracking-titre text-foreground">{t('titre')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[titreDuBien, bail ? ligneDuBail(tContexte, bail) : null].filter(Boolean).join(' · ')}
              {inventory.conducted_at ? (
                <>
                  {' · '}
                  <LigneDuType type={inventory.type} quand={inventory.conducted_at} />
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-none items-center gap-2 max-xl:flex-wrap">
            <Link href={lienDesPieces} className={buttonVariants({ variant: 'outline' })}>
              {t('revenirAuxPieces')}
            </Link>
            <Button type="button" disabled={!signe} onClick={terminer} title={signe ? undefined : manque}>
              <FileDown className="size-4" aria-hidden />
              {t('terminer')}
            </Button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {recapitulatif}
            <NotesGenerales inventory={inventory} modifiable={modifiable} />
          </div>
          <div className="space-y-4">
            <TitreDeBloc>{t('signatures')}</TitreDeBloc>
            {blocLocataire}
            {blocAgence}
            <MentionFigee />
            {!signe ? (
              <p className="text-ui text-muted-foreground" aria-live="polite">
                {manque}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <PagePleineLargeur data-slot="recap-et-signatures">
      <DeclarerEnTete
        forme="detail"
        titre={t('titre')}
        repli={`/app/inventories/${inventory.id}`}
        formulaire
        actions={
          <div className="flex flex-col items-stretch gap-2 pb-2" data-slot="actions-du-telephone">
            <SheetClose nativeButton={false} render={<Link href={lienDesPieces} className={cn(buttonVariants({ variant: 'outline' }), 'h-12 w-full justify-start')} />}>
              {t('revenirAuxPieces')}
            </SheetClose>
          </div>
        }
      />
      <div className="space-y-4 px-4 py-4">
        {bail ? <ContexteDuBail bail={bail} type={inventory.type} quand={inventory.conducted_at} /> : null}
        {recapitulatif}
        <TitreDeBloc className="pt-1">{t('signaturesSurPlace')}</TitreDeBloc>
        {blocLocataire}
        {blocAgence}
        <MentionFigee />
      </div>
      <BarreDAction>
        <div>
          <p className="mb-2 text-center text-ui text-muted-foreground" aria-live="polite">
            {manque}
          </p>
          <Button type="button" size="xl" className="h-14 w-full gap-2 rounded-xl text-base font-semibold" disabled={!signe} onClick={terminer}>
            <FileDown className="size-5" aria-hidden />
            {t('terminer')}
          </Button>
        </div>
      </BarreDAction>
    </PagePleineLargeur>
  );
}

function TitreDeBloc({ children, action, className }: { readonly children: ReactNode; readonly action?: ReactNode; readonly className?: string }) {
  return (
    <div className={cn('flex items-baseline gap-3', className)}>
      <h2 className="min-w-0 flex-1 text-ui font-semibold text-muted-foreground">{children}</h2>
      {action ? <span className="flex-none text-sm font-medium text-primary">{action}</span> : null}
    </div>
  );
}

/** « 6 pièces · 41 éléments · 23 photos ». */
function Chiffres({ pieces, elements, photos }: { readonly pieces: number; readonly elements: number; readonly photos: number }) {
  const t = useTranslations('inventory.terrain.recap.chiffres');
  const cases = [
    { n: pieces, libelle: t('pieces', { n: pieces }) },
    { n: elements, libelle: t('elements', { n: elements }) },
    { n: photos, libelle: t('photos', { n: photos }) },
  ];
  return (
    <dl data-slot="chiffres-du-recap" className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card text-center">
      {cases.map((c) => (
        <div key={c.libelle} className="flex flex-col-reverse p-3">
          <dt className="text-ui text-muted-foreground">{c.libelle}</dt>
          <dd className="font-display text-2xl font-semibold tabular-nums tracking-titre">{c.n}</dd>
        </div>
      ))}
    </dl>
  );
}

/** L'état général du logement : quatre pastilles, modifiables tant que le brouillon n'est pas figé. */
function EtatGeneral({ inventory, modifiable }: { readonly inventory: Inventory; readonly modifiable: boolean }) {
  const t = useTranslations('inventory.terrain.recap');
  const tConditions = useTranslations('inventory.conditions');
  const messageErreur = useMessageErreurApi();
  const patch = useUpdateInventory(inventory.id);
  const [valeur, setValeur] = useState<InventoryCondition>(inventory.general_condition);
  const [erreur, setErreur] = useState<string | null>(null);

  const choisir = async (v: InventoryCondition) => {
    const avant = valeur;
    setValeur(v);
    setErreur(null);
    try {
      await patch.mutateAsync({ general_condition: v });
    } catch (e) {
      setValeur(avant);
      setErreur(messageErreur(e));
    }
  };

  return (
    <div>
      <p id={`etat-general-${inventory.id}`} className="mb-2 text-sm font-medium">
        {t('etatGeneral')}
      </p>
      <RadioGroupPrimitive
        aria-labelledby={`etat-general-${inventory.id}`}
        value={valeur}
        disabled={!modifiable || patch.isPending}
        onValueChange={(v) => void choisir(v as InventoryCondition)}
        className="flex gap-1.5"
      >
        {CONDITIONS.map((c) => (
          <RadioPrimitive.Root
            key={c}
            value={c}
            className={cn(
              'inline-flex h-12 flex-1 items-center justify-center rounded-lg border px-1 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring data-disabled:cursor-default',
              c === valeur ? 'border-success bg-success text-success-foreground' : 'border-controle-vide bg-card text-encre-douce',
              modifiable && c !== valeur && 'hover:bg-muted/50',
            )}
          >
            {tConditions(c)}
          </RadioPrimitive.Root>
        ))}
      </RadioGroupPrimitive>
      {erreur ? (
        <p role="alert" className="mt-1.5 text-ui text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}

const TON_DE_RESERVE: Record<InventoryElementState, 'attention' | 'danger' | 'success'> = {
  bon: 'success',
  usé: 'attention',
  endommagé: 'danger',
  manquant: 'danger',
};

function ListeDesReserves({ reserves, grandes }: { readonly reserves: readonly Reserve[]; readonly grandes: boolean }) {
  const t = useTranslations('inventory.terrain');
  return (
    <ul data-slot="reserves" className="divide-y divide-border rounded-xl border border-border bg-card">
      {reserves.map((r, i) => (
        <li key={`${r.piece}-${r.element}-${i}`} className="flex items-center gap-3 p-3">
          <span className={cn('flex flex-none items-center justify-center overflow-hidden bg-muted text-muted-foreground', grandes ? 'size-20 rounded-lg' : 'size-12 rounded-lg')}>
            {r.photo ? (
              // URL d'API signée : ni `next/image` ni son optimiseur n'y ont accès.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.photo.preview_url ?? r.photo.url} alt={t('recap.photoDe', { piece: r.piece, element: r.element })} className="size-full object-cover" />
            ) : (
              <Camera className="size-5" strokeWidth={1.75} aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1 leading-snug">
            <p className="text-corps font-semibold text-foreground">{t('recap.pieceEtElement', { piece: r.piece, element: r.element })}</p>
            {r.note ? <p className="text-sm text-encre-douce">{r.note}</p> : null}
          </div>
          <StatusBadge tone={TON_DE_RESERVE[r.etat]} label={t(`etats.${CLE_D_ETAT[r.etat]}`)} />
        </li>
      ))}
    </ul>
  );
}

/** Le locataire qui signera depuis son compte (le lecteur ne recueille pas sa signature sur place). */
function LocataireDepuisSonCompte({ nom }: { readonly nom: string }) {
  const t = useTranslations('inventory.terrain.signatures');
  return (
    <section data-slot="bloc-de-signature" className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-corps font-semibold text-foreground">{t('locataire', { nom })}</h3>
        <StatusBadge tone="neutral" label={t('statut.aSigner')} />
      </div>
      <p className="mt-1 text-ui text-muted-foreground">{t('depuisSonCompte')}</p>
    </section>
  );
}

/** « Notes générales (facultatif) » : au bureau, modifiables tant que le brouillon n'est pas figé. */
function NotesGenerales({ inventory, modifiable }: { readonly inventory: Inventory; readonly modifiable: boolean }) {
  const t = useTranslations('inventory.terrain.recap');
  const messageErreur = useMessageErreurApi();
  const patch = useUpdateInventory(inventory.id);
  const [notes, setNotes] = useState(inventory.notes ?? '');
  const [enregistrees, setEnregistrees] = useState(inventory.notes ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const id = `notes-generales-${inventory.id}`;

  // À la sortie du champ, seulement s'il a changé.
  const enregistrer = async () => {
    if (notes === enregistrees) return;
    setErreur(null);
    try {
      await patch.mutateAsync({ notes: notes.trim() === '' ? null : notes });
      setEnregistrees(notes);
    } catch (e) {
      setErreur(messageErreur(e));
    }
  };

  if (!modifiable && !inventory.notes) return null;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {t('notesGenerales')}
      </label>
      {modifiable ? (
        <Textarea
          id={id}
          value={notes}
          rows={3}
          maxLength={5000}
          placeholder={t('notesExemple')}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void enregistrer()}
          className="bg-card"
        />
      ) : (
        <p id={id} className="whitespace-pre-wrap rounded-lg border border-border bg-card px-3 py-2.5 text-corps">
          {inventory.notes}
        </p>
      )}
      {erreur ? (
        <p role="alert" className="mt-1 text-ui text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
