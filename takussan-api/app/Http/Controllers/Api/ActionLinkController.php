<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Pont\GesteParLienRequest;
use App\Http\Resources\InventoryResource;
use App\Http\Resources\MaintenanceRequestResource;
use App\Http\Resources\PropertyVisitResource;
use App\Models\ActionLink;
use App\Models\Inventory;
use App\Models\MaintenanceRequest;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Services\Auth\OtpPreview;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Messaging\SujetsDuFil;
use App\Services\Pont\GestesParLien;
use App\Services\Pont\LiensDAction;
use App\Services\Signature\SignatureOtpService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * TCK-2982 (ADR-0132 § 5) — le lien d'action, public et SANS session : le jeton est l'autorisation.
 *
 *  - `GET /api/a/{token}` : `{gesture, state, object}`, `object` étant la projection minimale du registre
 *    (`GestesParLien::projection`) ; pose `opened_at` à la première lecture ;
 *  - `POST /api/a/{token}` : le geste, par le service de sa route, la politique rejugée MAINTENANT pour le
 *    compte du lien ; `used_at` est posé dans la MÊME transaction, sous verrou de la ligne du lien, après le
 *    geste réussi : un geste refusé (politique, machine d'état, validation) ne consomme pas le lien. La
 *    réponse porte ce que ce compte lit de l'objet APRÈS le geste, par la ressource de l'objet ;
 *  - un lien mort (utilisé, révoqué, expiré) : 410 et son seul code ; un jeton inconnu : 404. Un lien mort
 *    ne dit rien de l'objet, du geste ni de la personne.
 *
 * Aucune réponse ne pose de cookie ni ne rend de jeton d'API : le compte du lien est posé sur la seule
 * requête (`Auth::setUser`, sans `login`), pour les services qui lisent l'auteur du geste.
 */
class ActionLinkController extends Controller
{
    /** Le texte du SMS du code, dans `notifications.php` de chaque langue. */
    public const TEXTES_DU_CODE = 'action_link_signature_code';

    public function __construct(
        private readonly LiensDAction $liens,
        private readonly SignatureOtpService $otp,
    ) {}

    public function show(Request $request, string $token): JsonResponse
    {
        $lien = $this->vivant($this->liens->trouver($token));
        $objet = $this->objetVivant($lien);

        if ($lien->opened_at === null) {
            $lien->forceFill(['opened_at' => now()])->save();
        }

        return $this->json(['data' => [
            'gesture' => $lien->gesture,
            'state' => ActionLink::ETAT_OUVERT,
            'object' => GestesParLien::projection($lien->gesture, $objet),
        ]]);
    }

    public function act(GesteParLienRequest $request, string $token): JsonResponse
    {
        // Le lien est déjà jugé vivant par `GesteParLienRequest::authorize` (404/410 AVANT tout 422) ; il est
        // rejugé ici sous verrou de sa ligne.
        $trouve = $request->lien();

        [$acteur, $objet] = DB::transaction(function () use ($trouve, $request): array {
            /** @var ActionLink|null $lien */
            $lien = ActionLink::query()->whereKey($trouve->id)->lockForUpdate()->first();
            $lien = $this->vivant($lien);
            $objet = $this->objetVivant($lien);
            $acteur = $lien->user;
            abort_if(! $acteur instanceof User, 404);

            // Le compte du lien, pour la seule requête : les services qui lisent l'auteur du geste.
            Auth::setUser($acteur);
            $request->setUserResolver(fn () => $acteur);

            $objet = GestesParLien::executer($lien->gesture, $acteur, $objet, $request->validatedAvecInstants());
            $lien->forceFill(['used_at' => now()])->save();

            return [$acteur, $objet];
        });

        return $this->json(['data' => [
            'state' => ActionLink::ETAT_FAIT,
            'object' => $this->luApresLeGeste($acteur, $objet, $request),
        ]]);
    }

    /**
     * `POST /api/a/{token}/code` — le code de signature, envoyé par SMS au numéro du lien (ADR-0098 : une
     * signature hors de la session du signataire). Seulement pour un lien `inventory.sign` vivant, à une
     * partie qui doit encore signer. 423 sous verrou, 429 avant le délai de renvoi, 503 si le SMS n'est
     * pas parti.
     */
    public function sendCode(Request $request, string $token): JsonResponse
    {
        $lien = $this->vivant($this->liens->trouver($token));
        abort_if($lien->gesture !== 'inventory.sign', 404);
        $inventaire = $this->objetVivant($lien);
        $signataire = $lien->user;
        abort_if(! $inventaire instanceof Inventory || ! $signataire instanceof User, 404);

        $role = GestesParLien::roleASigner($inventaire, $signataire);
        abort_code_if($role === null, 409, 'action_link.nothing_to_sign');
        $portee = GestesParLien::PORTEE_DU_CODE.$role;
        abort_code_if($this->otp->isLocked($inventaire, $signataire, $portee), 423, 'action_link.code_locked');
        abort_code_unless($this->otp->canResend($inventaire, $signataire, $portee), 429, 'action_link.resend_too_soon');

        $numero = is_string($lien->phone) && $lien->phone !== '' ? $lien->phone : null;
        abort_code_if($numero === null && ($signataire->phone_verified_at === null || ! is_string($signataire->phone) || $signataire->phone === ''), 422, 'action_link.no_phone');
        $destination = LeaseSignatureService::maskPhone((string) ($numero ?? $signataire->phone));
        $code = $this->otp->issue($inventaire, $signataire, $portee, LeaseSignatureCodeNotification::CHANNEL_SMS, $destination);
        app(OtpPreview::class)->record($code);

        $notification = new LeaseSignatureCodeNotification(
            $code,
            (string) ($inventaire->lease?->reference_number ?? $inventaire->lease_id),
            (int) (SignatureOtpService::CODE_TTL_SECONDS / 60),
            LeaseSignatureCodeNotification::CHANNEL_SMS,
            $this->otp->resendKey($inventaire, $signataire, $portee),
            self::TEXTES_DU_CODE,
        );
        try {
            $numero !== null
                ? Notification::route('sms', $numero)->notify($notification)
                : $signataire->notify($notification);
        } catch (Throwable $e) {
            $this->otp->releaseResend($inventaire, $signataire, $portee);

            throw $e;
        }
        if ($notification->smsLeft() === false) {
            $this->otp->releaseResend($inventaire, $signataire, $portee);
            abort_code(503, 'action_link.sms_not_sent');
        }

        return $this->json(['data' => ['channel' => LeaseSignatureCodeNotification::CHANNEL_SMS, 'destination' => $destination]]);
    }

    /** Le lien vivant, ou 404 (inconnu) / 410 avec son seul code (mort). */
    private function vivant(?ActionLink $lien): ActionLink
    {
        return $this->liens->lienVivant($lien);
    }

    private function objetVivant(ActionLink $lien): Model
    {
        return $this->liens->objetVivant($lien);
    }

    /**
     * Ce que le compte du lien lit de l'objet après le geste, par la ressource de l'objet (pour le
     * prestataire qui accepte : ce qu'ADR-0122 lui ouvre à l'acceptation). Rien s'il ne le lit pas.
     *
     * @return array<string, mixed>|null
     */
    private function luApresLeGeste(User $acteur, Model $objet, Request $request): ?array
    {
        $objet->refresh();
        if (! SujetsDuFil::peutLire($acteur, $objet)) {
            return null;
        }

        return match (true) {
            $objet instanceof PropertyVisit => PropertyVisitResource::make($objet->load('property', 'visitor'))->resolve($request),
            $objet instanceof MaintenanceRequest => MaintenanceRequestResource::make($objet->load('property.address', 'requester'))->avecAcces()->resolve($request),
            $objet instanceof Inventory => InventoryResource::make($objet)->resolve($request),
            default => null,
        };
    }
}
