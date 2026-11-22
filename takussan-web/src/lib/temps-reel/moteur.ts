/**
 * TCK-2954 (ADR-0129 § 4) — le moteur du temps réel d'un onglet, hors de React.
 *
 * Il tient trois choses, et `TempsReelProvider` n'en fait que le branchement :
 *
 * · le **registre des abonnements** des écrans, par canal — il survit aux connexions : un écran
 *   monté avant que la connexion soit prête, ou pendant qu'elle est perdue, est branché dès qu'elle
 *   l'est ;
 * · la **connexion courante**, une seule, propre à une session. {@link MoteurTempsReel.brancher} la
 *   remplace : l'ancienne est fermée, ses curseurs et l'état de ses canaux oubliés, et plus rien de ce
 *   qu'elle reçoit encore n'atteint un écran ;
 * · l'**état** que lisent les intervalles de relecture : celui de la connexion, et celui de chaque
 *   canal — un canal refusé (403 à l'autorisation : agence suspendue, objet illisible) laisse ses
 *   écrans à leur intervalle d'aujourd'hui, même sous une connexion tenue.
 */
import type { ConnexionTempsReel, EtatDeConnexion } from './connexion';
import { Curseurs, lireSignal, sujetDuCanal, type SignalTempsReel } from './signal';

/** Ce qu'un écran reçoit : un signal, ou `null` à la reconnexion — « tout a pu changer, relisez ». */
export type RappelDuSignal = (signal: SignalTempsReel | null) => void;

/** L'état d'un canal sur la connexion courante. */
export type EtatDuCanal = 'en_attente' | 'abonne' | 'refuse';

export type EtatDuTempsReel = {
  /** `inactif` : aucune connexion (sans clé, sans session, sous impersonation, ou pas encore chargée). */
  readonly connexion: EtatDeConnexion | 'inactif';
  readonly canaux: ReadonlyMap<string, EtatDuCanal>;
};

export const ETAT_INACTIF: EtatDuTempsReel = Object.freeze({ connexion: 'inactif', canaux: new Map() });

export class MoteurTempsReel {
  private readonly abonnes = new Map<string, Set<RappelDuSignal>>();
  private readonly presences = new Map<string, { abonnes: Set<(ids: readonly number[]) => void>; ids: readonly number[] }>();
  /** TCK-2955 — qui écoute les messages éphémères « écrit » d'un canal de présence. */
  private readonly ecritures = new Map<string, Set<(id: number) => void>>();
  private connexion: ConnexionTempsReel | null = null;
  private cesserDeSuivre: (() => void) | null = null;
  private curseurs = new Curseurs();
  private etat: EtatDuTempsReel = ETAT_INACTIF;
  private readonly ecouteurs = new Set<() => void>();

  // ── l'état, pour `useSyncExternalStore` ─────────────────────────────────────────────────────

  readonly lire = (): EtatDuTempsReel => this.etat;

  readonly suivre = (ecouteur: () => void): (() => void) => {
    this.ecouteurs.add(ecouteur);
    return () => {
      this.ecouteurs.delete(ecouteur);
    };
  };

  private poser(etat: EtatDuTempsReel): void {
    this.etat = etat;
    for (const ecouteur of this.ecouteurs) ecouteur();
  }

  private poserCanal(canal: string, etatDuCanal: EtatDuCanal | null): void {
    const canaux = new Map(this.etat.canaux);
    if (etatDuCanal === null) canaux.delete(canal);
    else canaux.set(canal, etatDuCanal);
    this.poser({ connexion: this.etat.connexion, canaux });
  }

  // ── la connexion ────────────────────────────────────────────────────────────────────────────

  /**
   * Remplace la connexion courante par `connexion` (ou par aucune). L'ancienne est fermée et ses
   * curseurs oubliés ; tous les canaux du registre sont rebranchés sur la nouvelle.
   */
  brancher(connexion: ConnexionTempsReel | null): void {
    const ancienne = this.connexion;
    this.cesserDeSuivre?.();
    this.cesserDeSuivre = null;
    this.connexion = null;
    ancienne?.fermer();
    this.curseurs = new Curseurs();
    for (const presence of this.presences.values()) presence.ids = [];

    if (!connexion) {
      this.poser(ETAT_INACTIF);
      this.publierPresences();
      return;
    }

    this.connexion = connexion;
    this.poser({ connexion: 'connexion', canaux: new Map() });
    let precedent: EtatDeConnexion = 'connexion';
    let dejaTenue = false;
    this.cesserDeSuivre = connexion.surEtat((etat) => {
      if (this.connexion !== connexion || etat === precedent) return;
      precedent = etat;
      this.poser({ connexion: etat, canaux: this.etat.canaux });
      if (etat !== 'tenue') return;
      // ADR-0129 § 4 — à la RECONNEXION, une relecture immédiate de chaque sujet abonné : ce qui a
      // changé pendant la coupure n'a produit aucun signal reçu. Pas à la première connexion : l'écran
      // vient de lire.
      if (dejaTenue) this.rejouer();
      dejaTenue = true;
    });
    for (const canal of this.abonnes.keys()) this.ecouterSur(connexion, canal);
    for (const canal of this.presences.keys()) this.rejoindreSur(connexion, canal);
  }

  /** Ferme la connexion courante (démontage du fournisseur, fin de session). */
  fermer(): void {
    this.brancher(null);
  }

  private rejouer(): void {
    for (const rappels of this.abonnes.values()) {
      for (const rappel of [...rappels]) rappel(null);
    }
  }

  private ecouterSur(connexion: ConnexionTempsReel, canal: string): void {
    const sujet = sujetDuCanal(canal);
    this.poserCanal(canal, 'en_attente');
    connexion.ecouter(canal, {
      surSignal: (brut) => {
        // Une connexion remplacée n'atteint plus aucun écran : la session suivante n'hérite de rien.
        if (this.connexion !== connexion) return;
        const signal = lireSignal(brut);
        if (!signal) return;
        // Sur `sujet.{type}.{id}`, seul ce sujet. Sur le canal personnel, l'objet qui a changé.
        if (sujet !== null && signal.subject !== sujet) return;
        // Un signal plus ancien ou égal au dernier vu, pour ce canal et ce couple, est ignoré.
        if (!this.curseurs.retenir(canal, signal)) return;
        for (const rappel of [...(this.abonnes.get(canal) ?? [])]) rappel(signal);
      },
      surAbonnement: (accepte) => {
        if (this.connexion !== connexion || !this.abonnes.has(canal)) return;
        this.poserCanal(canal, accepte ? 'abonne' : 'refuse');
      },
    });
  }

  private rejoindreSur(connexion: ConnexionTempsReel, canal: string): void {
    connexion.rejoindre(
      canal,
      (ids) => {
        const presence = this.presences.get(canal);
        if (this.connexion !== connexion || !presence) return;
        presence.ids = ids;
        for (const abonne of [...presence.abonnes]) abonne(ids);
      },
      // TCK-2955 — un message éphémère « écrit » : seulement sur la connexion courante, et tant que le canal
      // de présence est rejoint.
      (id) => {
        if (this.connexion !== connexion || !this.presences.has(canal)) return;
        for (const rappel of [...(this.ecritures.get(canal) ?? [])]) rappel(id);
      },
    );
  }

  private publierPresences(): void {
    for (const presence of this.presences.values()) {
      for (const abonne of [...presence.abonnes]) abonne(presence.ids);
    }
  }

  // ── les abonnements des écrans ──────────────────────────────────────────────────────────────

  /** Abonne `rappel` au canal privé `canal` (sans préfixe) ; rend la fonction qui le désabonne. */
  abonner(canal: string, rappel: RappelDuSignal): () => void {
    let rappels = this.abonnes.get(canal);
    if (!rappels) {
      rappels = new Set();
      this.abonnes.set(canal, rappels);
      if (this.connexion) this.ecouterSur(this.connexion, canal);
    }
    rappels.add(rappel);
    return () => {
      const courants = this.abonnes.get(canal);
      if (!courants?.delete(rappel) || courants.size > 0) return;
      this.abonnes.delete(canal);
      if (this.connexion) {
        this.connexion.quitter(canal);
        this.poserCanal(canal, null);
      }
    };
  }

  /** Les identifiants présents sur le canal de présence `canal` ; `[]` sans connexion. */
  presents(canal: string): readonly number[] {
    return this.presences.get(canal)?.ids ?? [];
  }

  /**
   * TCK-2955 — écoute les messages éphémères « écrit » du canal de présence `canal` (que l'écran rejoint par
   * {@link MoteurTempsReel.rejoindre}) ; rend la fonction qui cesse d'écouter.
   */
  ecouterEcriture(canal: string, rappel: (id: number) => void): () => void {
    let rappels = this.ecritures.get(canal);
    if (!rappels) this.ecritures.set(canal, (rappels = new Set()));
    rappels.add(rappel);
    return () => {
      const courants = this.ecritures.get(canal);
      if (courants?.delete(rappel) && courants.size === 0) this.ecritures.delete(canal);
    };
  }

  /**
   * TCK-2955 — émet « écrit » sur le canal de présence `canal`, s'il est rejoint sur une connexion TENUE ;
   * `false` sinon (sans connexion — sans clé, sous impersonation —, perdue, ou canal quitté) : rien ne part.
   */
  signalerEcriture(canal: string): boolean {
    if (!this.connexion || this.etat.connexion !== 'tenue' || !this.presences.has(canal)) return false;
    this.connexion.chuchoter(canal);
    return true;
  }

  /** Rejoint le canal de présence `canal` (sans préfixe) ; rend la fonction qui le quitte. */
  rejoindre(canal: string, surMembres: (ids: readonly number[]) => void): () => void {
    let presence = this.presences.get(canal);
    if (!presence) {
      presence = { abonnes: new Set(), ids: [] };
      this.presences.set(canal, presence);
      if (this.connexion) this.rejoindreSur(this.connexion, canal);
    }
    presence.abonnes.add(surMembres);
    return () => {
      const courante = this.presences.get(canal);
      if (!courante?.abonnes.delete(surMembres) || courante.abonnes.size > 0) return;
      this.presences.delete(canal);
      this.connexion?.quitterPresence(canal);
    };
  }
}
