'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { ChevronDown, X } from 'lucide-react';

import { Sheet, SheetContent, SheetTitle, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

import type { EntreeDeSommaire } from './TexteJuridique';

/**
 * TCK-2516 — le suivi de lecture des pages légales : la partie en cours, au téléphone dans une
 * barre fine, au bureau dans le sommaire qui suit.
 *
 * **C'est une amélioration, pas une dépendance.** Les entrées du sommaire sont de vrais
 * `<a href="#partie-N">`, rendus par le serveur (un composant client l'est aussi) : sans
 * JavaScript, le sommaire et les ancres marchent, seul le surlignage manque (AC3).
 */

/**
 * Hauteur sous laquelle un titre est « passé » : la `Navbar` fixe (69 px au téléphone) plus la
 * barre de lecture (48 px), avec une marge — la même que `scroll-mt-32` des titres, pour qu'un
 * clic sur une entrée du sommaire rende cette entrée active, et non la précédente.
 */
const SEUIL_PX = 132;

interface Lecture {
  /** L'indice de la partie en cours, `-1` avant la première. */
  readonly index: number;
  /** La part du document déjà lue, de 0 à 1. */
  readonly progression: number;
}

export function usePartieEnCours(ancres: readonly string[]): Lecture {
  const [lecture, setLecture] = useState<Lecture>({ index: -1, progression: 0 });
  const cle = ancres.join(' ');

  useEffect(() => {
    const liste = cle === '' ? [] : cle.split(' ');
    let image = 0;
    const mesurer = () => {
      image = 0;
      let index = -1;
      for (let i = 0; i < liste.length; i++) {
        const titre = document.getElementById(liste[i]!);
        if (titre && titre.getBoundingClientRect().top <= SEUIL_PX) index = i;
        else if (titre) break;
      }
      const course = document.documentElement.scrollHeight - window.innerHeight;
      const progression = course > 0 ? Math.min(1, Math.max(0, window.scrollY / course)) : 0;
      setLecture((avant) =>
        avant.index === index && Math.abs(avant.progression - progression) < 0.005 ? avant : { index, progression },
      );
    };
    const planifier = () => {
      if (image === 0) image = requestAnimationFrame(mesurer);
    };
    mesurer();
    window.addEventListener('scroll', planifier, { passive: true });
    window.addEventListener('resize', planifier);
    return () => {
      window.removeEventListener('scroll', planifier);
      window.removeEventListener('resize', planifier);
      if (image !== 0) cancelAnimationFrame(image);
    };
  }, [cle]);

  return lecture;
}

export interface SommaireJuridiqueProps {
  readonly entrees: readonly EntreeDeSommaire[];
  /** Le sommaire du bureau, serré ; au téléphone, des rangées de 44 px au moins. */
  readonly compacte?: boolean;
  /**
   * Appelé au choix d'une entrée — la feuille du téléphone s'y ferme. Il reçoit l'événement : la
   * feuille l'empêche, puis va à l'ancre une fois fermée (cf. `BarreDeLecture`).
   */
  readonly onChoisir?: (evenement: MouseEvent<HTMLAnchorElement>, ancre: string) => void;
}

/** La liste des parties, chacune un lien vers son ancre ; la partie en cours porte `aria-current`. */
export function SommaireJuridique({ entrees, compacte = false, onChoisir }: SommaireJuridiqueProps) {
  const { index } = usePartieEnCours(entrees.map((e) => e.ancre));

  return (
    <ol className={cn(compacte ? 'space-y-0.5' : 'divide-y divide-border')}>
      {entrees.map((entree, i) => (
        <li key={entree.ancre}>
          <a
            href={`#${entree.ancre}`}
            onClick={onChoisir ? (evenement) => onChoisir(evenement, entree.ancre) : undefined}
            aria-current={i === index ? 'location' : undefined}
            className={cn(
              'block text-pretty text-foreground transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
              compacte
                ? 'rounded-lg px-3 py-1.5 text-sm hover:bg-muted aria-[current=location]:bg-secondary aria-[current=location]:font-medium aria-[current=location]:text-[var(--primary-deep)]'
                : 'flex min-h-11 items-center py-2.5 text-[15px] hover:text-primary aria-[current=location]:font-semibold aria-[current=location]:text-[var(--primary-deep)]',
            )}
          >
            {entree.titre}
          </a>
        </li>
      ))}
    </ol>
  );
}

export interface BarreDeLectureProps {
  readonly entrees: readonly EntreeDeSommaire[];
  readonly libelles: {
    readonly sommaire: string;
    readonly fermer: string;
    readonly partieEnCours: string;
  };
}

/**
 * Le repère du téléphone : une barre fine sous la `Navbar`, qui dit la partie en cours, avance
 * avec la lecture et rouvre le sommaire en feuille. Elle n'apparaît qu'une fois la première partie
 * atteinte — au-dessus, le sommaire repliable est encore à l'écran.
 *
 * ⚠ `fixed` et non `sticky` : une barre qui apparaît dans le flux pousserait le texte de 48 px au
 * moment même où le lecteur le lit.
 */
export function BarreDeLecture({ entrees, libelles }: BarreDeLectureProps) {
  const { index, progression } = usePartieEnCours(entrees.map((e) => e.ancre));
  const [ouverte, setOuverte] = useState(false);
  // L'ancre choisie dans la feuille : on n'y va qu'une fois la feuille FERMÉE. Ouverte, elle bloque
  // le défilement du document (verrou de base-ui), et le saut natif de l'ancre serait perdu.
  const [cible, setCible] = useState<string | null>(null);
  const visible = index >= 0;
  const partie = visible ? entrees[index] : undefined;

  return (
    <div
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
      className={cn(
        'fixed inset-x-0 top-[69px] z-40 border-b border-border bg-background/95 backdrop-blur-sm transition-[opacity,translate] duration-200 motion-reduce:transition-none lg:hidden',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
      )}
    >
      <div className="flex h-12 items-center gap-2 px-4" role="group" aria-label={libelles.partieEnCours}>
        <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">{partie?.titre}</p>
        <Sheet
          open={ouverte}
          onOpenChange={setOuverte}
          onOpenChangeComplete={(ouvert) => {
            if (ouvert) {
              // La partie en cours, à l'écran dès l'ouverture : la 17e est hors de la feuille.
              document
                .querySelector('[data-slot="sheet-content"] [aria-current="location"]')
                ?.scrollIntoView({ block: 'center' });
              return;
            }
            if (cible === null) return;
            window.history.pushState(null, '', `#${cible}`);
            document.getElementById(cible)?.scrollIntoView();
            setCible(null);
          }}
        >
          <SheetTrigger className="inline-flex h-9 flex-none items-center gap-1 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring">
            {libelles.sommaire}
            <ChevronDown className="size-4" aria-hidden="true" />
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl bg-background">
            <span className="mx-auto mt-3 h-1 w-10 flex-none rounded-full bg-border" aria-hidden="true" />
            <div className="flex flex-none items-center justify-between px-4 pb-1 pt-2">
              <SheetTitle className="font-display text-xl font-semibold tracking-[-0.02em] text-foreground">
                {libelles.sommaire}
              </SheetTitle>
              <SheetClose
                aria-label={libelles.fermer}
                className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                <X className="size-5" aria-hidden="true" />
              </SheetClose>
            </div>
            <nav aria-label={libelles.sommaire} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <SommaireJuridique
                entrees={entrees}
                onChoisir={(evenement, ancre) => {
                  evenement.preventDefault();
                  setCible(ancre);
                  setOuverte(false);
                }}
              />
            </nav>
          </SheetContent>
        </Sheet>
      </div>
      <div className="h-0.5 bg-border" aria-hidden="true">
        <div className="h-full origin-left bg-primary" style={{ transform: `scaleX(${progression})` }} />
      </div>
    </div>
  );
}
