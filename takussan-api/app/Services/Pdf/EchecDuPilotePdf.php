<?php

namespace App\Services\Pdf;

use App\Exceptions\ApiError;
use Spatie\LaravelPdf\Exceptions\CouldNotGeneratePdf;
use Throwable;

/**
 * TCK-2811 — le SEUL endroit qui reconnaît la limite de débit du pilote PDF, et la traduction d'un échec du
 * pilote en refus lisible.
 *
 * Sous le pilote `cloudflare`, `Spatie\LaravelPdf\Drivers\CloudflareDriver` lève
 * `CouldNotGeneratePdf::cloudflareApiError($body)` sur toute réponse non 2xx : le corps de Cloudflare est dans
 * le message, le statut HTTP n'y est pas. Une limite de débit (HTTP 429, code d'erreur 2001, « Rate limit
 * exceeded ») sortait donc en 500 nu de toute route qui rend un PDF.
 *
 * - {@see self::versApi()} sert le rendu d'exception de `bootstrap/app.php` : 503 `pdf.render_busy` avec
 *   `Retry-After` pour la limite de débit, 502 `pdf.render_failed` pour tout autre échec du pilote. Le rendu
 *   y est fait UNE fois pour toutes les routes, y compris les exports dont le PDF se rend à la conversion du
 *   `PdfBuilder` en réponse, hors du contrôleur. L'exception d'origine reste rapportée par le gestionnaire.
 * - {@see self::estUneLimiteDeDebit()} sert aussi l'archive du coffre (`ArchiveDuCoffre`, TCK-2770), qui garde
 *   ses propres codes `document.archive_render_*`, ceux que son front lit.
 */
final class EchecDuPilotePdf
{
    /** Les secondes que le 503 d'une limite de débit demande d'attendre (`Retry-After`). */
    public const REESSAYER_APRES = 60;

    /**
     * Le motif est lu dans le message, faute de statut : le texte de Cloudflare (« Rate limit exceeded »), le
     * statut 429 ou le code 2001 s'il y est recopié. Seule une erreur du PILOTE compte : un message d'une autre
     * exception qui citerait « 429 » n'est pas une limite de débit.
     */
    public static function estUneLimiteDeDebit(Throwable $e): bool
    {
        return $e instanceof CouldNotGeneratePdf
            && preg_match('/rate limit|\b429\b|\b2001\b/i', $e->getMessage()) === 1;
    }

    public static function versApi(CouldNotGeneratePdf $e): ApiError
    {
        if (self::estUneLimiteDeDebit($e)) {
            return (new ApiError(503, 'pdf.render_busy', [], ['Retry-After' => (string) self::REESSAYER_APRES]))
                ->with(['retry_after' => self::REESSAYER_APRES]);
        }

        return new ApiError(502, 'pdf.render_failed');
    }
}
