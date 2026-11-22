<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Services\Crm\ContactLeadResponseStatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * TCK-2871 — `GET /api/agencies/{agency}/response-time` : « L'agence vous répond d'ordinaire en 2 h »,
 * lu par le client sur ses visites.
 *
 * Lecture de tout utilisateur connecté (`auth:sanctum`) : le visiteur d'une demande n'a souvent aucune
 * fiche client chez l'agence (la demande publique n'en crée pas), et la mesure est celle de l'agence
 * entière, jamais d'un agent ({@see ContactLeadResponseStatsService::forClients()}). Le détail par
 * agent reste à `contact-leads/response-stats`, réservé au personnel qui détient `crm.view_all`.
 *
 * `{median_hours, sample}` ; 204 sous le seuil d'échantillon, ou sans réponse mesurée.
 */
class AgencyResponseTimeController extends Controller
{
    public function __invoke(Agency $agency, ContactLeadResponseStatsService $stats): JsonResponse|Response
    {
        $mesure = $stats->forClients((int) $agency->id);

        return $mesure === null ? response()->noContent() : $this->json(['data' => $mesure]);
    }
}
