<?php

namespace App\Services\Webhooks;

use App\Exceptions\ApiError;
use App\Exceptions\HttpErrorCode;
use App\Models\Integration;
use App\Models\IntegrationWebhookLog;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * TCK-602 (ADR-0051 §4) — le journal du webhook EN COURS, à portée de requête.
 *
 * Le middleware `webhook.journal` l'ouvre avant tout traitement (`open`) et le ferme toujours
 * (`close`) ; entre les deux, le gestionnaire dit ce qu'il sait : la requête est authentifiée
 * (`authenticated`, et par quelle intégration), ce qu'elle désignait (`annotate`). Sans journal
 * ouvert (appel hors route, test unitaire), chaque méthode est sans effet.
 *
 * Ce qui n'est JAMAIS écrit : l'URL (ses segments secrets — le `{token}` SMS/WhatsApp, le jeton
 * d'intégration des paiements, ADR-0046), un en-tête hors de la liste blanche du canal, le message
 * d'une exception (il peut porter une valeur de la requête).
 */
class WebhookJournal
{
    /** Au-delà, le corps n'est pas gardé et la ligne n'est pas rejouable. */
    public const MAX_BODY_BYTES = 262144;

    /**
     * Les en-têtes gardés, par canal : signatures, type de contenu, identifiant de requête.
     * Jamais `Authorization` ni cookie.
     *
     * @var array<string, list<string>>
     */
    public const HEADER_WHITELIST = [
        IntegrationWebhookLog::CHANNEL_PAYMENT => ['content-type', 'x-request-id', 'wave-signature', 'x-om-signature', 'x-signature'],
        IntegrationWebhookLog::CHANNEL_SMS => ['content-type', 'x-request-id'],
        IntegrationWebhookLog::CHANNEL_WHATSAPP => ['content-type', 'x-request-id', 'x-hub-signature-256'],
    ];

    /** Paramètres de requête d'une URL signée par Laravel : ils n'ont rien à faire au journal. */
    private const SIGNED_URL_PARAMS = ['signature', 'expires'];

    private ?IntegrationWebhookLog $log = null;

    private bool $unmatchedResponse = false;

    public function __construct(private readonly WebhookPayloadRedactor $redactor) {}

    public function open(Request $request, string $channel, string $provider): IntegrationWebhookLog
    {
        $raw = $this->rawBody($request);
        $truncated = strlen($raw) > self::MAX_BODY_BYTES;

        $this->log = IntegrationWebhookLog::create([
            'channel' => $channel,
            'route_name' => $request->route()?->getName(),
            'provider' => $provider,
            'direction' => 'incoming',
            'status' => IntegrationWebhookLog::STATUS_RECEIVED,
            'http_method' => $request->getMethod(),
            'body' => $truncated ? null : $raw,
            'body_sha256' => hash('sha256', $raw),
            'body_truncated' => $truncated,
            'headers' => $this->headers($request, $channel),
            'payload' => $truncated ? ['body_truncated' => true] : $this->redactor->redact($channel, $provider, $this->decode($request, $raw)),
            'attempts' => 0,
        ]);
        $this->unmatchedResponse = false;

        return $this->log;
    }

    /** ADR-0051 §5 — le rejeu reprend la ligne existante : ses annotations y retournent. */
    public function resume(IntegrationWebhookLog $log): void
    {
        $this->log = $log;
        $this->unmatchedResponse = false;
    }

    public function current(): ?IntegrationWebhookLog
    {
        return $this->log;
    }

    /**
     * Jeton, IP et signature ont passé. L'intégration qui a validé (ADR-0046) donne le rattachement
     * — plus jamais l'intégration globale du fournisseur.
     */
    public function authenticated(?Integration $integration = null): void
    {
        if ($this->log === null) {
            return;
        }

        $this->log->forceFill(array_filter([
            'authenticated_at' => $this->log->authenticated_at ?? now(),
            'integration_id' => $integration?->id,
            'agency_id' => $integration?->agency_id,
        ], fn ($value) => $value !== null))->save();
    }

    /**
     * @param  array{external_id?: ?string, event_type?: ?string, matched_count?: ?int}  $facts
     */
    public function annotate(array $facts): void
    {
        if ($this->log === null) {
            return;
        }

        $this->log->forceFill(array_filter([
            'external_id' => isset($facts['external_id']) ? mb_substr((string) $facts['external_id'], 0, 191) : null,
            'event_type' => $facts['event_type'] ?? null,
            'matched_count' => $facts['matched_count'] ?? null,
        ], fn ($value) => $value !== null))->save();
    }

    /**
     * Un accusé authentifié qui n'apparie rien et dont le fournisseur attend un 404 (Orange SMS) :
     * c'est un « non apparié », pas un rejet.
     */
    public function unmatched(): void
    {
        $this->annotate(['matched_count' => 0]);
        $this->unmatchedResponse = true;
    }

    /** Ferme la ligne sur `processed`, `rejected` ou `failed` — jamais `received`. */
    public function close(?Response $response, ?Throwable $error = null): void
    {
        if ($this->log === null) {
            return;
        }

        $error ??= $response !== null && property_exists($response, 'exception') ? $response->exception : null;
        $status = $response?->getStatusCode() ?? ($error instanceof HttpExceptionInterface ? $error->getStatusCode() : 500);
        $authenticated = $this->log->authenticated_at !== null;

        $outcome = match (true) {
            $status < 400 => IntegrationWebhookLog::STATUS_PROCESSED,
            ! $authenticated => IntegrationWebhookLog::STATUS_REJECTED,
            $this->unmatchedResponse && $status === 404 => IntegrationWebhookLog::STATUS_PROCESSED,
            $status < 500 => IntegrationWebhookLog::STATUS_REJECTED,
            default => IntegrationWebhookLog::STATUS_FAILED,
        };

        $this->log->forceFill([
            'status' => $outcome,
            'http_status' => $status,
            'error_code' => $status >= 400 ? $this->errorCode($status, $error) : null,
            'error_message' => $status >= 400 && $error !== null ? class_basename($error) : null,
            'processed_at' => now(),
        ])->save();

        $this->log = null;
    }

    private function errorCode(int $status, ?Throwable $error): string
    {
        if ($error instanceof ApiError) {
            return $error->errorCode;
        }
        if ($error === null || $error instanceof HttpExceptionInterface) {
            return HttpErrorCode::for($status);
        }

        return 'exception';
    }

    /**
     * Les octets reçus. Pour un accusé en `GET` (LAfricaMobile), ce sont les paramètres de requête,
     * sans ceux de la signature d'URL Laravel.
     */
    private function rawBody(Request $request): string
    {
        if ($request->isMethod('GET')) {
            return http_build_query(array_diff_key($request->query->all(), array_flip(self::SIGNED_URL_PARAMS)));
        }

        return $request->getContent();
    }

    /** @return array<string, string> */
    private function headers(Request $request, string $channel): array
    {
        $kept = [];
        foreach (self::HEADER_WHITELIST[$channel] ?? [] as $name) {
            $value = $request->headers->get($name);
            if (is_string($value) && $value !== '') {
                $kept[$name] = mb_substr($value, 0, 1024);
            }
        }

        return $kept;
    }

    /** @return array<array-key, mixed> */
    private function decode(Request $request, string $raw): array
    {
        if ($request->isMethod('GET')) {
            parse_str($raw, $query);

            return $query;
        }

        $json = json_decode($raw, true);
        if (is_array($json)) {
            return $json;
        }

        parse_str($raw, $form);

        return $form;
    }
}
