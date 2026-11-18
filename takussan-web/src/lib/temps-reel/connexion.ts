/**
 * TCK-2954 (ADR-0129 § 4) — la connexion Laravel Echo vers Reverb, et le SEUL module qui importe
 * `laravel-echo` et `pusher-js`.
 *
 * ⚠ **Il n'est atteint que par `import()`**, depuis `TempsReelProvider`, et seulement quand
 * `TEMPS_REEL_URL` et `TEMPS_REEL_CLE` sont posées, hors impersonation et sous une session : sans
 * temps réel, ni Echo ni Pusher ne sont téléchargés. Tout autre fichier n'en importe que des types.
 *
 * Il expose une {@link ConnexionTempsReel} réduite à ce dont le fournisseur a besoin — écouter le
 * signal d'un canal privé, rejoindre un canal de présence, suivre l'état de la connexion, fermer —
 * pour que le reste du front ignore Echo.
 */
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import type { ChannelAuthorizationCallback } from 'pusher-js';
import { apiRequest } from '@/lib/api';

/** La réponse de `/api/broadcasting/auth` (forme de Pusher ; `channel_data` pour la présence). */
type DonneesDAutorisation = Parameters<ChannelAuthorizationCallback>[1] & {};

/** L'état de la connexion, tel que le fournisseur le juge. */
export type EtatDeConnexion = 'connexion' | 'tenue' | 'perdue';

export type ConnexionTempsReel = {
  /** S'abonne au canal privé `canal` (sans préfixe) et rappelle `surSignal` avec la charge brute de chaque `signal`. */
  ecouter(
    canal: string,
    rappels: { readonly surSignal: (brut: unknown) => void; readonly surAbonnement: (accepte: boolean) => void },
  ): void;
  /** Quitte le canal privé `canal`. */
  quitter(canal: string): void;
  /**
   * Rejoint le canal de présence `canal` (sans préfixe) ; `surMembres` reçoit les identifiants présents.
   * TCK-2955 — `surEcriture` reçoit l'identifiant de qui « écrit » (message éphémère `client-ecrit`), tel que
   * le SERVEUR l'a posé (`user_id`, ADR-0129 § 2), jamais tel que l'émetteur le prétend.
   */
  rejoindre(canal: string, surMembres: (ids: readonly number[]) => void, surEcriture?: (id: number) => void): void;
  /**
   * TCK-2955 — émet le message éphémère « écrit » sur le canal de présence `canal` (déjà rejoint), de
   * navigateur à navigateur : aucune route de l'API ne le reçoit, le serveur ne le stocke pas.
   */
  chuchoter(canal: string): void;
  /** Quitte le canal de présence `canal`. */
  quitterPresence(canal: string): void;
  /** Suit l'état de la connexion ; rend la fonction qui cesse de le suivre. */
  surEtat(rappel: (etat: EtatDeConnexion) => void): () => void;
  /** Ferme la connexion et tous ses canaux. Définitif. */
  fermer(): void;
};

export type ParametresDeConnexion = {
  /** L'origine WebSocket : `ws://127.0.0.1:8081`, `wss://temps-reel.exemple.test`. */
  readonly url: string;
  /** La clé publique de l'application Reverb. */
  readonly cle: string;
  /** Le jeton Sanctum de la session : l'autorisation de chaque canal le porte. */
  readonly jeton: string;
};

/** Le nom de l'événement : `SignalTempsReel::broadcastAs()` rend `signal` ; le point évite l'espace de noms `App.Events`. */
const EVENEMENT = '.signal';

/** `ws://hote:port` → les options d'hôte de Pusher. Le port par défaut suit le schéma. */
export function optionsDHote(url: string): { wsHost: string; wsPort: number; wssPort: number; forceTLS: boolean } {
  const analysee = new URL(url);
  const chiffre = analysee.protocol === 'wss:';
  const port = analysee.port ? Number(analysee.port) : chiffre ? 443 : 80;
  return { wsHost: analysee.hostname, wsPort: port, wssPort: port, forceTLS: chiffre };
}

/**
 * TCK-2955 — le nom du message éphémère « en train d'écrire » (`client-ecrit` sur le fil). Sa charge est vide :
 * l'auteur se lit dans `user_id`, que Reverb pose depuis la donnée de présence du serveur.
 */
export const EVENEMENT_D_ECRITURE = 'ecrit';

/** TCK-2955 — l'auteur d'un message éphémère : `user_id` des métadonnées de Pusher (chaîne ou nombre). */
export function auteurDuChuchotement(metadonnees: unknown): number | null {
  const brut = typeof metadonnees === 'object' && metadonnees !== null ? (metadonnees as { user_id?: unknown }).user_id : undefined;
  const id = typeof brut === 'string' && /^[1-9][0-9]{0,17}$/.test(brut) ? Number(brut) : brut;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** L'identifiant d'un membre de présence : l'API ne publie que `{id}` (TCK-2952). */
function idDuMembre(membre: unknown): number | null {
  const id = typeof membre === 'object' && membre !== null ? (membre as { id?: unknown }).id : undefined;
  return typeof id === 'number' && Number.isInteger(id) ? id : null;
}

function etatDe(statut: string): EtatDeConnexion {
  if (statut === 'connected') return 'tenue';
  if (statut === 'connecting') return 'connexion';
  return 'perdue';
}

export function ouvrirConnexion({ url, cle, jeton }: ParametresDeConnexion): ConnexionTempsReel {
  const echo = new Echo({
    broadcaster: 'reverb',
    key: cle,
    ...optionsDHote(url),
    enabledTransports: ['ws', 'wss'],
    Pusher,
    // Aucun intercepteur axios/jQuery/Vue/Turbo : ce front n'en a pas, et rien ne doit en poser.
    withoutInterceptors: true,
    // ADR-0129 § 4 — `POST /api/broadcasting/auth` par `apiRequest`, avec le jeton de CETTE session (jamais
    // celui du contexte au moment de l'appel) et le profil actif en `X-Active-Profile-Hint`. Le chemin commence
    // par `/api` : c'est Laravel, pas un route handler du BFF.
    channelAuthorization: {
      customHandler: (
        { socketId, channelName }: { socketId: string; channelName: string },
        rappel: ChannelAuthorizationCallback,
      ) => {
        apiRequest<DonneesDAutorisation>('/api/broadcasting/auth', {
          method: 'POST',
          token: jeton,
          body: { socket_id: socketId, channel_name: channelName },
        }).then(
          (donnees) => rappel(null, donnees),
          (erreur: unknown) => rappel(erreur instanceof Error ? erreur : new Error(String(erreur)), null),
        );
      },
    },
  });

  return {
    ecouter(canal, { surSignal, surAbonnement }) {
      echo
        .private(canal)
        .listen(EVENEMENT, (charge: unknown) => surSignal(charge))
        .subscribed(() => surAbonnement(true))
        .error(() => surAbonnement(false));
    },
    quitter(canal) {
      echo.leaveChannel(`private-${canal}`);
    },
    rejoindre(canal, surMembres, surEcriture) {
      const presents = new Set<number>();
      const publier = () => surMembres([...presents].sort((a, b) => a - b));
      const presence = echo.join(canal);
      // TCK-2955 — le second argument de Pusher porte `user_id` sur un événement client d'un canal de présence.
      if (surEcriture) {
        presence.listenForWhisper(EVENEMENT_D_ECRITURE, (_charge: unknown, metadonnees?: unknown) => {
          const auteur = auteurDuChuchotement(metadonnees);
          if (auteur !== null) surEcriture(auteur);
        });
      }
      presence
        .here((membres: unknown[]) => {
          presents.clear();
          for (const membre of membres) {
            const id = idDuMembre(membre);
            if (id !== null) presents.add(id);
          }
          publier();
        })
        .joining((membre: unknown) => {
          const id = idDuMembre(membre);
          if (id !== null) presents.add(id);
          publier();
        })
        .leaving((membre: unknown) => {
          const id = idDuMembre(membre);
          if (id !== null) presents.delete(id);
          publier();
        });
    },
    chuchoter(canal) {
      echo.join(canal).whisper(EVENEMENT_D_ECRITURE, {});
    },
    quitterPresence(canal) {
      echo.leaveChannel(`presence-${canal}`);
    },
    surEtat(rappel) {
      return echo.connector.onConnectionChange((statut: string) => rappel(etatDe(statut)));
    },
    fermer() {
      echo.leaveAllChannels();
      echo.disconnect();
    },
  };
}
