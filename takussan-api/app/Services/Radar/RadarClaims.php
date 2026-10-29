<?php

namespace App\Services\Radar;

use App\Jobs\Radar\PrepareRadarListingPhotos;
use App\Jobs\Radar\PublishClaimedRadarListings;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\RadarConsentProof;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachOutcome;
use App\Models\Enums\RadarVerificationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Auth\PhoneLoginService;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Onboarding\HostIndividualOnboardingService;
use App\Services\Property\PublishReadiness;
use App\Support\CanonicalPhone;
use App\Support\PhoneMasker;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2390 (ADR-0077 §3, §6 ; ADR-0033 §3) — l'annonceur réclame ses annonces depuis le lien du message : il voit ses
 * annonces déjà remplies, reçoit un code SMS **à son seul numéro**, corrige, accepte les conditions et publie. Le même lien
 * active le compte que « Publier pour lui » a créé.
 *
 * **Le compte que le code ouvre est celui de la connexion par téléphone** ({@see PhoneLoginService::accountFor()}) : celui
 * qui a vérifié le numéro, sinon le compte du Radar, sinon un compte neuf. Quatre états, que la page lit :
 *  - `new` — personne ne porte ce numéro vérifié et le Radar n'a créé aucun compte : le code en crée un ;
 *  - `activation` — le compte créé par le Radar, jamais activé : le code le vérifie (crédit de bienvenue) ;
 *  - `existing` — un compte a VÉRIFIÉ ce numéro : connexion exigée (la page de connexion, 2FA comprise), puis un code frais ;
 *  - `unavailable` — le compte rattaché est supprimé, bloqué, suspendu, ou ne s'ouvrirait plus par ce numéro : rien.
 *  - `support` — un compte a vérifié ce numéro, mais le compte que le Radar avait créé pour lui a servi (connexion, mot de
 *    passe, e-mail, numéro vérifié, autre bien ou autre espace), ou est bloqué, supprimé, ou son espace suspendu : rien ne se
 *    réunit sans le support (décision 5a du porteur).
 *
 * **Rien de ce que la page lit ne vient du Radar interne** : ni le numéro (masqué), ni la nature, ni ses indices, ni un
 * verdict, ni la source de l'annonce. Seulement les valeurs de l'annonce, ses photos déjà en réserve, et les biens en ligne.
 *
 * **La confirmation est UNE transaction** : le code (consommé avant), le compte, la preuve `otp`, les étapes, les conditions
 * et l'espace. Un refus n'écrit rien d'autre que ce que le code lui-même compte (verrou du numéro). La publication part après
 * le commit ({@see PublishClaimedRadarListings}) : les photos d'une annonce-URL ne se lisent qu'une fois l'accord donné.
 *
 * Ordre des verrous : annonces → annonceur → message (celui de {@see RadarConsentWorkflow} et de {@see RadarPublisher}).
 */
final class RadarClaims
{
    public const STATE_NEW = 'new';

    public const STATE_ACTIVATION = 'activation';

    public const STATE_EXISTING = 'existing';

    public const STATE_UNAVAILABLE = 'unavailable';

    /** Deux comptes pour un numéro, dont le compte du Radar a servi : le support tranche, la page ne réunit rien. */
    public const STATE_SUPPORT = 'support';

    /** Le motif d'une annonce que l'annonceur a décochée : il ne veut pas la publier. */
    public const DECLINED = 'radar.claim.declined';

    public function __construct(
        private readonly PhoneLoginService $login,
        private readonly AdvertiserProvisioner $provisioner,
        private readonly HostIndividualOnboardingService $onboarding,
        private readonly PublishReadiness $readiness,
        private readonly RadarPhotoReserve $reserve,
    ) {}

    /** Les deux portes de la publication pour lui (TCK-2389) : le code ouvre un compte, la réclamation en dépend autant. */
    public static function ensureAvailable(): void
    {
        abort_code_if(! RadarPublisher::activationAvailable() || RadarPublisher::otpPreviewActive(), 503, 'radar.claim.unavailable');
    }

    /**
     * Ce que la page publique montre. `$viewer` : la session du navigateur, s'il y en a une — seul le titulaire vérifié du
     * numéro y lit l'espace où ses annonces iront.
     *
     * @return array<string, mixed>
     */
    public function show(RadarAdvertiser $advertiser, ?User $viewer): array
    {
        $state = $this->state($advertiser);
        // Ni le nom de famille ni rien du `display_name` brut : le prénom et le nom proposé de l'espace sont SANS numéro.
        [$firstName] = RadarPublisher::nameOf($advertiser);
        $isOwner = $state['state'] === self::STATE_EXISTING && $viewer !== null && $viewer->is($state['user']);

        return [
            'advertiser' => [
                'first_name' => $firstName,
                'phone_masked' => self::masked((string) $advertiser->phone),
            ],
            'account' => [
                'state' => $state['state'],
                // Le nom proposé pour l'espace, que l'annonceur peut corriger (suite de la revue de TCK-2389).
                'space_name' => RadarPublisher::spaceName($firstName),
                'viewer_is_owner' => $isOwner,
                // Connecté avec un AUTRE compte : la page le dit plutôt que de publier ailleurs.
                'viewer_is_other' => $viewer !== null && ! $isOwner,
                'space' => $isOwner ? $this->spaceOf($state['user']) : null,
            ],
            'listings' => $this->claimable($advertiser)->map(fn (RadarListing $listing) => $this->listingOf($listing))->values()->all(),
            'published' => $this->published($advertiser),
            'terms_version' => PublishReadiness::TERMS_VERSION,
        ];
    }

    /**
     * Le code part au numéro de l'annonceur, et à lui seul : aucun numéro n'est lu dans la requête. Les bornes sont celles de la
     * connexion par téléphone (délai de renvoi, `PhoneSendQuota`, verrou, plafond global), sous la même portée `login`.
     *
     * @return array{retry_after: int, phone_masked: string}
     */
    public function sendCode(RadarAdvertiser $advertiser, ?User $viewer, ?string $locale): array
    {
        $phone = (string) $advertiser->phone;
        $state = $this->state($advertiser);
        abort_code_if($state['state'] === self::STATE_UNAVAILABLE, 422, 'radar.claim.account_unavailable');
        abort_code_if($state['state'] === self::STATE_SUPPORT, 409, 'radar.claim.support_required');
        // Un numéro vérifié sur un compte : la connexion d'abord, le code ensuite — un SMS ne se dépense pas pour rien.
        abort_code_if($state['state'] === self::STATE_EXISTING && ! $viewer?->is($state['user']), 409, 'radar.claim.login_required');
        // Connecté à un autre compte, la confirmation refusera : le SMS est refusé avant de partir, avec le même code.
        abort_code_if($state['state'] !== self::STATE_EXISTING && $viewer !== null, 403, 'radar.claim.wrong_account');
        abort_code_unless(PhoneVerificationService::countryAllowed($phone), 422, 'radar.claim.account_unavailable');

        $this->login->requestCode($phone, $locale);
        $codes = app(PhoneVerificationService::class);

        return [
            'retry_after' => $codes->sendToAvailableIn(PhoneLoginService::SCOPE, $phone) ?: $codes->retryAfter(),
            'phone_masked' => self::masked($phone),
        ];
    }

    /**
     * @param  array{code: string, terms_version: string, listings: list<array<string, mixed>>, first_name?: ?string, space_name?: ?string, device_name?: ?string}  $input
     */
    public function confirm(RadarAdvertiser $advertiser, array $input, ?User $viewer, ?string $locale): JsonResponse
    {
        $phone = (string) $advertiser->phone;
        $state = $this->state($advertiser);
        abort_code_if($state['state'] === self::STATE_UNAVAILABLE, 422, 'radar.claim.account_unavailable');
        abort_code_if($state['state'] === self::STATE_SUPPORT, 409, 'radar.claim.support_required');
        abort_code_if($input['terms_version'] !== PublishReadiness::TERMS_VERSION, 422, 'radar.claim.terms_outdated');

        $selection = collect($input['listings'])->keyBy(fn (array $row) => (int) $row['id']);
        $claimable = $this->claimable($advertiser)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $foreign = array_values(array_diff($selection->keys()->all(), $claimable));
        abort_code_if($foreign !== [], 422, 'radar.claim.listing_unavailable', ['listing_ids' => $foreign]);
        abort_code_if($selection->isEmpty() && $state['state'] !== self::STATE_ACTIVATION, 422, 'radar.claim.nothing_selected');

        if ($state['state'] === self::STATE_EXISTING) {
            // Le numéro est vérifié sur un compte : il ne s'ouvre pas par la page, mais par la connexion (mot de passe, 2FA).
            abort_code_if($viewer === null, 409, 'radar.claim.login_required');
            abort_code_unless($viewer->is($state['user']), 403, 'radar.claim.wrong_account');
        } else {
            // Un compte neuf ou celui du Radar s'ouvre par ce code ; une autre session dans ce navigateur ne le reçoit pas.
            abort_code_if($viewer !== null, 403, 'radar.claim.wrong_account');
        }

        return DB::transaction(function () use ($advertiser, $phone, $state, $viewer, $input, $selection, $locale): JsonResponse {
            if ($viewer !== null) {
                $refusal = $this->login->checkCode($phone, $input['code']);
                if ($refusal !== null) {
                    return $refusal;
                }
                $user = $viewer;
                $response = null;
            } else {
                $outcome = $this->login->authenticate($phone, $input['code'], ['device_name' => $input['device_name'] ?? null], $locale);
                if ($outcome instanceof JsonResponse) {
                    return $outcome;
                }
                $user = $outcome['user'];
                $response = $outcome['response'];
                // Le compte ouvert est celui que la page annonçait : ni un autre compte du Radar, ni un compte vérifié entre-temps.
                abort_code_unless(
                    $state['state'] === self::STATE_NEW ? $outcome['is_new_account'] : $user->is($state['user']),
                    409,
                    'radar.claim.account_changed',
                );
            }

            $claim = $this->claim($advertiser, $user, $selection, $input, $state['state']);

            $payload = ['claim' => $claim];
            if ($response !== null) {
                $payload += (array) $response->getData(true);
            }

            return new JsonResponse($payload, 200);
        });
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $selection  les annonces retenues, par identifiant, et leurs corrections
     * @param  array<string, mixed>  $input
     * @param  string  $state  l'état lu avant le code ({@see self::state()})
     * @return array{state: string, agency: array{id: int, name: string}, listing_ids: list<int>, declined_ids: list<int>, moved_property_ids: list<int>}
     */
    private function claim(RadarAdvertiser $advertiser, User $user, Collection $selection, array $input, string $state): array
    {
        $listings = $this->claimable($advertiser)->toBase()->pluck('id');
        $listings = RadarListing::query()->whereIn('id', $listings)->orderBy('id')->lockForUpdate()->get();
        $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->firstOrFail();
        abort_code_if(ClaimLinks::revoked($locked), 410, 'radar.claim.revoked');

        // Relu sous verrou : une annonce retenue a pu être publiée, close ou réattribuée depuis la lecture.
        $gone = array_values(array_diff($selection->keys()->all(), $listings->pluck('id')->map(fn ($id) => (int) $id)->all()));
        abort_code_if($gone !== [], 409, 'radar.claim.listing_unavailable', ['listing_ids' => $gone]);

        // `$state` est celui que la page annonçait, lu AVANT le code : le code vient de vérifier le numéro d'un compte du Radar.
        $previous = $locked->user_id === null ? null : (int) $locked->user_id;

        // Le prénom d'un compte que la réclamation ouvre pour la première fois (neuf ou du Radar) : l'annonceur le corrige.
        if ($state !== self::STATE_EXISTING) {
            $firstName = trim((string) ($input['first_name'] ?? ''));
            if ($firstName !== '') {
                $user->forceFill(['first_name' => $firstName])->save();
            }
        }
        $this->readiness->recordTerms($user, true);

        $space = $this->onboarding->autoOnboard($user);
        $agency = $space['agency'];
        $spaceName = trim((string) ($input['space_name'] ?? ''));
        // L'annonceur nomme l'espace que le Radar ou la réclamation lui a fait, jamais un espace qu'il avait déjà.
        if ($spaceName !== '' && ($space['created'] || $state === self::STATE_ACTIVATION)) {
            $agency->forceFill(['name' => $spaceName])->save();
        }

        $moved = [];
        $orphan = $this->orphanOf($locked, $user);
        if ($orphan !== null) {
            // Rejugé sous verrou : le compte du Radar a pu servir entre la lecture de la page et le code.
            abort_code_unless($this->orphanAbsorbable($locked, $orphan), 409, 'radar.claim.support_required');
            $moved = $this->absorbOrphan($locked, $orphan, $user, $agency);
        }
        if ($locked->user_id === null || (int) $locked->user_id !== $user->id) {
            $locked->forceFill(['user_id' => $user->id])->save();
        }

        [$retained, $declined] = $listings->partition(fn (RadarListing $listing) => $selection->has((int) $listing->id));
        foreach ($retained as $listing) {
            $changes = self::changes($selection[(int) $listing->id]);
            $listing->forceFill([
                'extracted' => $changes === [] ? $listing->extracted : RadarReviewFields::apply((array) $listing->extracted, $changes),
                'stage' => RadarListingStage::Consented,
                'stage_reason' => null,
            ])->save();
        }
        foreach ($declined as $listing) {
            $listing->forceFill(['stage' => RadarListingStage::Refused, 'stage_reason' => self::DECLINED])->save();
        }

        $consentIds = $this->recordProof($locked, $user, $retained);

        $retainedIds = $retained->pluck('id')->map(fn ($id) => (int) $id)->values()->all();
        foreach ($retained->filter(fn (RadarListing $listing) => $listing->photoPreparable()) as $listing) {
            PrepareRadarListingPhotos::dispatch($listing->id)->afterCommit();
        }
        if ($retainedIds !== []) {
            PublishClaimedRadarListings::dispatch($locked->id, $user->id, $agency->id, $retainedIds)->afterCommit();
        }

        activity('Radar')
            ->causedBy($user)
            ->performedOn($locked)
            ->withProperties(array_filter([
                'advertiser_id' => $locked->id,
                'user_id' => $user->id,
                'agency_id' => $agency->id,
                'state' => $state,
                'listing_ids' => $retainedIds,
                'declined_ids' => $declined->pluck('id')->map(fn ($id) => (int) $id)->values()->all(),
                'consent_ids' => $consentIds,
                'moved_property_ids' => $moved,
                'previous_user_id' => $previous !== $user->id ? $previous : null,
                'terms_version' => $user->terms_version,
            ], fn (mixed $value) => $value !== null && $value !== []))
            ->event('radar_claimed')
            ->log('Annonces du Radar réclamées par l\'annonceur');

        return [
            'state' => $state,
            'agency' => ['id' => $agency->id, 'name' => $agency->name],
            'listing_ids' => $retainedIds,
            'declined_ids' => $declined->pluck('id')->map(fn ($id) => (int) $id)->values()->all(),
            'moved_property_ids' => $moved,
        ];
    }

    /**
     * La preuve `otp` (ADR-0077 §3) : une réponse confirmée par la connexion elle-même, sans capture ni vérification IA, sur
     * chaque message qui couvre une annonce retenue — le dernier envoyé. Sans annonce retenue (une activation), sur le dernier
     * message envoyé. Le message prend l'issue « accord » s'il n'en avait pas de finale : la file des relances le quitte.
     *
     * @param  Collection<int, RadarListing>  $retained
     * @return list<int>
     */
    private function recordProof(RadarAdvertiser $advertiser, User $user, Collection $retained): array
    {
        $sent = RadarOutreach::query()->where('radar_advertiser_id', $advertiser->id)->whereNotNull('sent_at');
        $outreachIds = $retained->isEmpty()
            ? array_filter([(clone $sent)->max('id')])
            : DB::table('radar_outreach_listing')
                ->whereIn('radar_outreach_id', (clone $sent)->select('id'))
                ->whereIn('radar_listing_id', $retained->pluck('id'))
                ->groupBy('radar_listing_id')
                ->selectRaw('max(radar_outreach_id) as id')
                ->pluck('id')
                ->unique()
                ->all();

        $ids = [];
        foreach (RadarOutreach::query()->whereIn('id', $outreachIds)->orderBy('id')->lockForUpdate()->get() as $outreach) {
            $consent = RadarConsent::query()->create([
                'radar_outreach_id' => $outreach->id,
                'radar_advertiser_id' => $advertiser->id,
                'proof' => RadarConsentProof::Otp,
                'capture_hashes' => [],
                'deposited_by_id' => $user->id,
                // Aucune vérification IA : la connexion par code EST la preuve.
                'verification_status' => RadarVerificationStatus::Done,
            ]);
            $consent->forceFill(['confirmed_by_id' => $user->id, 'confirmed_at' => now()])->save();
            $ids[] = $consent->id;

            if ($outreach->outcome?->isFinal() !== true) {
                $outreach->forceFill(['outcome' => RadarOutreachOutcome::Consented, 'outcome_at' => now(), 'outcome_by_id' => $user->id])->save();
            }
        }

        return $ids;
    }

    /**
     * Le compte orphelin (revue finale de TCK-2389) : le Radar a créé A pour ce numéro, puis le titulaire l'a vérifié sur un
     * autre compte B. `null` quand il n'y en a pas (ou plus : A déjà supprimé).
     */
    private function orphanOf(RadarAdvertiser $advertiser, User $user): ?User
    {
        if ($advertiser->user_id === null || (int) $advertiser->user_id === (int) $user->id) {
            return null;
        }

        // Supprimé compris : un compte du Radar supprimé par le support n'est pas « jamais servi » (il renvoie au support).
        return User::withTrashed()->find($advertiser->user_id);
    }

    /**
     * Décision 5a du porteur (2026-10-29) : A se réunit à B **seulement s'il n'a jamais servi** — ni numéro vérifié, ni
     * connexion (`last_login_at`, jeton Sanctum, session), ni mot de passe, ni e-mail, ni bien ou espace autre que ceux que le Radar lui a faits, ni profil
     * ailleurs, et personne d'autre dans son espace. Sinon rien ne se déplace : la page dit « écrivez-nous » (`support`).
     */
    private function orphanAbsorbable(RadarAdvertiser $advertiser, User $orphan): bool
    {
        // La règle du chemin de l'opérateur et de l'état `activation` (`AdvertiserProvisioner::accountUnavailable()`) : un
        // compte bloqué, supprimé, ou dont l'espace est suspendu ne se réunit pas — ses biens modérés resteraient en ligne
        // dans l'espace de B (vérification adverse I-2).
        $suspended = Agency::withTrashed()->where('primary_admin_id', $orphan->id)->where('status', AgencyStatus::Suspended->value)->exists();
        if (! $orphan->canOpenSession() || $suspended) {
            return false;
        }
        if ($orphan->phone_verified_at !== null || $orphan->last_login_at !== null || $orphan->password_set_at !== null
            || $orphan->email !== null || $orphan->tokens()->exists() || DB::table('sessions')->where('user_id', $orphan->id)->exists()) {
            return false;
        }

        $spaces = Agency::withTrashed()->where('primary_admin_id', $orphan->id)->pluck('id')->map(fn ($id) => (int) $id)->all();
        if (count($spaces) > 1) {
            return false;
        }
        $radarProperties = RadarListing::query()->where('radar_advertiser_id', $advertiser->id)->whereNotNull('property_id')->select('property_id');
        $foreignProperty = Property::withTrashed()
            ->where(fn ($query) => $query->where('user_id', $orphan->id)->orWhereIn('agency_id', $spaces))
            ->whereNotIn('id', $radarProperties)
            ->exists();
        if ($foreignProperty) {
            return false;
        }
        foreach ([AgencyAdminProfile::class, OwnerProfile::class, AgentProfile::class] as $profile) {
            $elsewhere = $profile::withTrashed()->where('user_id', $orphan->id)->whereNotIn('agency_id', $spaces)->exists();
            $someoneElse = $profile::withTrashed()->whereIn('agency_id', $spaces)->where('user_id', '!=', $orphan->id)->exists();
            if ($elsewhere || $someoneElse) {
                return false;
            }
        }

        return ! ServiceProviderProfile::query()->where('user_id', $orphan->id)->exists()
            && ! PlatformProfile::withTrashed()->where('user_id', $orphan->id)->exists();
    }

    /**
     * A n'a jamais servi : ses biens publiés par le Radar suivent l'annonceur dans l'espace de B, avec ce que les visiteurs y
     * ont laissé — demandes de contact et prospects de son espace, visites, réservations, empreintes de photos, collaborations
     * et conversations (B y prend la place de A). Puis A, ses profils et son espace se suppriment (suppression douce).
     *
     * @return list<int> les biens déplacés
     */
    private function absorbOrphan(RadarAdvertiser $advertiser, User $orphan, User $user, Agency $agency): array
    {
        $spaces = Agency::query()->where('primary_admin_id', $orphan->id)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $ids = Property::query()
            ->where(fn ($query) => $query->where('user_id', $orphan->id)->orWhereIn('agency_id', $spaces))
            ->orderBy('id')
            ->lockForUpdate()
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        foreach (Property::query()->whereIn('id', $ids)->get() as $property) {
            $property->forceFill(['agency_id' => $agency->id, 'user_id' => $user->id])->save();
        }

        $leads = DB::table('property_contact_leads')->where(fn ($query) => $query->whereIn('property_id', $ids)->orWhereIn('agency_id', $spaces));
        (clone $leads)->update(['agency_id' => $agency->id]);
        (clone $leads)->where('recipient_user_id', $orphan->id)->update(['recipient_user_id' => $user->id]);
        (clone $leads)->where('handled_by_id', $orphan->id)->update(['handled_by_id' => $user->id]);
        DB::table('customers')->whereIn('agency_id', $spaces)->update(['agency_id' => $agency->id]);
        DB::table('customers')->where('added_by_id', $orphan->id)->update(['added_by_id' => $user->id]);
        DB::table('property_visits')->whereIn('property_id', $ids)->where('agent_id', $orphan->id)->update(['agent_id' => $user->id]);
        DB::table('bookings')->whereIn('agency_id', $spaces)->update(['agency_id' => $agency->id]);
        DB::table('media_fingerprints')->whereIn('property_id', $ids)->update(['agency_id' => $agency->id]);
        DB::table('property_collaborators')->whereIn('property_id', $ids)->where('user_id', $orphan->id)->update(['user_id' => $user->id]);

        // Une conversation où B est déjà : A s'en retire ; ailleurs, B prend sa place (unique par conversation et compte).
        $joined = DB::table('conversation_participants')->where('user_id', $user->id)->select('conversation_id');
        DB::table('conversation_participants')->where('user_id', $orphan->id)->whereIn('conversation_id', $joined)->delete();
        DB::table('conversation_participants')->where('user_id', $orphan->id)->update(['user_id' => $user->id]);

        foreach ([AgencyAdminProfile::class, OwnerProfile::class, AgentProfile::class] as $profile) {
            $profile::query()->where('user_id', $orphan->id)->get()->each->delete();
        }
        Agency::query()->whereIn('id', $spaces)->get()->each->delete();
        $orphan->delete();

        // Dans la transaction de la réclamation : la réunion et les suppressions se journalisent ensemble, ou rien.
        activity('Radar')
            ->causedBy($user)
            ->performedOn($orphan)
            ->withProperties([
                'advertiser_id' => $advertiser->id,
                'orphan_user_id' => $orphan->id,
                'user_id' => $user->id,
                'deleted_agency_ids' => $spaces,
                'moved_property_ids' => $ids,
                'agency_id' => $agency->id,
            ])
            ->event('radar_orphan_absorbed')
            ->log('Compte du Radar jamais activé réuni au titulaire du numéro, puis supprimé');

        return $ids;
    }

    /**
     * L'état du compte que le code ouvrirait, et ce compte.
     *
     * @return array{state: string, user: ?User}
     */
    public function state(RadarAdvertiser $advertiser): array
    {
        ['user' => $user, 'verified' => $verified] = $this->login->accountFor((string) $advertiser->phone);

        if ($verified) {
            if (! $user->canOpenSession()) {
                return ['state' => self::STATE_UNAVAILABLE, 'user' => null];
            }
            $orphan = $this->orphanOf($advertiser, $user);

            return $orphan !== null && ! $this->orphanAbsorbable($advertiser, $orphan)
                ? ['state' => self::STATE_SUPPORT, 'user' => null]
                : ['state' => self::STATE_EXISTING, 'user' => $user];
        }
        if ($advertiser->user_id === null) {
            return ['state' => self::STATE_NEW, 'user' => null];
        }
        if ($this->provisioner->accountUnavailable($advertiser) || $user === null || (int) $user->id !== (int) $advertiser->user_id) {
            return ['state' => self::STATE_UNAVAILABLE, 'user' => null];
        }

        return ['state' => self::STATE_ACTIVATION, 'user' => $user];
    }

    /**
     * Les annonces que la page propose : celles de l'annonceur qu'un message ENVOYÉ lui a présentées, encore `contacted` ou
     * `consented`, jamais publiées.
     *
     * @return Collection<int, RadarListing>
     */
    private function claimable(RadarAdvertiser $advertiser): Collection
    {
        return RadarListing::query()
            ->where('radar_advertiser_id', $advertiser->id)
            ->whereIn('stage', [RadarListingStage::Contacted->value, RadarListingStage::Consented->value])
            ->whereNull('property_id')
            ->whereIn('id', DB::table('radar_outreach_listing')
                ->join('radar_outreaches', 'radar_outreaches.id', '=', 'radar_outreach_listing.radar_outreach_id')
                ->where('radar_outreaches.radar_advertiser_id', $advertiser->id)
                ->whereNotNull('radar_outreaches.sent_at')
                ->select('radar_outreach_listing.radar_listing_id'))
            ->with('media')
            ->orderBy('id')
            ->get();
    }

    /**
     * Une carte : les valeurs de l'annonce, rien du Radar (ni nature, ni source, ni rapprochements, ni verdict).
     *
     * @return array<string, mixed>
     */
    private function listingOf(RadarListing $listing): array
    {
        $values = RadarReviewFields::values((array) $listing->extracted);
        $neighborhood = RadarPublisher::neighborhoodName($values['neighborhood_id']);
        $photo = $this->reserve->ordered($listing)->first();

        // Le numéro qu'un texte d'annonce porterait est masqué : la page ne le révèle sous aucune forme.
        $title = RadarListingTitle::resolve($values, $neighborhood)['title'];

        return [
            'id' => $listing->id,
            'title' => $title === null ? null : PhoneMasker::mask($title),
            'description' => is_string($values['description']) ? PhoneMasker::mask($values['description']) : null,
            'price' => $values['price'],
            'contract' => $values['contract'],
            'rent_period' => $values['rent_period'],
            'property_type' => $values['property_type'],
            'bedrooms' => $values['bedrooms'],
            'bathrooms' => $values['bathrooms'],
            'surface_m2' => $values['surface_m2'],
            'furnished' => $values['furnished'],
            'neighborhood' => $neighborhood,
            'photo_url' => $photo === null ? null : app(PrivateMediaAccess::class)->signedUrl($photo),
        ];
    }

    /** @return list<array{title: string|null, public_url: string}> */
    private function published(RadarAdvertiser $advertiser): array
    {
        return Property::query()
            ->public()
            ->whereIn('id', RadarListing::query()
                ->where('radar_advertiser_id', $advertiser->id)
                ->where('stage', RadarListingStage::Published->value)
                ->whereNotNull('property_id')
                ->select('property_id'))
            ->orderBy('id')
            ->get(['id', 'slug', 'title'])
            ->map(fn (Property $property): array => ['title' => $property->title, 'public_url' => RadarPublisher::publicUrl($property->slug)])
            ->values()
            ->all();
    }

    /** L'espace où iraient ses annonces : le sien s'il en a un ({@see HostIndividualOnboardingService::autoOnboard()}). */
    private function spaceOf(User $user): ?array
    {
        $agency = Agency::query()->where('primary_admin_id', $user->id)->orderBy('id')->first();

        return $agency === null ? null : ['name' => $agency->name];
    }

    /**
     * Les corrections permises sur la page, aux types de `extracted` : le titre, le prix, la description.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private static function changes(array $row): array
    {
        $changes = [];
        foreach (['title', 'description'] as $field) {
            if (array_key_exists($field, $row)) {
                $text = trim((string) $row[$field]);
                $changes[$field] = $text === '' ? null : $text;
            }
        }
        if (array_key_exists('price', $row) && $row['price'] !== null) {
            $changes['price'] = (int) $row['price'];
        }

        return $changes;
    }

    /** `+221 •• ••• •• 67` : assez pour que l'annonceur reconnaisse son numéro, rien pour un tiers. */
    public static function masked(string $phone): string
    {
        $digits = (string) preg_replace('/\D/', '', CanonicalPhone::fold($phone));
        if (strlen($digits) < 4) {
            return '••';
        }

        return str_starts_with($digits, '221') && strlen($digits) === 12
            ? '+221 •• ••• •• '.substr($digits, -2)
            : str_repeat('•', strlen($digits) - 2).substr($digits, -2);
    }
}
