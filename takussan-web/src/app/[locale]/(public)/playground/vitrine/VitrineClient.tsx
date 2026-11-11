'use client';

import { Bell, Check, Home, Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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

export function VitrineClient() {
  const f = useFormatteurs();
  const annee = new Date().getUTCFullYear();
  const cetteAnnee = new Date(Date.UTC(annee, 10, 4, 10));
  const anneeDerniere = new Date(Date.UTC(annee - 1, 11, 4, 10));

  return (
    <div data-portee-app="" className="mx-auto max-w-5xl space-y-8 bg-background px-4 py-8">
      <header className="space-y-1">
        <h1 className="font-display text-affiche-22 font-semibold tracking-titre">Vitrine de la partie connectée</h1>
        <p className="text-ui text-encre-douce">
          Jetons de TCK-2685, puis primitives de TCK-2686 à TCK-2691, sous la portée <Code>data-portee-app</Code>.
        </p>
      </header>

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
