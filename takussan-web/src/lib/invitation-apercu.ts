import { ApiError, apiRequest } from './api';
import { cheminApi } from './chemin-api';

/**
 * TCK-2611 (ADR-0094 § 1-3) — ce que l'invité lit de son invitation AVANT de rien donner :
 * `GET /api/public/invitations/{token}` (TCK-2609), lu au rendu serveur.
 *
 * ⚠ **Lecture seule, et rien de plus** : le `GET` n'écrit ni « vu » ni statut, et la page n'émet
 * aucune requête qui accepte au rendu (contrainte 2 de TCK-610).
 *
 * Trois issues, jamais deux : un 404 seul dit « lien inconnu », un 410 seul dit « fermé » (expiré,
 * annulé, accepté). Un 429 (30 lectures par minute et par IP), un 5xx ou une panne réseau ne disent
 * RIEN de l'invitation : la page propose de réessayer, sans formulaire.
 */
export type RoleDInvitation =
  | 'owner'
  | 'tenant'
  | 'agent'
  | 'agent_senior'
  | 'agent_manager'
  | 'agency_admin'
  | 'service_provider'
  | 'super_admin'
  | (string & {});

export interface AgenceDeLInvitation {
  readonly nom: string;
  readonly logo: string | null;
  /** La ville seule (ADR-0094 § 3) : jamais la rue ni le quartier. */
  readonly ville: string | null;
  /** Le portefeuille public, comme la fiche publique de l'agence. */
  readonly biensPublics: number | null;
  readonly verifiee: boolean;
  /** Public pour une agence active et standard seulement ; sinon `null`. */
  readonly telephone: string | null;
}

export interface ApercuDInvitation {
  readonly role: RoleDInvitation;
  readonly agence: AgenceDeLInvitation | null;
  /** Le PRÉNOM seul de qui invite (ADR-0094 § 3). */
  readonly invitant: string | null;
  /** Le destinataire masqué (« m•••@gmail.com », « 77 ••• 45 67 ») et son canal. */
  readonly destinataire: { readonly canal: 'email' | 'phone'; readonly masque: string } | null;
  /** Un compte existe pour ce destinataire (même résolution que l'acceptation). */
  readonly compteExistant: boolean;
  readonly expireLe: string | null;
  readonly inviteeLe: string | null;
  /** Le nom que l'agence a saisi, à confirmer ou corriger par l'invité. */
  readonly prerempli: { readonly prenom: string; readonly nom: string };
  /** Ce qui attend l'invité : les biens liés au bailleur, l'intervention du prestataire. */
  readonly attente: {
    readonly biens: number | null;
    readonly intervention: { readonly titre: string; readonly bien: string | null } | null;
  };
}

export type EtatFerme = 'expiree' | 'annulee' | 'acceptee';

export interface InvitationFermee {
  readonly etat: EtatFerme;
  readonly agence: { readonly nom: string; readonly logo: string | null; readonly telephone: string | null } | null;
  readonly inviteeLe: string | null;
}

export type LectureDInvitation =
  | { readonly issue: 'valide'; readonly apercu: ApercuDInvitation }
  | { readonly issue: 'fermee'; readonly fermee: InvitationFermee }
  | { readonly issue: 'inconnue' }
  | { readonly issue: 'indisponible' };

const ETATS_FERMES: Readonly<Record<string, EtatFerme>> = {
  'invitation.token_expired': 'expiree',
  'invitation.token_revoked': 'annulee',
  'invitation.token_accepted': 'acceptee',
};

type Objet = Record<string, unknown>;

const objet = (v: unknown): Objet | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objet) : null);
const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function agence(brut: unknown): AgenceDeLInvitation | null {
  const a = objet(brut);
  const nom = texte(a?.name);
  if (!a || !nom) return null;
  return {
    nom,
    logo: texte(a.logo_url),
    ville: texte(a.city),
    biensPublics: nombre(a.public_properties_count),
    verifiee: a.verified === true,
    telephone: texte(a.public_phone),
  };
}

/** Le corps de l'aperçu, relu champ par champ : rien de ce que l'API ne sert pas n'est supposé. */
export function apercuDepuisLaReponse(brut: unknown): ApercuDInvitation | null {
  const d = objet(brut);
  const role = texte(d?.role);
  if (!d || !role) return null;
  const destinataire = objet(d.recipient);
  const canal = destinataire?.channel;
  const masque = texte(destinataire?.masked);
  const prerempli = objet(d.prefill);
  const attente = objet(d.awaiting);
  const intervention = objet(attente?.maintenance_request);
  const titreIntervention = texte(intervention?.title);
  return {
    role,
    agence: agence(d.agency),
    invitant: texte(objet(d.inviter)?.first_name),
    destinataire: (canal === 'email' || canal === 'phone') && masque ? { canal, masque } : null,
    compteExistant: d.recipient_has_account === true,
    expireLe: texte(d.expires_at),
    inviteeLe: texte(d.invited_at),
    prerempli: { prenom: texte(prerempli?.first_name) ?? '', nom: texte(prerempli?.last_name) ?? '' },
    attente: {
      biens: nombre(attente?.properties_count),
      intervention: titreIntervention ? { titre: titreIntervention, bien: texte(intervention?.property_label) } : null,
    },
  };
}

/** Le complément d'un 410 : l'agence (nom, logo, téléphone public) et la date de l'invitation. */
export function fermeeDepuisLErreur(err: ApiError): InvitationFermee | null {
  const corps = objet(err.data);
  const etat = ETATS_FERMES[String(corps?.code ?? '')];
  if (!etat) return null;
  const a = objet(corps?.agency);
  const nom = texte(a?.name);
  return {
    etat,
    agence: a && nom ? { nom, logo: texte(a.logo_url), telephone: texte(a.public_phone) } : null,
    inviteeLe: texte(corps?.invited_at),
  };
}

export async function lireInvitation(jeton: string): Promise<LectureDInvitation> {
  try {
    const reponse = await apiRequest<{ data?: unknown }>(cheminApi`/api/public/invitations/${jeton}`);
    const apercu = apercuDepuisLaReponse(reponse?.data);
    return apercu ? { issue: 'valide', apercu } : { issue: 'indisponible' };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) return { issue: 'inconnue' };
      if (err.status === 410) {
        const fermee = fermeeDepuisLErreur(err);
        if (fermee) return { issue: 'fermee', fermee };
      }
    }
    return { issue: 'indisponible' };
  }
}
