<?php

namespace App\Services\Pont;

use Illuminate\Http\Request;

/**
 * TCK-2980 (ADR-0132 § 0, révisé le 2026-11-19) — un PILOTE de canal du pont. Le pont ne connaît ni WhatsApp ni le
 * SMS : il connaît ce contrat. Un canal neuf (Telegram, Messenger, RCS…) est une classe qui l'implémente, une entrée
 * de `config/messagerie.php` et ses clés ; le webhook générique (`webhooks/messagerie/{canal}/{token}`), le routage
 * ({@see RoutageEntrant}), l'accord ({@see MotsDuConsentement}) et la trace (`message_relays`) ne changent pas.
 * `PontSansCanalEnDurTest` le garde.
 *
 * {@see self::nom()} est la valeur écrite dans `messages.channel` et `message_relays.channel` : une chaîne libre,
 * déclarée par le pilote, égale à sa clé dans `config('messagerie.canaux')`.
 *
 * TCK-2981 — l'envoi : `envoyerTexte()`, `envoyerGabarit()`, un {@see ResultatDEnvoi} neutre. `$contexte` :
 * `agency_id` (?int, l'intégration à consommer), `bouton_reponse` (?string, la charge utile d'un bouton de réponse —
 * capacité « boutons »), `bouton_url` (?string, TCK-2982).
 */
interface CanalDuPont
{
    /** La valeur du canal : `messages.channel`, `message_relays.channel` (`whatsapp`, demain `telegram`). */
    public function nom(): string;

    /** Ce que le pilote sait faire : le pont ne demande jamais ce qu'il n'a pas déclaré. */
    public function capacites(): CapacitesDuCanal;

    // ── L'envoi (TCK-2981) ─────────────────────────────────────────────────────────────────────────────

    /**
     * Un texte libre (dans la fenêtre du canal, s'il en a une : c'est à l'appelant de la lire).
     *
     * @param  array{agency_id?: ?int, bouton_reponse?: ?string, bouton_url?: ?string}  $contexte
     */
    public function envoyerTexte(string $destinataire, string $texte, array $contexte = []): ResultatDEnvoi;

    /**
     * Un gabarit approuvé, cherché par (événement, canal, langue) ; `indisponible` sans gabarit approuvé ou sans la
     * capacité « gabarits ».
     *
     * @param  list<string>  $variables  les variables du corps, dans l'ordre
     * @param  array{agency_id?: ?int, bouton_reponse?: ?string, bouton_url?: ?string}  $contexte
     */
    public function envoyerGabarit(string $destinataire, string $evenement, string $langue, array $variables, array $contexte = []): ResultatDEnvoi;

    /**
     * La fenêtre de texte libre est-elle ouverte pour ce numéro, depuis le numéro d'entreprise de cette agence ? Un
     * canal sans fenêtre (`fenetreHeures` nul) rend `true` s'il porte le texte libre.
     */
    public function fenetreOuverte(string $destinataire, ?int $agence = null): bool;

    /** TCK-2981 — l'accord de ce numéro sur ce canal, ses dates, et la fin de sa fenêtre (écran du personnel). */
    public function etatDuNumero(string $telephone, ?int $agence = null): EtatDuNumero;

    /**
     * {@see self::etatDuNumero()} pour plusieurs numéros, en un nombre de requêtes qui ne dépend pas de leur nombre
     * (le bloc `pont` de `GET …/context`, un numéro par participant).
     *
     * @param  list<string>  $telephones
     * @return array<string, EtatDuNumero> numéro => état, une entrée par numéro demandé
     */
    public function etatsDesNumeros(array $telephones, ?int $agence = null): array;

    // ── Le webhook ─────────────────────────────────────────────────────────────────────────────────────

    /** Le jeton d'URL du webhook de ce canal (`{token}`) ; vide : le webhook est fermé (404). */
    public function jetonDuWebhook(): string;

    /** La signature ou le jeton propres au fournisseur ; refus = 403 (`abort_code`), secret absent compris. */
    public function verifierWebhook(Request $request): void;

    /** Les messages entrants et les accusés de la requête (déjà vérifiée), normalisés. */
    public function lireWebhook(Request $request): LectureDuWebhook;

    /**
     * Les accusés lus, appliqués à ce que le fournisseur suit (WhatsApp : les tentatives de notification). TCK-2981 y
     * ajoute les relais sortants.
     *
     * @param  list<AccuseEntrant>  $accuses
     * @return int combien ont été remis à leur traitement
     */
    public function appliquerAccuses(array $accuses): int;

    /**
     * La vérification d'abonnement du fournisseur (`GET`), s'il en a une : le défi à rendre en texte brut ; refus =
     * 403. `null` : le canal n'en a pas (404).
     */
    public function defiDAbonnement(Request $request): ?string;

    // ── Le numéro d'entreprise, le prospect ───────────────────────────────────────────────────────────

    /**
     * Le numéro (ou compte) d'entreprise est-il l'un des nôtres sur ce canal, et de quelle agence (`null` : la
     * plateforme) ? `false` : il n'est pas lu (un autre numéro, celui du Radar compris).
     */
    public function agenceDuNumero(string $numeroDEntreprise): int|false|null;

    /** La valeur de `property_contact_leads.channel` d'un prospect venu de ce canal, ou `null` : pas de prospect. */
    public function canalDuProspect(): ?string;

    // ── L'accord, par (numéro, canal) — ADR-0132 § 0 et § 3 ──────────────────────────────────────────────

    /** L'état de l'accord de ce numéro SUR CE CANAL. */
    public function accord(string $telephone): EtatDAccord;

    /**
     * {@see self::accord()} pour plusieurs numéros, en un nombre de requêtes qui ne dépend pas de leur nombre.
     *
     * @param  list<string>  $telephones
     * @return array<string, EtatDAccord> numéro => accord, une entrée par numéro demandé
     */
    public function accords(array $telephones): array;

    /** Le numéro s'oppose (STOP) : plus rien ne lui part SUR CE CANAL. */
    public function opposer(string $telephone, string $source): void;

    /** Le numéro accepte (START, invitation acceptée). `$userId` n'est posé que si l'appelant l'a prouvé. */
    public function accorder(string $telephone, string $source, ?int $userId = null): void;

    /** Le compte que ce canal tient pour détenteur de ce numéro (un accord du pont rattaché), ou `null`. */
    public function compteAccordePour(string $telephone): ?int;

    /** Un message vient d'arriver de ce numéro : la fenêtre du canal s'ouvre (si le canal en a une). */
    public function noterEntrant(MessageEntrant $message): void;
}
