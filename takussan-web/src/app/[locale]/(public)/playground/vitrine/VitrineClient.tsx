'use client';

import { Bell, BellOff, Check, FileText, Home, MoreHorizontal, Plus, Search, TriangleAlert, Undo2, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { PageHeader, StatCard, StatusBadge, type StatusTone } from '@/components/console';
import { DataTable } from '@/components/console/DataTable';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { EmptyState } from '@/components/feedback';
import { Avatar, AvatarFallback, type TailleAvatar } from '@/components/ui/avatar';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ChoiceCard } from '@/components/ui/choice-card';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { Progress, ProgressSegments, type TonDeJauge } from '@/components/ui/progress';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DatePicker } from '@/components/ui/date-picker';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { fieldDensityScope } from '@/components/ui/field-density';
import { Input } from '@/components/ui/input';
import { IconeDeLigne, LigneDeListe, MontantDeLigne } from '@/components/ui/ligne-de-liste';
import { EnveloppeDuContenu, PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ActionDuToast, useToast } from '@/components/ui/toast';
import { WarningBanner } from '@/components/ui/warning-banner';
import { TAILLES_DE_TEXTE, type TailleDeTexte } from '@/lib/jetons-de-l-app';
import { useFormatteurs } from '@/lib/format/useFormatteurs';

/**
 * TCK-2685 — la vitrine (cf. `page.tsx`). Chaque échantillon porte un `data-jeton` ou un
 * `data-epreuve` : c'est par eux que l'outil de fidélité et les mesures du ticket les retrouvent.
 *
 * ⚠ Les classes sont écrites EN ENTIER, en littéraux : Tailwind ne compile que ce qu'il lit. Une
 * classe assemblée (`text-${nom}`) ne serait pas émise.
 */
const ECHELLE: ReadonlyArray<readonly [TailleDeTexte, string]> = [
  ['pastille', 'text-pastille'],
  ['legende', 'text-legende'],
  ['ui', 'text-ui'],
  ['corps', 'text-corps'],
  ['action', 'text-action'],
  ['titre-court', 'text-titre-court'],
  ['affiche-22', 'text-affiche-22'],
  ['affiche-26', 'text-affiche-26'],
  ['affiche-28', 'text-affiche-28'],
  ['affiche-32', 'text-affiche-32'],
  ['affiche-40', 'text-affiche-40'],
];

const OMBRES: ReadonlyArray<readonly [string, string]> = [
  ['barre-collante', 'shadow-barre-collante'],
  ['filet', 'shadow-filet'],
  ['bouton-photo', 'shadow-bouton-photo'],
  ['actif', 'shadow-actif'],
  ['panneau', 'shadow-panneau'],
  ['feuille', 'shadow-feuille'],
];

const ECHANTILLON = 'Takussan 1 355 000';

/** TCK-2687 — les six tons de `StatusBadge`, avec un libellé de la maquette. */
const TONS: ReadonlyArray<readonly [StatusTone, string]> = [
  ['neutral', 'Brouillon'],
  ['success', 'Payé'],
  ['attention', 'En retard'],
  ['danger', 'Impayé'],
  ['info', 'En cours'],
  ['primary', 'Nouvelle'],
];

/** TCK-2687 — les surfaces où une pastille se pose (AC1 : ≥ 4,5:1 sur chacune). */
const SURFACES_DE_PASTILLE: ReadonlyArray<readonly [string, string]> = [
  ['card', 'bg-card'],
  ['background', 'bg-background'],
  ['muted', 'bg-muted'],
];

/** TCK-2690 — les quatre tons de la jauge, chacun à une valeur lisible. */
const TONS_DE_JAUGE: ReadonlyArray<readonly [TonDeJauge, number, string]> = [
  ['primary', 60, 'Crédits utilisés'],
  ['success', 100, 'Dossier complet'],
  ['warning', 85, 'Quota presque atteint'],
  ['neutral', 30, 'Profil renseigné'],
];

/** TCK-2690 — un titre de 80 caractères : la feuille le tronque sur une ligne (AC1). */
const TITRE_LONG = 'Relance du loyer de novembre pour l’appartement F4 de Sacré-Cœur, rue 10, bloc B';

/** TCK-2688 — les lignes du tableau de la vitrine (maquette `app-equipe` a). */
interface MembreDeVitrine {
  readonly id: number;
  readonly nom: string;
  readonly role: string;
  readonly ton: StatusTone;
  readonly statut: string;
}
const MEMBRES: readonly MembreDeVitrine[] = [
  { id: 1, nom: 'Awa Ndiaye', role: 'Administratrice', ton: 'success', statut: 'Active' },
  { id: 2, nom: 'Moussa Diop', role: 'Agent', ton: 'attention', statut: 'Absent' },
  { id: 3, nom: 'Fatou Sarr', role: 'Agent', ton: 'neutral', statut: 'Invitée' },
];

/** TCK-2687 — les six tailles d'avatar en px, puis les trois d'avant. */
const TAILLES_AVATAR: readonly TailleAvatar[] = ['28', '32', '36', '40', '44', '48', 'sm', 'default', 'lg'];

function Section({ titre, children }: { readonly titre: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-5">
      <h2 className="font-display text-titre-court font-semibold tracking-titre">{titre}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { readonly children: ReactNode }) {
  return <code className="font-mono text-legende text-encre-douce">{children}</code>;
}

/**
 * TCK-2686 — un champ de chaque type, rendu tel qu'une page de `/app` l'écrit (sans hauteur ni
 * teinte d'appelant). `regime` préfixe les `data-epreuve` : « app » sous la seule portée `/app`,
 * « confortable » sous une portée `fieldDensityScope()` posée DANS la portée `/app` (AC2).
 */
function Champs({ regime }: { readonly regime: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input data-epreuve={`${regime}-input`} aria-label={`Champ ${regime}`} placeholder="Nom du client" />
      <Select>
        <SelectTrigger data-epreuve={`${regime}-select`} aria-label={`Sélecteur ${regime}`} className="w-full">
          <SelectValue placeholder="Tous les statuts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="actif">Actif</SelectItem>
        </SelectContent>
      </Select>
      <DatePicker data-testid={`${regime}-date`} value="" onValueChange={() => {}} aria-label={`Date ${regime}`} />
      <DateTimePicker data-testid={`${regime}-date-heure`} value="" onValueChange={() => {}} aria-label={`Date et heure ${regime}`} />
      <Textarea data-epreuve={`${regime}-textarea`} aria-label={`Zone de texte ${regime}`} placeholder="Note interne" className="sm:col-span-2" />
    </div>
  );
}

/**
 * TCK-2688 — les primitives existantes du lot 2, chacune dans l'état que le ticket fait mesurer :
 * panneau ouvert, tableau trié, bandeau avec titre, radio et carte de choix cochés, recherche
 * remplie, toast sombre avec son action.
 */
function PrimitivesDuLot2() {
  const toast = useToast();
  const [tri, setTri] = useState('name');
  const [recherche, setRecherche] = useState('Sacré-Cœur');
  const [choix, setChoix] = useState('bailleur');
  const lignes = [...MEMBRES].sort((a, b) => (tri === '-name' ? b.nom.localeCompare(a.nom) : a.nom.localeCompare(b.nom)));

  return (
    <>
      <Section titre="Panneau latéral droit (480 px dès xl ; plein écran dessous ; sans voile, non modal dès xl)">
        <PanneauDroit
          data-epreuve="panneau-droit"
          titre="Fiche du membre"
          declencheur={
            <Button variant="outline" data-epreuve="ouvrir-panneau-droit">
              Ouvrir le panneau
            </Button>
          }
          pied={
            <>
              <Button variant="outline">Suspendre l’accès</Button>
              <Button>Déclarer une absence</Button>
            </>
          }
        >
          <div className="space-y-3 text-ui text-encre-douce">
            {Array.from({ length: 30 }, (_, i) => (
              <p key={i}>Paragraphe {i + 1} : le corps défile, l’en-tête et le pied restent en place.</p>
            ))}
          </div>
        </PanneauDroit>
      </Section>

      <Section titre="Tableau (en-tête en casse normale, conteneur bordé)">
        <DataTable<MembreDeVitrine>
          data-testid="vitrine-tableau"
          caption="Membres de l’agence"
          rows={lignes}
          rowKey={(m) => m.id}
          sort={{ value: tri, onChange: setTri }}
          columns={[
            { id: 'nom', header: 'Nom', sortKey: 'name', sortLabel: 'Trier par nom', className: 'font-medium text-foreground', cell: (m) => m.nom },
            { id: 'role', header: 'Rôle', cell: (m) => m.role },
            { id: 'statut', header: 'Statut', cell: (m) => <StatusBadge tone={m.ton} label={m.statut} /> },
            {
              id: 'actions',
              header: 'Actions',
              headerSrOnly: true,
              align: 'end',
              cell: (m) => (
                <Button size="icon-sm" variant="ghost" aria-label={`Actions pour ${m.nom}`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              ),
            },
          ]}
        />
      </Section>

      <Section titre="Bandeau d’avertissement">
        <WarningBanner data-epreuve="bandeau-titre" icon={<TriangleAlert aria-hidden="true" />} titre="Pièce d’identité expirée">
          Le bail ne pourra pas être signé tant que le locataire n’a pas déposé une pièce valide.
        </WarningBanner>
        <WarningBanner data-epreuve="bandeau-simple" icon={<TriangleAlert aria-hidden="true" />}>
          Deux échéances restent à rapprocher ce mois-ci.
        </WarningBanner>
      </Section>

      <Section titre="Radio et carte de choix">
        <RadioGroup defaultValue="mois" aria-label="Périodicité du loyer" className="max-w-sm">
          {[
            ['mois', 'Mensuel'],
            ['trimestre', 'Trimestriel'],
            ['an', 'Annuel'],
          ].map(([valeur, libelle]) => (
            <label key={valeur} className="flex min-h-11 items-center gap-3 text-corps">
              <Radio value={valeur} data-epreuve={`radio-${valeur}`} />
              {libelle}
            </label>
          ))}
        </RadioGroup>
        <div role="radiogroup" aria-label="Vous êtes" className="grid max-w-md gap-3">
          <ChoiceCard
            name="vitrine-choix"
            value="bailleur"
            checked={choix === 'bailleur'}
            onSelect={setChoix}
            title="Bailleur"
            description="Vous confiez un bien à une agence."
          />
          <ChoiceCard
            name="vitrine-choix"
            value="agence"
            checked={choix === 'agence'}
            onSelect={setChoix}
            title="Agence"
            description="Vous gérez les biens de vos bailleurs."
          />
        </div>
      </Section>

      <Section titre="Champ de recherche (rempli)">
        <DebouncedSearchInput
          className="max-w-sm"
          value={recherche}
          onCommit={setRecherche}
          placeholder="Rechercher un bien"
          aria-label="Rechercher un bien"
        />
      </Section>

      <Section titre="Toast (sombre, en bas, partout)">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            data-epreuve="lever-toast"
            onClick={() =>
              toast.add({
                title: 'Demande traitée.',
                type: 'success',
                timeout: 0,
                data: {
                  action: (
                    <ActionDuToast>
                      <Undo2 aria-hidden="true" />
                      Annuler
                    </ActionDuToast>
                  ),
                },
              })
            }
          >
            Lever un toast avec action
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.add({ title: 'Échec de l’envoi', description: 'Vérifiez votre connexion.', type: 'error' })}
          >
            Lever un toast d’erreur
          </Button>
        </div>
      </Section>
    </>
  );
}

/** TCK-2689 — les douze puces de la rangée (AC2) : elle défile dans sa boîte, jamais le document. */
const PUCES: readonly { libelle: string; compte?: number }[] = [
  { libelle: 'À traiter', compte: 4 },
  { libelle: 'À moi', compte: 2 },
  { libelle: 'Traitées', compte: 37 },
  { libelle: 'Toutes', compte: 43 },
  { libelle: 'Location' },
  { libelle: 'Vente' },
  { libelle: 'Plateau' },
  { libelle: 'Sacré-Cœur' },
  { libelle: 'Mermoz' },
  { libelle: 'Ouakam' },
  { libelle: 'Almadies' },
  { libelle: 'Ngor' },
];

/** Une barre d'onglets factice, de la hauteur de celle de la coque (56 px, `BarreDOnglets`). */
function OngletsFactices() {
  return (
    <div data-epreuve="onglets-factices" className="flex h-14 flex-none items-center justify-around border-t border-border bg-card text-legende text-muted-foreground">
      <span>Accueil</span>
      <span>Demandes</span>
      <span>Biens</span>
      <span>Menu</span>
    </div>
  );
}

/**
 * TCK-2689 — les primitives neuves, lot 1 : puce de filtre et sa rangée, contrôle segmenté, barre
 * d'action collante, ligne de liste mobile. Les `data-epreuve` sont les points de mesure des AC.
 */
function PrimitivesNeuvesLot1() {
  const [actif, setActif] = useState('À traiter');
  const [vue, setVue] = useState('liste');

  return (
    <>
      <Section titre="Puces de filtre (36 px rendus, cible de 44) et leur rangée défilante">
        <div className="-mx-4 border-y border-border bg-background">
          <RangeeDePuces data-epreuve="rangee-12" aria-label="Filtres des demandes">
            {PUCES.map((p, i) => (
              <PuceDeFiltre
                key={p.libelle}
                active={p.libelle === actif}
                compte={p.compte}
                onClick={() => setActif(p.libelle)}
                data-epreuve={i === 0 ? 'puce-premiere' : i === 1 ? 'puce-deuxieme' : undefined}
              >
                {p.libelle}
              </PuceDeFiltre>
            ))}
          </RangeeDePuces>
        </div>
        {/* Rangées enroulées à 12 px : les cibles de 44 px de deux lignes voisines ne se chevauchent pas. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          <PuceDeFiltre data-epreuve="puce-repos" compte={12}>
            Repos
          </PuceDeFiltre>
          <PuceDeFiltre data-epreuve="puce-active" active compte={4}>
            Active
          </PuceDeFiltre>
          <PuceDeFiltre data-epreuve="puce-ajouter" variante="ajouter" />
          <PuceDeFiltre data-epreuve="puce-desactivee" disabled>
            Désactivée
          </PuceDeFiltre>
          <PuceDeFiltre data-epreuve="puce-sm" taille="sm" compte={8}>
            Petite
          </PuceDeFiltre>
          <PuceDeFiltre data-epreuve="puce-sm-active" taille="sm" active>
            Petite active
          </PuceDeFiltre>
        </div>
      </Section>

      <Section titre="Contrôle segmenté (piste p-1, items h-9 px-4 ; sm ; pleine largeur)">
        <div className="space-y-3">
          <Tabs value={vue} onValueChange={(v) => setVue(String(v))}>
            <TabsList data-epreuve="segmente" aria-label="Présentation">
              <TabsTrigger value="liste" data-epreuve="segment-actif">
                Liste
              </TabsTrigger>
              <TabsTrigger value="carte" data-epreuve="segment-inactif">
                Carte
              </TabsTrigger>
              <TabsTrigger value="tableau">Tableau</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs defaultValue="mois">
            <TabsList size="sm" data-epreuve="segmente-sm" aria-label="Période">
              <TabsTrigger value="mois" data-epreuve="segment-sm-actif">
                Ce mois
              </TabsTrigger>
              <TabsTrigger value="trimestre">Trimestre</TabsTrigger>
              <TabsTrigger value="annee">Année</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs defaultValue="loyers" className="max-w-sm">
            <TabsList className="w-full" data-epreuve="segmente-plein" aria-label="Encaissements">
              <TabsTrigger value="loyers">Loyers</TabsTrigger>
              <TabsTrigger value="cautions">Cautions</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Section>

      <Section titre="Barre d’action collante (73 px, sous md seulement)">
        <p className="text-ui text-muted-foreground">
          En flux entre le contenu et les onglets ; dans la coque, rendue dans son emplacement. À 1440, aucune barre :
          les cadres ci-dessous n’en montrent que le contenu.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div data-epreuve="cadre-onglets" className="flex h-80 flex-col overflow-hidden rounded-xl border border-border bg-background">
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 text-ui text-encre-douce">
              {Array.from({ length: 12 }, (_, i) => (
                <p key={i}>Ligne de contenu {i + 1}</p>
              ))}
            </div>
            <BarreDAction data-epreuve="barre-d-action-onglets">
              <Button size="xl">Enregistrer le bail</Button>
            </BarreDAction>
            <OngletsFactices />
          </div>
          <div data-epreuve="cadre-plein" className="flex h-80 flex-col overflow-hidden rounded-xl border border-border bg-background">
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 text-ui text-encre-douce">
              {Array.from({ length: 12 }, (_, i) => (
                <p key={i}>Champ du formulaire {i + 1}</p>
              ))}
            </div>
            <BarreDAction zoneSure data-epreuve="barre-d-action-plein">
              <Button size="xl" variant="outline">
                Refuser
              </Button>
              <Button size="xl">Accepter</Button>
            </BarreDAction>
          </div>
        </div>
      </Section>

      <Section titre="Lignes de liste mobile (56 px au moins, la ligne est la cible)">
        <div id="lignes-de-liste" data-epreuve="liste-mobile" className="-mx-4 border-t border-border bg-card">
          <LigneDeListe
            href="#lignes-de-liste"
            debut={
              <Avatar size="40">
                <AvatarFallback>AN</AvatarFallback>
              </Avatar>
            }
            titre="Awa Ndiaye"
            detail="Appartement F3 · Sacré-Cœur"
            fin={<StatusBadge tone="success" label="Payé" />}
          />
          <LigneDeListe
            href="#lignes-de-liste"
            debut={
              <IconeDeLigne>
                <FileText />
              </IconeDeLigne>
            }
            titre="Quittance d’octobre"
            detail="Envoyée le 4 nov."
            fin={<MontantDeLigne>{'1 355 000 F'}</MontantDeLigne>}
          />
          <LigneDeListe
            onClick={() => undefined}
            debut={
              <IconeDeLigne>
                <Wrench />
              </IconeDeLigne>
            }
            titre="Fuite sous l’évier, cuisine — un titre long qui se tronque sur une seule ligne"
            detail="Signalée par le locataire il y a 2 jours, en attente d’un artisan"
            chevron
          />
        </div>
      </Section>
    </>
  );
}

// TCK-2691:début
/**
 * TCK-2691 (C1, AC7) — la page « pleine largeur » au téléphone, dans la VRAIE enveloppe de la coque
 * (`EnveloppeDuContenu`, celle d'`AppShell`), posée bord à bord de l'écran (`-mx-4`) : la page qui
 * l'adopte va de x = 0, son texte à x = 16 ; la page témoin, qui ne l'adopte pas, garde ses 16 px.
 * Dès `md`, les deux gardent la marge de l'enveloppe.
 */
function PleineLargeurAuTelephone() {
  const lignes = (
    <>
      <LigneDeListe href="#pleine-largeur" titre="Awa Ndiaye" detail="Appartement F3 · Sacré-Cœur" chevron />
      <LigneDeListe href="#pleine-largeur" titre="Moussa Diop" detail="Studio · Mermoz" chevron />
    </>
  );
  return (
    <Section titre="Page « pleine largeur » au téléphone (l’enveloppe de la coque, adoptée ou non)">
      <div id="pleine-largeur" className="-mx-4 space-y-4 md:mx-0">
        <EnveloppeDuContenu>
          <PagePleineLargeur data-epreuve="page-pleine-largeur">
            <p className="px-4 pb-2 text-ui text-muted-foreground">Adoptée : la rangée va bord à bord, le texte à 16 px.</p>
            <div className="border-t border-border bg-card">{lignes}</div>
          </PagePleineLargeur>
        </EnveloppeDuContenu>
        <EnveloppeDuContenu>
          <div data-epreuve="page-temoin">
            <p className="pb-2 text-ui text-muted-foreground">Témoin : la page garde la marge de 16 px de la coque.</p>
            <div className="border-t border-border bg-card">{lignes}</div>
          </div>
        </EnveloppeDuContenu>
      </div>
    </Section>
  );
}
// TCK-2691:fin

export function VitrineClient() {
  const f = useFormatteurs();
  const annee = new Date().getUTCFullYear();
  const cetteAnnee = new Date(Date.UTC(annee, 10, 4, 10));
  const anneeDerniere = new Date(Date.UTC(annee - 1, 11, 4, 10));

  return (
    <div data-portee-app="" className="mx-auto max-w-5xl space-y-8 bg-background px-4 py-8">
      {/* TCK-2687 — l'en-tête de la vitrine EST un `PageHeader` : son H1 (unique) se mesure ici avec
          ses trois emplacements neufs (bandeau, fil d'Ariane, sous l'en-tête). Le nom du fil est
          écrit en dur, comme toute la vitrine : `console.pageHeader.breadcrumb` est celui des pages
          de `/app`, et le lire ici ferait servir l'espace `console` entier au site public. */}
      <PageHeader
        title="Vitrine de la partie connectée"
        description={
          <>
            Jetons de TCK-2685, puis primitives de TCK-2686 à TCK-2691, sous la portée <Code>data-portee-app</Code>.
          </>
        }
        fil={{ label: 'Fil d’Ariane', etapes: [{ label: 'Terrain de jeu', href: '/fr/playground' }, { label: 'Vitrine' }] }}
        bandeau={
          <p data-epreuve="en-tete-bandeau" className="rounded-xl border border-border bg-card p-4 text-ui">
            Bandeau pleine largeur, au-dessus du titre.
          </p>
        }
        actions={
          <>
            <Button variant="outline">Exporter</Button>
            <Button>Nouveau bail</Button>
          </>
        }
        dessous={
          <Tabs defaultValue="apercu">
            <TabsList variant="line" data-epreuve="onglets-liste">
              <TabsTrigger value="apercu" data-epreuve="onglet-actif">Aperçu</TabsTrigger>
              <TabsTrigger value="documents" data-epreuve="onglet-inactif">
                Documents <TabsCount data-epreuve="onglet-compte">4</TabsCount>
              </TabsTrigger>
              <TabsTrigger value="historique">Historique</TabsTrigger>
            </TabsList>
            <TabsContent value="apercu" className="pt-4 text-ui text-encre-douce">Contenu de l’aperçu.</TabsContent>
            <TabsContent value="documents" className="pt-4 text-ui text-encre-douce">Quatre documents.</TabsContent>
            <TabsContent value="historique" className="pt-4 text-ui text-encre-douce">L’historique.</TabsContent>
          </Tabs>
        }
      />

      <Section titre="Pastilles de statut (six tons, trois surfaces)">
        <div className="grid gap-3 sm:grid-cols-3">
          {SURFACES_DE_PASTILLE.map(([nom, fond]) => (
            <div key={nom} data-surface={nom} className={`flex flex-wrap gap-2 rounded-xl border border-border p-3 ${fond}`}>
              {TONS.map(([ton, libelle]) => (
                <StatusBadge key={ton} tone={ton} label={libelle} data-testid={`pastille-${ton}-${nom}`} />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section titre="Cartes">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card data-epreuve="carte">
            <CardHeader filet data-epreuve="carte-en-tete">
              <CardTitle data-epreuve="carte-titre">Paiements à venir</CardTitle>
              <CardAction data-epreuve="carte-action">Tout voir</CardAction>
            </CardHeader>
            <CardContent className="text-ui text-encre-douce">Trois échéances cette semaine.</CardContent>
          </Card>
          <Card data-epreuve="carte-sans-filet">
            <CardHeader>
              <CardTitle>Sans filet</CardTitle>
            </CardHeader>
            <CardContent className="text-ui text-encre-douce">L’en-tête d’avant, pour les appelants existants.</CardContent>
          </Card>
        </div>
      </Section>

      <Section titre="Avatars (repli)">
        <div className="flex flex-wrap items-end gap-3">
          {TAILLES_AVATAR.map((taille) => (
            <Avatar key={taille} size={taille} data-epreuve={`avatar-${taille}`}>
              <AvatarFallback>AN</AvatarFallback>
            </Avatar>
          ))}
        </div>
      </Section>

      <Section titre="Chiffre clé et état vide">
        <div className="grid gap-4 sm:grid-cols-3">
          <div data-epreuve="chiffre" className="self-start">
            <StatCard
              variant="chiffre"
              label="Encaissé ce mois"
              value="95,2 M F"
              delta={{ label: '+8 % sur octobre', direction: 'up' }}
            />
          </div>
          <StatCard label="Ancienne tuile" value="73 %" hint="Variante par défaut" className="self-start" />
        </div>
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            variant="nue"
            className="py-16"
            data-epreuve="etat-vide-nu"
            icon={<BellOff className="size-6" strokeWidth={1.5} aria-hidden="true" />}
            title="Vous êtes à jour"
            description="Les nouvelles notifications apparaîtront ici."
          />
        </div>
      </Section>

      {/* TCK-2690 — les quatre primitives neuves. La feuille du bas ne s'ouvre EN FEUILLE que sous
          `md` : dès `md`, aucune maquette bureau n'en dessine, et le même contenu s'ouvre en panneau
          latéral droit de 480 px, modal (décision du porteur du 2026-11-11, TCK-2688). */}
      <Section titre="Feuille du bas (sous md ; panneau latéral modal dès md)">
        <div className="flex flex-wrap gap-3">
          <FeuilleDuBas
            data-epreuve="feuille-compte"
            titre="Mon compte"
            declencheur={
              <Button variant="outline" data-epreuve="ouvrir-feuille-compte">
                Mon compte
              </Button>
            }
          >
            <ul className="divide-y divide-border">
              {['Mon profil', 'Préférences', 'Changer d’espace', 'Se déconnecter'].map((ligne) => (
                <li key={ligne} className="flex min-h-12 items-center text-corps">
                  {ligne}
                </li>
              ))}
            </ul>
          </FeuilleDuBas>
          <FeuilleDuBas
            data-epreuve="feuille-longue"
            titre={TITRE_LONG}
            declencheur={
              <Button variant="outline" data-epreuve="ouvrir-feuille-longue">
                Titre long et action
              </Button>
            }
            pied={
              <Button size="xl" className="w-full" data-epreuve="feuille-action">
                Envoyer la relance
              </Button>
            }
          >
            <div className="space-y-3 text-ui text-encre-douce">
              {Array.from({ length: 24 }, (_, i) => (
                <p key={i}>Paragraphe {i + 1} : le corps défile, l’en-tête et le pied restent en place.</p>
              ))}
            </div>
          </FeuilleDuBas>
        </div>
        <p className="text-ui text-muted-foreground">
          Les déclencheurs : « Mon compte » (référence gelée <Code>app-coque</Code>, écran 5) et un titre de 80 caractères
          avec une action collante.
        </p>
      </Section>

      <PrimitivesDuLot2 />

      <PrimitivesNeuvesLot1 />

      <PleineLargeurAuTelephone />

      <Section titre="Cases à cocher (la ligne est la cible)">
        <div className="max-w-sm divide-y divide-border rounded-xl border border-border bg-card">
          <label data-epreuve="ligne-case-vide" className="flex min-h-12 items-center gap-3 px-4 text-corps">
            <Checkbox data-epreuve="case-vide" />
            Awa Ndiaye
          </label>
          <label className="flex min-h-12 items-center gap-3 px-4 text-corps">
            <Checkbox data-epreuve="case-cochee" defaultChecked />
            Moussa Diop
          </label>
          <label className="flex min-h-12 items-center gap-3 px-4 text-corps">
            <Checkbox data-epreuve="case-mixte" indeterminate />
            Tout sélectionner
          </label>
          <label className="flex min-h-12 items-center gap-3 px-4 text-corps text-muted-foreground">
            <Checkbox data-epreuve="case-desactivee" disabled />
            Désactivée
          </label>
          <label className="flex min-h-12 items-center gap-3 px-4 text-corps">
            <Checkbox data-epreuve="case-erreur" aria-invalid />
            En erreur
          </label>
        </div>
        <div className="flex gap-4 rounded-xl bg-background p-4">
          <Checkbox data-epreuve="case-vide-fond" aria-label="Case sur le fond de page" />
        </div>
      </Section>

      <Section titre="Interrupteurs (la ligne est la cible)">
        <div className="max-w-sm divide-y divide-border rounded-xl border border-border bg-card">
          <label className="flex min-h-14 items-center justify-between gap-3 px-4 text-corps">
            Rappels de visite
            <Switch data-epreuve="interrupteur-eteint" />
          </label>
          <label className="flex min-h-14 items-center justify-between gap-3 px-4 text-corps">
            Synchroniser l’agenda
            <Switch data-epreuve="interrupteur-allume" defaultChecked />
          </label>
          <label className="flex min-h-14 items-center justify-between gap-3 px-4 text-corps text-muted-foreground">
            Désactivé
            <Switch data-epreuve="interrupteur-desactive" disabled />
          </label>
        </div>
      </Section>

      <Section titre="Jauges">
        <div className="max-w-md space-y-4">
          {TONS_DE_JAUGE.map(([ton, valeur, libelle]) => (
            <div key={ton} className="space-y-1.5">
              <div className="flex justify-between text-ui">
                <span id={`jauge-${ton}`}>{libelle}</span>
                <span data-epreuve={`jauge-${ton}-valeur`} className="tabular-nums text-muted-foreground">
                  {valeur} %
                </span>
              </div>
              <Progress data-epreuve={`jauge-${ton}`} aria-labelledby={`jauge-${ton}`} value={valeur} ton={ton} />
            </div>
          ))}
          <Progress data-epreuve="jauge-grande" aria-label="Jauge grande" value={40} taille="grand" />
          <ProgressSegments
            data-epreuve="jauge-segments"
            aria-label="Étapes de la publication"
            aria-valuetext="Étape 2 sur 4"
            value={2}
            total={4}
          />
        </div>
      </Section>

      <Section titre="Échelle de texte (rem calculés, hors ×0,9)">
        <ul className="space-y-2">
          {ECHELLE.map(([nom, classe]) => (
            <li key={nom} className="flex items-baseline gap-4">
              <span className="w-28 shrink-0">
                <Code>{classe}</Code>
              </span>
              <span className="w-12 shrink-0 tabular-nums">
                <Code>{TAILLES_DE_TEXTE[nom]} px</Code>
              </span>
              {/* TCK-2689 — `min-w-0 truncate` : à 360, l'échantillon de 40 px (insécables) élargissait le
                  viewport à 377 et masquait tout débord de la vitrine. Sa taille ne change pas. */}
              <span data-jeton={classe} className={`min-w-0 truncate ${classe}`}>
                {ECHANTILLON}
              </span>
            </li>
          ))}
          <li className="flex items-baseline gap-4">
            <span className="w-28 shrink-0">
              <Code>text-sm</Code>
            </span>
            <span className="w-12 shrink-0" />
            <span data-jeton="text-sm" className="text-sm">
              {ECHANTILLON}
            </span>
          </li>
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <Code>parent leading-snug</Code>
            {/* AC2 — la structure de la maquette `app-agenda` (pièces, l. 203-205). */}
            <span data-epreuve="interligne-snug" className="block min-w-0 text-sm leading-snug">
              <span className="block font-semibold">8 séjours en cours</span>
              <span data-jeton="interligne-snug-enfant" className="block text-ui text-encre-douce">
                2 biens libres ce soir
              </span>
            </span>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <Code>parent sans interligne</Code>
            <span data-jeton="interligne-herite" className="block text-ui">
              2 biens libres ce soir
            </span>
          </div>
        </div>
      </Section>

      <Section titre="Espacement des lettres">
        <p data-jeton="tracking-titre" className="font-display text-affiche-22 font-semibold tracking-titre">
          Titre à −0,02 em
        </p>
        <p data-jeton="tracking-surtitre" className="text-legende font-medium uppercase tracking-surtitre text-encre-douce">
          Sur-titre à 0,08 em
        </p>
      </Section>

      <Section titre="Icônes (portée : 1,75 sous md, 1,5 dès md)">
        <div className="flex items-center gap-6">
          <Home data-icone="defaut" className="size-icone shrink-0" aria-hidden />
          <Search data-icone="defaut-2" className="size-icone shrink-0" aria-hidden />
          <Bell data-icone="explicite-2.5" className="size-icone shrink-0" strokeWidth={2.5} aria-hidden />
          <Code>size-icone · défaut · défaut · strokeWidth 2,5</Code>
        </div>
        <Dialog>
          <DialogTrigger render={<Button variant="outline" data-epreuve="ouvrir-dialogue" />}>
            <Check aria-hidden />
            Ouvrir un dialogue (portail)
          </DialogTrigger>
          <DialogContent data-epreuve="dialogue">
            <DialogHeader>
              <DialogTitle>Dans un portail</DialogTitle>
              <DialogDescription>La portée atteint le contenu rendu hors de l’arbre de la page.</DialogDescription>
            </DialogHeader>
            <Button data-epreuve="bouton-dans-dialogue">
              <Check data-icone="dans-dialogue" aria-hidden />
              Confirmer
            </Button>
          </DialogContent>
        </Dialog>
      </Section>

      {/* TCK-2686 — l'échelle de densité de `/app` : chaque taille, chaque variante, chaque champ. */}
      <Section titre="Contrôles — échelle de densité de /app (TCK-2686)">
        <div className="flex flex-wrap items-center gap-3">
          <Button data-epreuve="bouton-default">Enregistrer</Button>
          <Button size="sm" data-epreuve="bouton-sm">Modifier</Button>
          <Button size="xl" data-epreuve="bouton-xl">Créer le bail</Button>
          <Button size="icon" variant="ghost" aria-label="Plus d’actions" data-epreuve="bouton-icon">
            <MoreHorizontal aria-hidden />
          </Button>
          <Button size="lg" variant="outline" data-epreuve="bouton-lg">Taille lg</Button>
          <Button size="xs" variant="outline" data-epreuve="bouton-xs">Taille xs</Button>
          <Button size="icon-sm" variant="outline" aria-label="Ajouter" data-epreuve="bouton-icon-sm">
            <Plus aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button data-epreuve="variante-default">Principal</Button>
          <Button variant="outline" data-epreuve="variante-outline">Contour</Button>
          <Button variant="secondary" data-epreuve="variante-secondary">Confirmer</Button>
          <Button variant="ghost" data-epreuve="variante-ghost">Discret</Button>
          <Button variant="destructive" data-epreuve="variante-destructive">Supprimer</Button>
          <Button variant="sombre" data-epreuve="variante-sombre">Faire</Button>
          <Button variant="link" data-epreuve="variante-link">Lien</Button>
          <Button disabled data-epreuve="variante-desactive">Désactivé</Button>
        </div>
        {/* Une SURFACE sombre imbriquée relit les teintes du thème sombre (les alias sont redéclarés sur `.dark`). */}
        <div className="dark flex flex-wrap items-center gap-3 rounded-lg bg-background p-3 text-foreground">
          <Button variant="secondary" data-epreuve="surface-sombre-secondary">Confirmer</Button>
          <Button variant="ghost" data-epreuve="surface-sombre-ghost">Discret</Button>
          <Button variant="outline" data-epreuve="surface-sombre-outline">Contour</Button>
        </div>
        <Code>portée /app seule</Code>
        <Champs regime="app" />
        <Code>portée « confortable » sous la portée /app</Code>
        <div {...fieldDensityScope()}>
          <Champs regime="confortable" />
        </div>
        <Select>
          <SelectTrigger variante="filtre" data-epreuve="select-filtre" aria-label="Filtre de statut">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="actif">Actif</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section titre="Ombres nommées">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          {OMBRES.map(([nom, classe]) => (
            <div key={nom} data-jeton={classe} className={`flex h-20 items-end rounded-xl bg-card p-3 ${classe}`}>
              <Code>{classe}</Code>
            </div>
          ))}
        </div>
      </Section>

      <Section titre="Encres">
        <div className="grid gap-3 sm:grid-cols-4">
          <p data-jeton="encre-douce-card" className="rounded-lg bg-card p-3 text-corps text-encre-douce">
            Encre douce sur card
          </p>
          <p data-jeton="encre-douce-background" className="rounded-lg border border-border bg-background p-3 text-corps text-encre-douce">
            Encre douce sur background
          </p>
          <p data-jeton="encre-douce-muted" className="rounded-lg bg-muted p-3 text-corps text-encre-douce">
            Encre douce sur muted
          </p>
          <p data-jeton="encre-douce-inverse" className="rounded-lg bg-foreground p-3 text-corps text-encre-douce-inverse">
            Encre douce inverse
          </p>
        </div>
      </Section>

      <Section titre="Formats (useFormatteurs)">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-corps tabular-nums">
          <dt><Code>montantCourt</Code></dt>
          <dd data-format="montant-court">{f.montantCourt(1_355_000)}</dd>
          <dt><Code>montantAbrege</Code></dt>
          <dd data-format="montant-abrege">{f.montantAbrege(3_900_000)} · {f.montantAbrege(350_000)}</dd>
          <dt><Code>jourMois</Code></dt>
          <dd data-format="jour-mois">{f.jourMois(cetteAnnee)} · {f.jourMois(anneeDerniere)}</dd>
          <dt><Code>heure</Code></dt>
          <dd data-format="heure">{f.heure(new Date(Date.UTC(annee, 10, 4, 9)))}</dd>
          <dt><Code>pourcentage</Code></dt>
          <dd data-format="pourcentage">{f.pourcentage(0.87)}</dd>
          <dt><Code>montant</Code></dt>
          <dd data-format="montant">{f.montant(1_355_000)}</dd>
        </dl>
      </Section>

      <Section titre="Point de rupture w1440 (90rem)">
        <div data-epreuve="w1440" className="hidden w1440:flex">
          <Code>visible dès 1440 px</Code>
        </div>
        <div data-epreuve="sous-w1440" className="flex w1440:hidden">
          <Code>visible sous 1440 px</Code>
        </div>
      </Section>
    </div>
  );
}
