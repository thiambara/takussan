<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\RadarActivationReminderRequest;
use App\Models\RadarAdvertiser;
use App\Services\Radar\RadarActivationReminders;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2394 (ADR-0077, lot 4) — la relance d'activation d'un compte créé pour l'annonceur : l'aperçu (chiffres, blocages,
 * texte et lien `wa.me`), puis l'envoi marqué par l'opérateur. Gardés par `super-admin` +
 * `platform-can:platform.radar.operate` (`routes/api/admin-radar.php`) : relancer est du démarchage (ADR-0077 §11). L'envoi
 * exige la prise en charge de l'annonceur.
 */
class RadarActivationReminderController extends Controller
{
    public function show(RadarActivationReminderRequest $request, RadarAdvertiser $advertiser, RadarActivationReminders $reminders): JsonResponse
    {
        return $this->json(['data' => $reminders->preview($advertiser, $request->locale())]);
    }

    public function sent(RadarActivationReminderRequest $request, RadarAdvertiser $advertiser, RadarActivationReminders $reminders): JsonResponse
    {
        return $this->json(['data' => $reminders->markSent($advertiser, $request->locale(), $request->user())]);
    }
}
