'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useCurrentLocale } from '@/i18n/hooks';
import { ApiError } from '@/lib/api';
import {
  connexionParTelephoneActive,
  demanderCodeTelephone,
  exigeConditions,
  exigeDoubleFacteur,
  verifierCodeTelephone,
} from '@/lib/connexion-telephone';

/**
 * TCK-2510 — l'identité du tunnel de réservation : le numéro et le code SMS, sur l'écran même du
 * récapitulatif, quand l'API ouvre la connexion par téléphone (`phone_login`, ADR-0033).
 *
 * Elle ne reprend de `ConnexionParTelephone` que les deux temps ordinaires — le numéro, le code.
 * Les cas rares que la page de connexion sait traiter (second facteur, conditions d'un compte
 * ouvert par le Radar, drapeau éteint entre l'affichage et l'envoi) rendent `repli` : le tunnel
 * renvoie alors vers la connexion, dates conservées, plutôt que de recopier ces écrans ici.
 *
 * ⚠ Comme l'API, rien ici ne dit si un compte existe : `verify-code` ouvre la session, ou crée le
 * compte au besoin.
 */
export type EtapeIdentite = 'numero' | 'code';

export type ErreurIdentite = 'tooMany' | 'invalidPhone' | 'codeInvalid' | 'locked' | 'blocked' | 'failed';

export type IssueVerification = 'connecte' | 'repli' | 'echec';

/** Le drapeau `phone_login` : `null` tant qu'il n'est pas lu, `false` au moindre doute. */
export function useDrapeauConnexionParTelephone(): boolean | null {
  const [actif, setActif] = useState<boolean | null>(null);
  useEffect(() => {
    let annule = false;
    void connexionParTelephoneActive().then((oui) => {
      if (!annule) setActif(oui);
    });
    return () => {
      annule = true;
    };
  }, []);
  return actif;
}

function erreurDeDemande(err: unknown): ErreurIdentite {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'tooMany';
    if (err.status === 422) return 'invalidPhone';
  }
  return 'failed';
}

function erreurDeVerification(err: unknown): ErreurIdentite {
  if (err instanceof ApiError) {
    const code = err.data && typeof err.data === 'object' ? (err.data as { code?: unknown }).code : undefined;
    if (err.status === 423 || code === 'account_locked') return 'locked';
    if (code === 'account_blocked') return 'blocked';
    if (err.status === 429) return 'tooMany';
    if (err.status === 422) return 'codeInvalid';
  }
  return 'failed';
}

export function useIdentiteParTelephone() {
  const locale = useCurrentLocale();
  const { openSession } = useAuth();
  const [etape, setEtape] = useState<EtapeIdentite>('numero');
  const [telephone, setTelephone] = useState('');
  const [code, setCode] = useState('');
  const [attente, setAttente] = useState(0);
  const [apercu, setApercu] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<ErreurIdentite | null>(null);

  // Compte à rebours du renvoi : `retry_after` est la seule source.
  useEffect(() => {
    if (attente <= 0) return;
    const minuterie = window.setTimeout(() => setAttente((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(minuterie);
  }, [attente]);

  /** Envoie le code. `repli` : le drapeau s'est éteint entre l'affichage et l'envoi (404). */
  async function demanderCode(): Promise<'envoye' | 'repli' | 'echec'> {
    setEnCours(true);
    setErreur(null);
    try {
      const demande = await demanderCodeTelephone(telephone, locale);
      setAttente(demande.attente);
      setApercu(demande.codeApercu);
      setCode('');
      setEtape('code');
      return 'envoye';
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return 'repli';
      setErreur(erreurDeDemande(err));
      return 'echec';
    } finally {
      setEnCours(false);
    }
  }

  /** Vérifie le code et ouvre la session. */
  async function verifier(): Promise<IssueVerification> {
    setEnCours(true);
    setErreur(null);
    try {
      const reponse = await verifierCodeTelephone({ phone: telephone, code }, locale);
      if (exigeConditions(reponse) || exigeDoubleFacteur(reponse)) return 'repli';
      await openSession(reponse.token, reponse.user, reponse.expires_at);
      return 'connecte';
    } catch (err) {
      setErreur(erreurDeVerification(err));
      return 'echec';
    } finally {
      setEnCours(false);
    }
  }

  function changerDeNumero(): void {
    setEtape('numero');
    setCode('');
    setErreur(null);
  }

  return {
    etape,
    telephone,
    setTelephone,
    code,
    setCode: (valeur: string) => setCode(valeur.replace(/\D/g, '').slice(0, 6)),
    attente,
    apercu,
    enCours,
    erreur,
    demanderCode,
    verifier,
    changerDeNumero,
  };
}

export type IdentiteParTelephone = ReturnType<typeof useIdentiteParTelephone>;
