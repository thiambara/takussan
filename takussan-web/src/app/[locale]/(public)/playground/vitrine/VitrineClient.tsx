'use client';

import { Bell, BellOff, Check, Home, MoreHorizontal, Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { PageHeader, StatCard, StatusBadge, type StatusTone } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Avatar, AvatarFallback, type TailleAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DatePicker } from '@/components/ui/date-picker';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { fieldDensityScope } from '@/components/ui/field-density';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
              <span data-jeton={classe} className={classe}>
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
