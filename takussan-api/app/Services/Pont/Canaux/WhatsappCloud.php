<?php

namespace App\Services\Pont\Canaux;

use App\Jobs\UpdateWhatsappDeliveryStatusJob;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Integration;
use App\Models\WhatsappContact;
use App\Services\Notifications\Sms\IntegrationLocator;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Whatsapp\ServiceWindow;
use App\Services\Notifications\Whatsapp\TemplateResolver;
use App\Services\Notifications\Whatsapp\WhatsappDriverInterface;
use App\Services\Notifications\Whatsapp\WhatsappMessage;
use App\Services\Notifications\Whatsapp\WhatsappResult;
use App\Services\Pont\AccuseEntrant;
use App\Services\Pont\CanalDuPont;
use App\Services\Pont\CapacitesDuCanal;
use App\Services\Pont\EtatDAccord;
use App\Services\Pont\LectureDuWebhook;
use App\Services\Pont\MessageEntrant;
use App\Services\Pont\ResultatDEnvoi;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * TCK-2980 (ADR-0132 § 0, § 1) — le pilote WhatsApp Cloud du pont.
 *
 * - **Posé sur l'existant, jamais un second client de Meta** : l'envoi passe par le pilote lié à
 *   {@see WhatsappDriverInterface} (TCK-2981) ; les numéros d'entreprise sont ceux des intégrations `whatsapp_cloud`
 *   actives (`credentials.phone_number_id`, chiffré : lu en PHP, une ligne par agence au plus) ; l'accord et la
 *   fenêtre sont le registre `whatsapp_contacts`.
 * - **Le webhook** : `webhooks/messagerie/whatsapp/{token}`, et l'alias `webhooks/whatsapp/status/{token}` (l'URL déjà
 *   déclarée chez Meta). Jeton d'URL `whatsapp.webhook_url_token`, signature `X-Hub-Signature-256` (HMAC du corps
 *   brut par le secret d'application, `whatsapp.webhook_app_secret` ; secret absent = refus, TCK-945), défi
 *   d'abonnement `hub.*` par `whatsapp.webhook_verify_token` (TCK-944) — la garde d'avant, déplacée ici.
 * - **Les accusés** (`value.statuses[]`) vont à `UpdateWhatsappDeliveryStatusJob` (TCK-283), comme avant.
 * - **La forme neutre** ({@see self::lireWebhook()}) : `entry[].changes[].value.messages[]` du webhook des
 *   notifications, avec `metadata.phone_number_id` (le numéro d'entreprise), `contacts[].profile.name` (le nom de
 *   profil), `context.id` (le message cité). Le texte, le libellé d'un bouton de gabarit ou d'une réponse interactive
 *   (la règle de `RadarWhatsappInbox::text`) ; tout autre type est un média, jamais téléchargé.
 */
final class WhatsappCloud implements CanalDuPont
{
    public const NOM = 'whatsapp';

    /** Les sources d'accord que le pont écrit : seul un `user_id` posé sous l'une d'elles a été prouvé par le pont. */
    private const SOURCES_DU_PONT = ['pont_invitation', 'pont_start', 'pont_stop'];

    /** Les sources d'accord qui rendent un numéro connu (ADR-0132 § 2). */
    private const SOURCES_DU_COMPTE = ['pont_invitation', 'pont_start'];

    /** La longueur bornée d'un texte reçu (celle d'un message Meta). */
    private const TEXTE_MAX = 4096;

    public function __construct(
        private readonly WhatsappDriverInterface $pilote,
        // TCK-2981 — l'envoi : le gabarit approuvé, l'intégration (son numéro d'entreprise), la fenêtre.
        private readonly TemplateResolver $gabarits,
        private readonly IntegrationLocator $integrations,
        private readonly ServiceWindow $fenetre,
    ) {}

    // ── TCK-2981 — l'envoi, par le pilote lié (jamais un second client de Meta) ─────────────────────────

    public function envoyerTexte(string $destinataire, string $texte, array $contexte = []): ResultatDEnvoi
    {
        $bouton = $contexte['bouton_reponse'] ?? null;
        $message = is_string($bouton) && $bouton !== ''
            ? WhatsappMessage::interactive($texte, [['id' => $bouton, 'title' => (string) __('pont.bouton_accepter')]])
            : WhatsappMessage::text($texte);

        return $this->envoyer($destinataire, $message, $contexte);
    }

    public function envoyerGabarit(string $destinataire, string $evenement, string $langue, array $variables, array $contexte = []): ResultatDEnvoi
    {
        $ref = $this->gabarits->resolve($evenement, $langue, array_values(array_map('strval', $variables)));
        if ($ref === null) {
            return ResultatDEnvoi::indisponible('gabarit_non_approuve');
        }
        $bouton = $contexte['bouton_reponse'] ?? null;
        $message = is_string($bouton) && $bouton !== '' ? WhatsappMessage::templateWithQuickReply($ref, $bouton) : WhatsappMessage::template($ref);

        return $this->envoyer($destinataire, $message, $contexte);
    }

    public function fenetreOuverte(string $destinataire, ?int $agence = null): bool
    {
        return $this->fenetre->isOpenFor($destinataire, $this->numeroDEntreprise($agence));
    }

    /** Le `phone_number_id` de l'intégration qu'un envoi pour cette agence consommera (celle de la plateforme à défaut). */
    public function numeroDEntreprise(?int $agence): ?string
    {
        $integration = $this->integrations->find($agence, (string) config('whatsapp.integration_provider', 'whatsapp_cloud'));
        $id = (string) (($integration?->credentials ?? [])['phone_number_id'] ?? '');

        return $id === '' ? null : $id;
    }

    /** @param  array<string, mixed>  $contexte */
    private function envoyer(string $destinataire, WhatsappMessage $message, array $contexte): ResultatDEnvoi
    {
        $agence = isset($contexte['agency_id']) ? (int) $contexte['agency_id'] : null;
        try {
            $telephone = PhoneNumber::normalize($destinataire);
        } catch (InvalidArgumentException) {
            return ResultatDEnvoi::indisponible('numero_invalide');
        }
        $resultat = $this->pilote->send($telephone, $message, ['agency_id' => $agence])[$telephone] ?? null;
        $numero = $this->numeroDEntreprise($agence);
        if ($resultat === null) {
            return new ResultatDEnvoi(ResultatDEnvoi::ECHEC, forme: $message->type, numeroDEntreprise: $numero, motif: 'whatsapp_no_result');
        }

        return match (true) {
            $resultat->isTerminalSuccess() => new ResultatDEnvoi(ResultatDEnvoi::ENVOYE, $resultat->providerMessageId, $message->type, $message->template?->name, $numero),
            $resultat->status === WhatsappResult::STATUS_DEFERRED_TO_FALLBACK => ResultatDEnvoi::indisponible((string) $resultat->failureReason),
            default => new ResultatDEnvoi(ResultatDEnvoi::ECHEC, forme: $message->type, gabarit: $message->template?->name, numeroDEntreprise: $numero, ambigu: $resultat->ambiguous, motif: $resultat->failureReason),
        };
    }

    public function nom(): string
    {
        return self::NOM;
    }

    /** Le pilote d'envoi lié (Cloud API, ou `log` en test) : le relais sortant (TCK-2981) passe par lui. */
    public function pilote(): WhatsappDriverInterface
    {
        return $this->pilote;
    }

    public function capacites(): CapacitesDuCanal
    {
        return new CapacitesDuCanal(
            recoit: true,
            gabarits: true,
            medias: true,
            accuses: true,
            boutons: true,
            fenetreHeures: (int) config('whatsapp.service_window_hours', 24),
        );
    }

    public function canalDuProspect(): ?string
    {
        return ContactLeadChannel::WhatsappInbound->value;
    }

    public function jetonDuWebhook(): string
    {
        return (string) config('whatsapp.webhook_url_token', '');
    }

    /**
     * P36.08 (TCK-945) — un secret d'application absent refuse dans TOUS les environnements : il était sauté hors de
     * la production, et le seul jeton d'URL laissait passer un accusé non signé là où il était posé.
     */
    public function verifierWebhook(Request $request): void
    {
        $secret = (string) config('whatsapp.webhook_app_secret', '');
        if ($secret === '') {
            Log::error('[whatsapp.webhook] app secret not configured — rejecting unsigned status webhook');
            abort_code(403, 'webhook.signature_not_configured');
        }
        $header = (string) $request->header('X-Hub-Signature-256', '');
        $expected = 'sha256='.hash_hmac('sha256', $request->getContent(), $secret);
        if ($header === '' || ! hash_equals($expected, $header)) {
            abort_code(403, 'webhook.signature_invalid');
        }
    }

    /**
     * P36.05 (TCK-944) — Meta appelle l'URL de rappel en `GET` avec `hub.mode=subscribe`, `hub.verify_token` et
     * `hub.challenge`, et attend le défi en texte brut. PHP reçoit `hub.mode` en `hub_mode`.
     */
    public function defiDAbonnement(Request $request): ?string
    {
        $expected = (string) config('whatsapp.webhook_verify_token', '');
        $candidate = (string) $request->query('hub_verify_token', '');
        if ($request->query('hub_mode') !== 'subscribe' || $expected === '' || ! hash_equals($expected, $candidate)) {
            abort_code(403, 'webhook.verify_token_invalid');
        }

        return (string) $request->query('hub_challenge', '');
    }

    public function lireWebhook(Request $request): LectureDuWebhook
    {
        $entrees = (array) $request->input('entry', []);

        return new LectureDuWebhook($this->lireEntrants($entrees), $this->lireAccuses($entrees));
    }

    /** TCK-283 — chaque accusé va à la file qui met à jour la tentative de notification (idempotente). */
    public function appliquerAccuses(array $accuses): int
    {
        foreach ($accuses as $accuse) {
            UpdateWhatsappDeliveryStatusJob::dispatch(
                providerMessageId: $accuse->identifiant,
                metaStatus: $accuse->statut,
                failureReason: $accuse->motif,
                timestamp: $accuse->horodatage,
            );
        }

        return count($accuses);
    }

    /**
     * @param  array<array-key, mixed>  $entrees
     * @return list<AccuseEntrant>
     */
    private function lireAccuses(array $entrees): array
    {
        $accuses = [];
        foreach ($entrees as $entry) {
            foreach ((array) (is_array($entry) ? ($entry['changes'] ?? []) : []) as $change) {
                foreach ((array) (is_array($change) ? ($change['value']['statuses'] ?? []) : []) as $status) {
                    if (! is_array($status)) {
                        continue;
                    }
                    $id = (string) ($status['id'] ?? '');
                    $statut = (string) ($status['status'] ?? '');
                    if ($id === '' || $statut === '') {
                        continue;
                    }
                    $accuses[] = new AccuseEntrant(
                        identifiant: $id,
                        statut: $statut,
                        horodatage: isset($status['timestamp']) ? (int) $status['timestamp'] : null,
                        motif: self::motif($status),
                    );
                }
            }
        }

        return $accuses;
    }

    /**
     * Le motif écrit sur la tentative : le `code` Meta d'abord, seule partie stable (il distingue un numéro sans
     * WhatsApp d'un gabarit refusé), puis le `title`, ou le `message` à défaut — `131026: Message undeliverable`.
     * Borné aux 255 caractères de la colonne (TCK-1046, P72.06).
     *
     * @param  array<string,mixed>  $status
     */
    private static function motif(array $status): ?string
    {
        $error = $status['errors'][0] ?? null;
        if (! is_array($error)) {
            return null;
        }

        $code = trim((string) ($error['code'] ?? ''));
        $text = trim((string) ($error['title'] ?? '')) ?: trim((string) ($error['message'] ?? ''));
        $reason = implode(': ', array_filter([$code, $text], fn (string $part) => $part !== ''));

        return mb_substr($reason !== '' ? $reason : 'whatsapp_failed', 0, 255);
    }

    /**
     * @param  array<array-key, mixed>  $charge  `entry` du webhook de Meta
     * @return list<MessageEntrant>
     */
    private function lireEntrants(array $charge): array
    {
        $messages = [];
        foreach ($charge as $entry) {
            foreach ((array) (is_array($entry) ? ($entry['changes'] ?? []) : []) as $change) {
                $value = is_array($change) ? ($change['value'] ?? null) : null;
                if (! is_array($value)) {
                    continue;
                }
                $numero = trim((string) ($value['metadata']['phone_number_id'] ?? ''));
                $noms = [];
                foreach ((array) ($value['contacts'] ?? []) as $contact) {
                    if (is_array($contact) && is_string($contact['wa_id'] ?? null) && is_string($contact['profile']['name'] ?? null)) {
                        $noms[preg_replace('/\D+/', '', $contact['wa_id'])] = mb_substr(trim($contact['profile']['name']), 0, 120);
                    }
                }
                foreach ((array) ($value['messages'] ?? []) as $message) {
                    $entrant = is_array($message) && $numero !== '' ? $this->normaliser($message, $numero, $noms) : null;
                    if ($entrant !== null) {
                        $messages[] = $entrant;
                    }
                }
            }
        }

        return $messages;
    }

    public function agenceDuNumero(string $numeroDEntreprise): int|false|null
    {
        if ($numeroDEntreprise === '') {
            return false;
        }
        $integrations = Integration::query()
            ->where('provider', (string) config('whatsapp.integration_provider', 'whatsapp_cloud'))
            ->where('is_active', true)
            ->orderBy('id')
            ->get();
        foreach ($integrations as $integration) {
            $id = (string) (($integration->credentials ?? [])['phone_number_id'] ?? '');
            if ($id !== '' && hash_equals($id, $numeroDEntreprise)) {
                return $integration->agency_id === null ? null : (int) $integration->agency_id;
            }
        }

        return false;
    }

    public function accord(string $telephone): EtatDAccord
    {
        $statut = WhatsappContact::query()->where('phone', $telephone)->value('opt_in_status');

        return EtatDAccord::tryFrom((string) $statut) ?? EtatDAccord::Inconnu;
    }

    public function opposer(string $telephone, string $source): void
    {
        $this->sansCompteNonProuve($this->contact($telephone))->optOut($source);
    }

    public function accorder(string $telephone, string $source, ?int $userId = null): void
    {
        $contact = $this->sansCompteNonProuve($this->contact($telephone));
        if ($userId !== null) {
            $contact->forceFill(['user_id' => $userId]);
        }
        $contact->optIn($source);
    }

    /**
     * Le pont ne fait confiance qu'au compte qu'IL a rattaché (une invitation acceptée depuis ce numéro, TCK-2981) :
     * avant d'écrire sa propre source sur un contact qu'un autre chemin a posé, il en retire le `user_id`. Sinon un
     * STOP puis un START feraient d'un `user_id` jamais prouvé un « numéro connu » ({@see self::compteAccordePour()}).
     */
    private function sansCompteNonProuve(WhatsappContact $contact): WhatsappContact
    {
        if ($contact->user_id !== null && ! in_array($contact->opt_in_source, self::SOURCES_DU_PONT, true)) {
            $contact->forceFill(['user_id' => null]);
        }

        return $contact;
    }

    public function noterEntrant(MessageEntrant $message): void
    {
        $contact = $this->contact($message->telephone);
        $contact->forceFill(array_filter([
            'last_inbound_at' => now(),
            'display_name' => $contact->display_name ?? $message->nomDeProfil,
        ], fn ($v) => $v !== null))->save();
    }

    public function compteAccordePour(string $telephone): ?int
    {
        $userId = WhatsappContact::query()
            ->where('phone', $telephone)
            ->where('opt_in_status', WhatsappContact::OPT_IN_OPTED_IN)
            ->whereIn('opt_in_source', self::SOURCES_DU_COMPTE)
            ->whereNotNull('user_id')
            ->value('user_id');

        return $userId === null ? null : (int) $userId;
    }

    private function contact(string $telephone): WhatsappContact
    {
        return WhatsappContact::query()->firstOrCreate(
            ['phone' => $telephone],
            ['opt_in_status' => WhatsappContact::OPT_IN_PENDING],
        );
    }

    /**
     * @param  array<string, mixed>  $message
     * @param  array<string, string>  $noms
     */
    private function normaliser(array $message, string $numero, array $noms): ?MessageEntrant
    {
        $id = trim((string) ($message['id'] ?? ''));
        $chiffres = preg_replace('/\D+/', '', (string) ($message['from'] ?? '')) ?? '';
        if ($id === '' || mb_strlen($id) > 128 || $chiffres === '') {
            return null;
        }
        try {
            // Meta écrit le numéro sans `+` ; le pont le garde en E.164.
            $telephone = PhoneNumber::normalize('+'.$chiffres);
        } catch (InvalidArgumentException) {
            return null;
        }

        $type = (string) ($message['type'] ?? '');
        $texte = match ($type) {
            'text' => $message['text']['body'] ?? null,
            'button' => $message['button']['text'] ?? null,
            'interactive' => $message['interactive']['button_reply']['title'] ?? $message['interactive']['list_reply']['title'] ?? null,
            default => null,
        };
        $texte = is_string($texte) && trim($texte) !== '' ? mb_substr(trim($texte), 0, self::TEXTE_MAX) : null;
        $bouton = $message['button']['payload'] ?? $message['interactive']['button_reply']['id'] ?? null;

        return new MessageEntrant(
            canal: self::NOM,
            telephone: $telephone,
            numeroDEntreprise: $numero,
            identifiant: $id,
            texte: $texte,
            cite: is_string($message['context']['id'] ?? null) ? $message['context']['id'] : null,
            reponseBouton: is_string($bouton) ? mb_substr($bouton, 0, 255) : null,
            media: $texte === null ? (mb_substr($type, 0, 30) ?: 'unknown') : null,
            nomDeProfil: $noms[$chiffres] ?? null,
            horodatage: isset($message['timestamp']) ? (int) $message['timestamp'] : null,
        );
    }
}
