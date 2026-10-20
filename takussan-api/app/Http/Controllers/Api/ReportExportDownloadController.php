<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\ReportExport;
use App\Notifications\ReportExportReadyNotification;
use App\Support\RelativeSignedUrl;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * TCK-1051 (P63.02) — `GET /api/report-exports/{reportExport}/download`, la cible du courriel
 * {@see ReportExportReadyNotification} qu'envoie l'export asynchrone d'un
 * rapport de la console (TCK-227, au-delà de 10 000 lignes).
 *
 * La route n'exige PAS `auth:sanctum`, comme `media.private.show` : le lien s'ouvre depuis une
 * messagerie, qui n'envoie pas le jeton `Bearer` (TCK-575). La signature porte l'autorisation, et
 * elle est liée à son demandeur, comme le lien d'export d'audit (P63.01) : `user` est signé avec
 * l'export, et l'export ne se sert que s'il est `ready`, demandé par ce compte, et non échu.
 */
class ReportExportDownloadController extends Controller
{
    /** Le lien du courriel, valable jusqu'à l'échéance de l'export. */
    public static function signedUrl(ReportExport $export): string
    {
        return RelativeSignedUrl::temporary(
            'report-exports.download',
            $export->expires_at,
            ['reportExport' => $export->id, 'user' => $export->requested_by],
        );
    }

    public function __invoke(Request $request, int $reportExport): StreamedResponse
    {
        $export = ReportExport::query()->find($reportExport);
        $userId = filter_var($request->query('user'), FILTER_VALIDATE_INT);

        if ($export === null
            || $userId === false
            || (int) $export->requested_by !== $userId
            || $export->requester === null
            || $export->status !== 'ready'
            || $export->expires_at === null
            || $export->expires_at->isPast()
            || ! $export->archive_path
            || ! Storage::disk('local')->exists($export->archive_path)) {
            abort(404);
        }

        return Storage::disk('local')->download(
            $export->archive_path,
            "{$export->report}-{$export->id}.csv",
        );
    }
}
