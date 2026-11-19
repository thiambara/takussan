/**
 * TCK-2968 (ADR-0128 § 7) — les règles de la boîte de pilotage que le FRONT tient : le délai d'un fil
 * « À vous », le motif d'un fil « En attente », et les choix courts de « Rappelez-le-moi ». La file
 * elle-même ne se calcule jamais ici : l'API la dérive pour le lecteur (`FileDuFil`, TCK-2967).
 *
 * Fonctions pures, horloge injectée : un test fige l'instant sans minuterie factice.
 */
import type { Conversation, FileDuFil } from '@/types/message';

/**
 * Au-delà de ce délai, un fil « À vous » est dit « dépassé » (encre d'alerte). Décision du porteur du
 * 2026-11-18 (2a) : 4 h, une constante du front — un délai réglable par agence est hors périmètre.
 */
export const DELAI_DEPASSE_MS = 4 * 60 * 60 * 1000;

/** Les puces de pilotage, dans l'ordre de la maquette `fil-boite` D (sans « Retard » avant le lot 3). */
export const PUCES_DE_PILOTAGE = ['tous', 'nonLus', 'vous', 'attente', 'rappel'] as const;
export type PuceDePilotage = (typeof PUCES_DE_PILOTAGE)[number];

/** La file que la puce demande au SERVEUR (`filter[file]`), ou `null` (Tous, Non lus). */
export function fileDeLaPuce(puce: PuceDePilotage): FileDuFil | null {
  return puce === 'vous' || puce === 'attente' || puce === 'rappel' ? puce : null;
}

export type DelaiDuFil = {
  /** `minutes` sous l'heure, `heures` sous le jour, `jours` au-delà. */
  readonly unite: 'minutes' | 'heures' | 'jours';
  readonly n: number;
  /** Les minutes au-delà de l'heure pleine (`heures` seulement). */
  readonly reste: number;
  readonly depasse: boolean;
};

/** Le délai d'un fil « À vous » depuis `attend_depuis` ; `null` sans date lisible. */
export function delaiDuFil(attendDepuis: string | null | undefined, maintenant: Date): DelaiDuFil | null {
  if (!attendDepuis) return null;
  const depuis = Date.parse(attendDepuis);
  if (Number.isNaN(depuis)) return null;
  const ecoule = Math.max(0, maintenant.getTime() - depuis);
  const minutes = Math.floor(ecoule / 60_000);
  const depasse = ecoule > DELAI_DEPASSE_MS;
  if (minutes < 60) return { unite: 'minutes', n: Math.max(1, minutes), reste: 0, depasse };
  if (minutes < 24 * 60) return { unite: 'heures', n: Math.floor(minutes / 60), reste: minutes % 60, depasse };
  return { unite: 'jours', n: Math.floor(minutes / (24 * 60)), reste: 0, depasse };
}

/**
 * Les NOMS des participants qu'un fil « En attente » attend : `en_attente_de` porte des identifiants, que
 * l'écran nomme d'après les participants actifs qu'il a lus. Un identifiant sans nom connu est ignoré :
 * jamais un identifiant à l'écran.
 */
export function nomsAttendus(conversation: Pick<Conversation, 'en_attente_de' | 'participants'>): string[] {
  const noms = new Map(
    (conversation.participants ?? [])
      .filter((p) => !p.left_at && p.user?.full_name)
      .map((p) => [p.user_id, p.user!.full_name] as const),
  );
  return (conversation.en_attente_de ?? []).flatMap((id) => {
    const nom = noms.get(id);
    return nom ? [nom] : [];
  });
}

export type CleDeRappel = 'uneHeure' | 'ceSoir' | 'demainMatin' | 'lundi';
export type ChoixDeRappel = { readonly cle: CleDeRappel; readonly jusqua: Date };

const HEURE_MS = 60 * 60 * 1000;

/** `jour` à `heure`:00, en heure de Dakar. */
function a(jour: Date, decalageJours: number, heure: number): Date {
  return new Date(Date.UTC(jour.getUTCFullYear(), jour.getUTCMonth(), jour.getUTCDate() + decalageJours, heure, 0, 0));
}

/**
 * Les choix courts de « Rappelez-le-moi » : dans 1 h, ce soir (18 h), demain matin (9 h), lundi (9 h).
 *
 * **Le fuseau est figé à `Africa/Dakar`** (UTC+0, sans heure d'été) : l'heure de Dakar EST l'heure UTC, d'où
 * les champs `UTC` ci-dessous. L'API exige un instant FUTUR (`after:now`) à 30 jours au plus
 * (`SnoozeConversationRequest`) : « ce soir » disparaît à moins d'une heure de 18 h (il ne dirait rien de
 * plus que « dans 1 h »), et « lundi » quand il tombe demain (il doublerait « demain matin »).
 */
export function choixDeRappel(maintenant: Date): ChoixDeRappel[] {
  const choix: ChoixDeRappel[] = [{ cle: 'uneHeure', jusqua: new Date(maintenant.getTime() + HEURE_MS) }];
  const ceSoir = a(maintenant, 0, 18);
  if (ceSoir.getTime() - maintenant.getTime() > HEURE_MS) choix.push({ cle: 'ceSoir', jusqua: ceSoir });
  choix.push({ cle: 'demainMatin', jusqua: a(maintenant, 1, 9) });
  const jusquALundi = (8 - maintenant.getUTCDay()) % 7 || 7;
  if (jusquALundi > 1) choix.push({ cle: 'lundi', jusqua: a(maintenant, jusquALundi, 9) });
  return choix;
}
