/**
 * TCK-2954 — un faux Laravel Echo, de la FORME d'Echo (et non de notre adaptateur) : `connexion.ts`,
 * le seul code qui parle à Echo, est ainsi exercé par les tests.
 *
 * Il reproduit ce dont dépend l'adaptateur, relevé sur `laravel-echo@2.6.3` :
 * · `private(nom)` → `private-{nom}`, `join(nom)` → `presence-{nom}` (le préfixe est ajouté par Echo) ;
 * · `listen('.signal', …)`, `subscribed(…)`, `error(…)`, `here/joining/leaving(…)`, chaînables ;
 * · l'autorisation d'un canal par `channelAuthorization.customHandler` de Pusher, au premier accès ;
 * · `connector.onConnectionChange(…)` (statuts d'Echo : `connected`, `connecting`, `failed`…) ;
 * · `leaveChannel`, `leaveAllChannels`, `disconnect`.
 *
 * Aucun serveur, aucune socket.
 */
type Rappel = (...args: unknown[]) => void;

type Autorisation = (
  params: { socketId: string; channelName: string },
  rappel: (erreur: Error | null, donnees: unknown) => void,
) => void;

export class FauxCanal {
  readonly ecouteurs = new Map<string, Set<Rappel>>();
  private readonly surAbonne: Rappel[] = [];
  private readonly surErreur: Rappel[] = [];
  private readonly surIci: Rappel[] = [];
  private readonly surArrivee: Rappel[] = [];
  private readonly surDepart: Rappel[] = [];
  autorise: boolean | null = null;

  constructor(readonly nom: string) {}

  listen(evenement: string, rappel: Rappel) {
    let rappels = this.ecouteurs.get(evenement);
    if (!rappels) this.ecouteurs.set(evenement, (rappels = new Set()));
    rappels.add(rappel);
    return this;
  }
  subscribed(rappel: Rappel) {
    this.surAbonne.push(rappel);
    return this;
  }
  error(rappel: Rappel) {
    this.surErreur.push(rappel);
    return this;
  }
  here(rappel: Rappel) {
    this.surIci.push(rappel);
    return this;
  }
  joining(rappel: Rappel) {
    this.surArrivee.push(rappel);
    return this;
  }
  leaving(rappel: Rappel) {
    this.surDepart.push(rappel);
    return this;
  }

  /** Ce que fait Pusher à la réponse de l'autorisation. */
  repondre(erreur: Error | null) {
    this.autorise = erreur === null;
    if (erreur) for (const r of this.surErreur) r({ type: 'AuthError', status: 403 });
    else for (const r of this.surAbonne) r();
  }

  /** Simule l'arrivée d'un événement serveur. */
  emettre(evenement: string, charge: unknown) {
    for (const r of this.ecouteurs.get(evenement) ?? []) r(charge);
  }

  membres(ids: number[]) {
    for (const r of this.surIci) r(ids.map((id) => ({ id })));
  }
  arrivee(id: number) {
    for (const r of this.surArrivee) r({ id });
  }
  depart(id: number) {
    for (const r of this.surDepart) r({ id });
  }
}

export const instances: FauxEcho[] = [];
export const constructions: unknown[] = [];

export function reinitialiser() {
  instances.length = 0;
  constructions.length = 0;
}

export class FauxEcho {
  readonly canaux = new Map<string, FauxCanal>();
  readonly quittes: string[] = [];
  deconnecte = false;
  private readonly suiveurs = new Set<(statut: string) => void>();
  readonly connector = {
    onConnectionChange: (rappel: (statut: string) => void) => {
      this.suiveurs.add(rappel);
      return () => {
        this.suiveurs.delete(rappel);
      };
    },
  };

  constructor(readonly options: Record<string, unknown>) {
    constructions.push(options);
    instances.push(this);
  }

  private canal(nom: string): FauxCanal {
    let canal = this.canaux.get(nom);
    if (!canal) {
      const neuf = new FauxCanal(nom);
      canal = neuf;
      this.canaux.set(nom, neuf);
      const autoriser = (this.options.channelAuthorization as { customHandler: Autorisation }).customHandler;
      autoriser({ socketId: '123.456', channelName: nom }, (erreur) => neuf.repondre(erreur));
    }
    return canal;
  }

  private(nom: string) {
    return this.canal(`private-${nom}`);
  }
  join(nom: string) {
    return this.canal(`presence-${nom}`);
  }
  leaveChannel(nom: string) {
    this.quittes.push(nom);
    this.canaux.delete(nom);
  }
  leaveAllChannels() {
    for (const nom of [...this.canaux.keys()]) this.leaveChannel(nom);
  }
  disconnect() {
    this.deconnecte = true;
  }

  /** Simule un changement d'état de la connexion (statuts d'Echo). */
  statut(statut: 'connected' | 'connecting' | 'disconnected' | 'failed') {
    for (const r of [...this.suiveurs]) r(statut);
  }
}
