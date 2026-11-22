<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Services\Reporting\TeamTodayService;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2623 (ADR-0096) — `GET /api/agencies/{agency}/team-today` : qui de l'équipe travaille
 * aujourd'hui (heure de Dakar), avec ses visites du jour, ses demandes à traiter et son absence en
 * cours.
 *
 * La porte de {@see TeamPerformanceController} : `reports.view_agency` sous le profil actif de
 * l'agence (`AgencyPolicy::viewReports`), et une agence `standard` seulement — une agence
 * `individual` n'a pas d'équipe. Un agent reçoit 403.
 */
class TeamTodayController extends Controller
{
    public function __construct(private readonly TeamTodayService $service) {}

    public function show(Agency $agency): JsonResponse
    {
        $this->authorize('viewReports', $agency);
        abort_code_unless($agency->kind === AgencyKind::Standard, 403, 'agency.standard_only');

        return $this->json(['data' => $this->service->forToday($agency)]);
    }
}
