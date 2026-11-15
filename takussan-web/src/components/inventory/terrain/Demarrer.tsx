'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { ArrowRight, Info, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { FilDAriane } from '@/components/console/PageHeader';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  parametresDuModele,
  useContexteDuBail,
  useCreateInventory,
  useEntreeSignee,
  useInventory,
  useInventoryTemplate,
  type ContexteDuBail as Contexte,
} from '@/lib/queries/inventory';
import type { InventoryCreateInput } from '@/lib/schemas/inventory';
import { cn } from '@/lib/utils';
import { INVENTORY_TEMPLATE_KEYS, type Inventory, type InventoryTemplate, type InventoryTemplateKey, type InventoryType } from '@/types/inventory';

import { ContexteDuBail, ligneDuBail } from './ContexteDuBail';
import { curseurALApparition, nomDuLocataire, piecesDuModele, typeDeduit } from './parcours';

/** L'instant courant au format `datetime-local` (heure locale), la valeur du sélecteur de date et d'heure. */
function maintenantLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * TCK-2647 — l'écran « Démarrer » (maquette `app-etats-des-lieux`, a-0) : le contexte du bail, le
 * type déduit et modifiable, la date et l'heure, le modèle de logement et ses pièces en cases sur deux
 * colonnes, « + Autre pièce », le compte des pièces et des éléments proposés, puis « Commencer », qui
 * crée le brouillon (`POST /api/inventories`) avec les pièces cochées et leurs éléments, sans état :
 * chaque élément se qualifie d'un toucher, pièce par pièce.
 *
 * Une SORTIE d'un bail dont l'entrée est signée part des pièces de cette entrée, chaque élément à son
 * état d'entrée (en sortie, l'agent ne note que ce qui a changé) ; le serveur y rattache les états
 * d'entrée en lecture (TCK-2646). Sans entrée signée, la sortie part du modèle, comme une entrée.
 */
export function Demarrer({ leaseId, typeDemande }: { readonly leaseId: number; readonly typeDemande?: string | null }) {
  const contexte = useContexteDuBail(leaseId);
  return (
    <QueryBoundary query={contexte}>
      {(r) => <DemarrerLeBail bail={r.data} typeDemande={typeDemande} />}
    </QueryBoundary>
  );
}

function DemarrerLeBail({ bail, typeDemande }: { readonly bail: Contexte; readonly typeDemande?: string | null }) {
  const [type, setType] = useState<InventoryType>(() => typeDeduit(bail.status, typeDemande));
  const entree = useEntreeSignee(bail.id, type === 'move_out');
  const entreeId = type === 'move_out' ? (entree.data?.data[0]?.id ?? null) : null;
  const detailDeLEntree = useInventory(entreeId);
  const [modele, setModele] = useState<InventoryTemplateKey | null>(null);
  const modeleDuBien = useInventoryTemplate(modele === null ? { property_id: String(bail.property_id) } : parametresDuModele(modele, bail.property?.bedrooms));

  const depuisLEntree = type === 'move_out' && entreeId !== null ? (detailDeLEntree.data?.data ?? null) : null;
  const enAttente = type === 'move_out' && (entree.isLoading || (entreeId !== null && detailDeLEntree.isLoading));

  return (
    <Formulaire
      key={`${type}-${depuisLEntree ? `e${depuisLEntree.id}` : (modeleDuBien.data?.data.key ?? 'aucun')}`}
      bail={bail}
      type={type}
      onType={setType}
      modele={modeleDuBien.data?.data ?? null}
      onModele={setModele}
      chargement={enAttente || modeleDuBien.isLoading}
      erreurDuModele={modeleDuBien.isError}
      entree={depuisLEntree}
    />
  );
}

/** Une pièce proposée : celle du modèle (sa clé) ou celle de l'entrée reprise (son nom). */
interface Proposee {
  readonly cle: string;
  readonly nom: string;
  readonly elements: number;
}

function Formulaire({
  bail,
  type,
  onType,
  modele,
  onModele,
  chargement,
  erreurDuModele,
  entree,
}: {
  readonly bail: Contexte;
  readonly type: InventoryType;
  readonly onType: (t: InventoryType) => void;
  readonly modele: InventoryTemplate | null;
  readonly onModele: (k: InventoryTemplateKey) => void;
  readonly chargement: boolean;
  readonly erreurDuModele: boolean;
  readonly entree: Inventory | null;
}) {
  const t = useTranslations('inventory.terrain');
  const tContexte = useTranslations('inventory.terrain.contexte');
  const tConsole = useTranslations('console.pageHeader');
  const router = useRouter();
  const create = useCreateInventory();
  const messageErreur = useMessageErreurApi();

  const proposees: Proposee[] = entree
    ? entree.rooms.map((r) => ({ cle: r.name, nom: r.name, elements: r.elements?.length ?? 0 }))
    : (modele?.rooms ?? []).map((r) => ({ cle: r.key, nom: r.name, elements: r.elements.length }));
  const [cochees, setCochees] = useState<ReadonlySet<string>>(() => new Set(proposees.map((p) => p.cle)));
  const [ajoutees, setAjoutees] = useState<readonly string[]>([]);
  const [saisie, setSaisie] = useState<string | null>(null);
  const [quand, setQuand] = useState(maintenantLocal);
  const [erreur, setErreur] = useState<unknown>(null);

  const nbPieces = proposees.filter((p) => cochees.has(p.cle)).length + ajoutees.length;
  const nbElements = proposees.filter((p) => cochees.has(p.cle)).reduce((n, p) => n + p.elements, 0);
  const premiere = proposees.find((p) => cochees.has(p.cle))?.nom ?? ajoutees[0] ?? null;
  const titre = t(type === 'move_out' ? 'titre.move_out' : 'titre.move_in');

  const basculer = (cle: string, coche: boolean) =>
    setCochees((avant) => {
      const apres = new Set(avant);
      if (coche) apres.add(cle);
      else apres.delete(cle);
      return apres;
    });

  const ajouter = () => {
    const nom = (saisie ?? '').trim();
    if (nom && !ajoutees.includes(nom) && !proposees.some((p) => p.nom === nom)) setAjoutees((a) => [...a, nom]);
    setSaisie(null);
  };

  const commencer = async () => {
    if (nbPieces === 0) return;
    setErreur(null);
    const rooms = entree
      ? [
          ...entree.rooms
            .filter((r) => cochees.has(r.name))
            .map((r) => ({
              name: r.name,
              condition: r.condition,
              notes: null,
              completed: false,
              // En sortie, chaque élément part de son état d'entrée : l'agent ne touche que ce qui a changé.
              elements: (r.elements ?? []).map((e) => ({ label: e.label, state: e.state, notes: null })),
            })),
          ...piecesDuModele([], new Set(), ajoutees),
        ]
      : piecesDuModele(modele?.rooms ?? [], cochees, ajoutees);
    try {
      const res = await create.mutateAsync({
        lease_id: bail.id,
        type,
        conducted_at: quand ? new Date(quand).toISOString() : undefined,
        general_condition: entree?.general_condition ?? 'good',
        notes: undefined,
        ...(entree ? { from_inventory_id: entree.id } : {}),
        // Les pièces du parcours portent des éléments sans état : le type du formulaire les admet.
        rooms: rooms as InventoryCreateInput['rooms'],
      } satisfies InventoryCreateInput);
      router.push(`/app/inventories/${res.data.id}`);
    } catch (e) {
      setErreur(e);
    }
  };

  const action = (
    <>
      {t('demarrer.commencer', { piece: premiere ?? '' })}
      <ArrowRight className="size-5 lg:size-4" aria-hidden />
    </>
  );

  return (
    <PagePleineLargeur data-slot="demarrer-l-etat-des-lieux">
      <DeclarerEnTete forme="detail" formulaire titre={titre} repli={`/app/leases/${bail.id}`} />
      <div className="max-md:hidden">
        <FilDAriane
          label={tConsole('breadcrumb')}
          etapes={[{ label: t('fil.liste'), href: '/app/inventories' }, { label: t('fil.nouveau') }]}
        />
        <h1 className="font-display text-2xl font-semibold tracking-titre text-foreground">{titre}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[bail.property?.title, nomDuLocataire(bail.tenant), ligneDuBail(tContexte, { ...bail, tenant: null })].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="space-y-5 px-4 py-4 md:mx-auto md:w-160 md:max-w-full md:px-0 md:py-8">
        <section className="rounded-xl border border-border bg-card p-4">
          <ContexteDuBail bail={bail} type={type} quand={quand ? new Date(quand).toISOString() : null} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p id="edl-type" className="mb-1.5 text-sm font-medium text-foreground">
                {t('demarrer.type')}
              </p>
              <RadioGroupPrimitive
                aria-labelledby="edl-type"
                value={type}
                onValueChange={(v) => onType(v as InventoryType)}
                className="flex h-12 w-full rounded-lg bg-muted p-1"
              >
                {(['move_in', 'move_out'] as const).map((v) => (
                  <RadioPrimitive.Root
                    key={v}
                    value={v}
                    className={cn(
                      'inline-flex h-10 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring',
                      type === v ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(v === 'move_in' ? 'demarrer.entree' : 'demarrer.sortie')}
                  </RadioPrimitive.Root>
                ))}
              </RadioGroupPrimitive>
            </div>
            <div>
              <label htmlFor="edl-quand" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('demarrer.dateHeure')}
              </label>
              <DateTimePicker id="edl-quand" value={quand} onValueChange={setQuand} buttonClassName="h-12 w-full" />
            </div>
          </div>
        </section>

        {entree ? (
          <p className="flex gap-2.5 rounded-xl bg-muted/60 p-3.5 text-ui leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden />
            {t('demarrer.depuisLEntree')}
          </p>
        ) : (
          <div>
            <p id="edl-modele" className="mb-1.5 text-sm font-medium text-foreground">
              {t('demarrer.modele')}
            </p>
            <Select
              value={modele?.key ?? null}
              onValueChange={(v) => v && onModele(v as InventoryTemplateKey)}
              items={INVENTORY_TEMPLATE_KEYS.map((k) => ({ value: k, label: t(`modeles.${k}`) }))}
            >
              <SelectTrigger aria-labelledby="edl-modele" className="w-full text-corps font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVENTORY_TEMPLATE_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`modeles.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">{t('demarrer.pieces')}</legend>
          {chargement ? (
            <div className="grid grid-cols-2 gap-2.5" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : erreurDuModele && !entree ? (
            <p role="alert" className="text-sm text-destructive">
              {t('demarrer.modeleIndisponible')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {proposees.map((p) => {
                const coche = cochees.has(p.cle);
                return (
                  <label
                    key={p.cle}
                    className={cn(
                      'flex h-14 cursor-pointer items-center gap-3 rounded-xl border px-3.5 text-corps font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring',
                      coche ? 'border-primary bg-secondary/70 text-foreground' : 'border-border bg-card text-encre-douce',
                    )}
                  >
                    <Checkbox checked={coche} onCheckedChange={(v) => basculer(p.cle, v === true)} className="size-5.5 rounded-md" />
                    <span className="min-w-0 truncate">{p.nom}</span>
                  </label>
                );
              })}
              {ajoutees.map((nom) => (
                <label key={nom} className="flex h-14 cursor-pointer items-center gap-3 rounded-xl border border-primary bg-secondary/70 px-3.5 text-corps font-medium text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring">
                  <Checkbox checked onCheckedChange={() => setAjoutees((a) => a.filter((n) => n !== nom))} className="size-5.5 rounded-md" />
                  <span className="min-w-0 truncate">{nom}</span>
                </label>
              ))}
              {saisie === null ? (
                <button
                  type="button"
                  onClick={() => setSaisie('')}
                  className="flex h-14 items-center gap-3 rounded-xl border border-dashed border-foreground/30 px-3.5 text-left text-corps font-medium text-encre-douce outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring"
                >
                  <Plus className="size-5 flex-none" aria-hidden />
                  {t('demarrer.autrePiece')}
                </button>
              ) : (
                <div className="col-span-2 flex gap-2">
                  <Input
                    ref={curseurALApparition}
                    aria-label={t('demarrer.nomDeLaPiece')}
                    placeholder={t('demarrer.nomDeLaPiece')}
                    value={saisie}
                    maxLength={255}
                    onChange={(e) => setSaisie(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        ajouter();
                      }
                      if (e.key === 'Escape') setSaisie(null);
                    }}
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={ajouter}>
                    {t('demarrer.ajouter')}
                  </Button>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-sm tabular-nums text-muted-foreground">
            {t.rich('demarrer.compte', {
              pieces: nbPieces,
              elements: nbElements,
              b: (c) => <span className="font-semibold text-foreground">{c}</span>,
            })}
          </p>
        </fieldset>

        <p className="flex gap-2.5 rounded-xl bg-muted/60 p-3.5 text-ui leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden />
          {t('demarrer.brouillon')}
        </p>

        {erreur !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(erreur, t('demarrer.echec'))}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 max-md:hidden">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t('demarrer.annuler')}
          </Button>
          <Button type="button" className="px-5" disabled={nbPieces === 0 || create.isPending} onClick={() => void commencer()}>
            {action}
          </Button>
        </div>
      </div>

      <BarreDAction>
        <Button type="button" size="xl" className="h-14 gap-2 rounded-xl text-base font-semibold" disabled={nbPieces === 0 || create.isPending} onClick={() => void commencer()}>
          {action}
        </Button>
      </BarreDAction>
    </PagePleineLargeur>
  );
}
