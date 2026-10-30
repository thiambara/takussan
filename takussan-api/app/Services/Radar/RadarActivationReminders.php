<?php

namespace App\Services\Radar;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\CreditWelcomeGrant;
use App\Models\Enums\RadarListingStage;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Boost\BoostSettings;
use App\Services\Credits\WelcomeCreditService;
use App\Services\Property\PropertyViewCounter;
use App\Support\PhoneFingerprint;
use App\Support\RadarWaMe;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2394 (ADR-0077, lot 4) — la relance d'activation : le compte que « Publier pour lui » a créé n'est pas encore
 * activé, et l'annonceur reçoit ce que ses annonces lui rapportent déjà — vues, demandes de contact et de visite — avec
 * les crédits que l'activation lui offrira. Le texte est fixe et versionné (`resources/radar/messages/activation.v1.*.md`),
 * jamais généré ; seuls les chiffres, la date et les liens s'y insèrent.
 *
 * **Les chiffres sont ceux d'une période** : depuis la dernière relance envoyée, sinon depuis la mise en ligne.
 *  - Les vues : `views_count` n'est qu'un compteur cumulé (aucune vue n'est datée, {@see PropertyViewCounter}) ;
 *    l'envoi pose donc une ligne de base (`activation_baseline`, `{bien: views_count}`), et la période suivante compte ce qui
 *    la dépasse. Un bien du Radar naît à 0 : sans ligne de base, tout son compteur est de la période.
 *  - Les demandes : les pistes (`property_contact_leads` : formulaire, clic WhatsApp, appel) et les demandes de visite
 *    (`property_visits`) DATÉES de la période.
 *  - Les crédits : le montant de bienvenue (`credits.welcome_amount`) s'il n'a été accordé ni à ce numéro ni à cet espace
 *    — l'activation l'accordera alors ({@see WelcomeCreditService::onPhoneVerified()}) ; sinon 0, et la
 *    ligne des crédits sort du texte.
 *
 * Une relance ne part qu'une fois la période longue de `radar.activation.min_interval_days` jours. Les gardes sont celles
 * du second message ({@see RadarPublisher::publishedMessage()}) et du lien qu'elle porte ({@see ClaimLinks::revoked()}),
 * plus l'état du compte que le lien activerait ({@see RadarClaims::state()}). L'aperçu dit ce qui bloque ; l'envoi le
 * rejuge sous le verrou de l'annonceur, puis journalise les chiffres cités.
 */
final class RadarActivationReminders
{
    public const VERSION = 'activation.v1';

    /** Rien à relancer : le Radar n'a créé aucun compte pour cet annonceur. */
    public const STATE_NONE = 'none';

    public const STATE_ACTIVATION = 'activation';

    public const ALREADY_ACTIVE = 'radar.activation.already_active';

    public const REVOKED = 'radar.activation.revoked';

    public const NOTHING_PUBLISHED = 'radar.activation.nothing_published';

    public const TOO_SOON = 'radar.activation.too_soon';

    public const UNDER_MANDATE = 'radar.activation.under_mandate';

    /** Un second marquage à moins d'une minute du premier : un double envoi, que l'intervalle à 0 jour laisserait compter deux fois. */
    public const JUST_SENT = 'radar.activation.just_sent';

    /** La ligne du gabarit qui ne vaut que si l'activation offre des crédits. */
    private const CREDITS_LINE = '[credits] ';

    public function __construct(
        private readonly RadarClaims $claims,
        private readonly ClaimLinks $claimLinks,
        private readonly BoostSettings $boost,
        private readonly AdvertiserClaim $claim,
    ) {}

    /**
     * @return array{state: string, blocking: list<string>, available_at: ?string, reminders: array{count: int, last_at: ?string}, figures: ?array<string, mixed>, text: ?string, wa_me: ?string, version: string}
     */
    public function preview(RadarAdvertiser $advertiser, string $locale): array
    {
        $reminders = [
            'count' => (int) $advertiser->activation_reminder_count,
            'last_at' => BaseResource::instantOnWire($advertiser->activation_reminded_at),
        ];
        $empty = ['available_at' => null, 'reminders' => $reminders, 'figures' => null, 'text' => null, 'wa_me' => null, 'version' => self::VERSION];
        if ($advertiser->user_id === null) {
            return ['state' => self::STATE_NONE, 'blocking' => []] + $empty;
        }

        $properties = $this->properties($advertiser);
        $figures = $properties->isEmpty() ? null : $this->figures($advertiser, $properties);
        $availableAt = $figures === null ? null : $this->availableAt($figures['since']);

        $blocking = $this->blocking($advertiser, $properties, $availableAt);
        $text = $blocking === [] && $figures !== null ? $this->text($advertiser, $figures, $locale) : null;

        return [
            'state' => self::STATE_ACTIVATION,
            'blocking' => $blocking,
            'available_at' => BaseResource::instantOnWire($availableAt),
            'reminders' => $reminders,
            'figures' => $figures === null ? null : self::onWire($figures),
            'text' => $text,
            // Le numéro de l'ANNONCEUR seul (ADR-0077 §5) : une relance sans blocage en a un (sinon `revoked`).
            'wa_me' => $text === null ? null : RadarWaMe::url((string) $advertiser->phone, $text),
            'version' => self::VERSION,
        ];
    }

    /**
     * L'opérateur a envoyé la relance : sous le verrou de l'annonceur et sa prise en charge, tout se rejuge — un STOP, une
     * activation ou une autre relance arrivés depuis l'aperçu la refusent (422), sans rien écrire. Pose ensuite la ligne de
     * base des vues et journalise les chiffres cités.
     *
     * @return array<string, mixed> l'aperçu relu après l'envoi
     */
    public function markSent(RadarAdvertiser $advertiser, string $locale, User $by): array
    {
        $locked = DB::transaction(function () use ($advertiser, $locale, $by): RadarAdvertiser {
            $locked = RadarAdvertiser::query()->whereKey($advertiser->getKey())->lockForUpdate()->firstOrFail();
            $this->claim->assertHeld($locked, $by);
            abort_code_if($locked->user_id === null, 422, self::NOTHING_PUBLISHED);

            $properties = $this->properties($locked);
            $figures = $properties->isEmpty() ? null : $this->figures($locked, $properties);
            $availableAt = $figures === null ? null : $this->availableAt($figures['since']);
            $blocking = $this->blocking($locked, $properties, $availableAt);
            if ($blocking !== []) {
                abort_code(422, $blocking[0], $blocking[0] === self::TOO_SOON ? ['available_at' => BaseResource::instantOnWire($availableAt)] : []);
            }
            // Sous le verrou : deux marquages qui se suivent ne comptent qu'une relance, même quand l'intervalle minimal vaut 0.
            abort_code_if($locked->activation_reminded_at?->gt(now()->subMinute()), 409, self::JUST_SENT);

            $locked->forceFill([
                'activation_reminded_at' => now(),
                'activation_reminder_count' => (int) $locked->activation_reminder_count + 1,
                'activation_baseline' => $properties->mapWithKeys(fn (Property $p): array => [(string) $p->id => (int) $p->views_count])->all(),
            ])->save();

            activity('Admin')
                ->causedBy($by)
                ->performedOn($locked)
                ->withProperties([
                    'advertiser_id' => $locked->id,
                    'user_id' => $locked->user_id,
                    'version' => self::VERSION,
                    'locale' => $locale,
                    'rank' => (int) $locked->activation_reminder_count,
                    'figures' => self::onWire($figures),
                ])
                ->event('radar_activation_reminder_sent')
                ->log('Relance d\'activation envoyée à l\'annonceur du Radar');

            return $locked;
        });

        return $this->preview($locked->refresh(), $locale);
    }

    /**
     * Ce qui empêche une relance, dans l'ordre où l'écran le lit.
     *
     * @param  Collection<int, Property>  $properties
     * @return list<string>
     */
    private function blocking(RadarAdvertiser $advertiser, Collection $properties, ?CarbonInterface $availableAt): array
    {
        $blocking = [];
        if ($advertiser->do_not_contact_at !== null) {
            $blocking[] = 'radar.advertiser.do_not_contact';
        } elseif (ClaimLinks::revoked($advertiser)) {
            // Un accord retiré ou un numéro purgé : le lien d'activation rendrait 410, et il n'y a personne à qui écrire.
            $blocking[] = self::REVOKED;
        }
        if ($advertiser->mandate_at !== null) {
            // ADR-0079 — sous mandat, ses biens ne sont pas dans ce compte (TCK-2421).
            $blocking[] = self::UNDER_MANDATE;
        }
        if ($advertiser->phone !== null) {
            $blocking = [...$blocking, ...$this->accountBlocking($advertiser)];
        }
        if (! RadarPublisher::activationAvailable()) {
            $blocking[] = RadarPublisher::ACTIVATION_UNAVAILABLE;
        }
        if (RadarPublisher::otpPreviewActive()) {
            $blocking[] = RadarPublisher::OTP_PREVIEW_ACTIVE;
        }
        if ($properties->isEmpty()) {
            $blocking[] = self::NOTHING_PUBLISHED;
        } elseif ($availableAt !== null && now()->lessThan($availableAt)) {
            $blocking[] = self::TOO_SOON;
        }

        return array_values(array_unique($blocking));
    }

    /**
     * Le compte que le lien ouvrirait (la même lecture que la page de réclamation) : seul `activation` — le compte du Radar,
     * jamais vérifié — se relance.
     *
     * @return list<string>
     */
    private function accountBlocking(RadarAdvertiser $advertiser): array
    {
        return match ($this->claims->state($advertiser)['state']) {
            RadarClaims::STATE_ACTIVATION => [],
            RadarClaims::STATE_EXISTING, RadarClaims::STATE_SUPPORT => [self::ALREADY_ACTIVE],
            default => [AdvertiserProvisioner::ACCOUNT_UNAVAILABLE],
        };
    }

    /**
     * Les biens que le Radar a publiés pour l'annonceur et qui sont encore en ligne : ceux dont la relance parle.
     *
     * @return Collection<int, Property>
     */
    private function properties(RadarAdvertiser $advertiser): Collection
    {
        return Property::query()
            ->public()
            ->whereIn('id', RadarListing::query()
                ->where('radar_advertiser_id', $advertiser->id)
                ->where('stage', RadarListingStage::Published->value)
                ->whereNotNull('property_id')
                ->select('property_id'))
            ->orderBy('id')
            ->get(['id', 'slug', 'title', 'views_count', 'created_at']);
    }

    /**
     * @param  Collection<int, Property>  $properties  non vide
     * @return array{since: CarbonInterface, until: CarbonInterface, views: int, contact_requests: int, visit_requests: int, welcome_credits: int, properties: list<array<string, mixed>>}
     */
    private function figures(RadarAdvertiser $advertiser, Collection $properties): array
    {
        $since = CarbonImmutable::instance($advertiser->activation_reminded_at ?? $properties->min('created_at'));
        $ids = $properties->pluck('id')->map(fn ($id) => (int) $id)->all();
        $baseline = (array) ($advertiser->activation_baseline ?? []);

        $leads = PropertyContactLead::query()->whereIn('property_id', $ids)->where('created_at', '>=', $since)
            ->groupBy('property_id')->selectRaw('property_id, count(*) as n')->pluck('n', 'property_id');
        $visits = PropertyVisit::query()->whereIn('property_id', $ids)->where('created_at', '>=', $since)
            ->groupBy('property_id')->selectRaw('property_id, count(*) as n')->pluck('n', 'property_id');

        $rows = $properties->map(fn (Property $property): array => [
            'id' => (int) $property->id,
            'title' => $property->title,
            'public_url' => RadarPublisher::publicUrl($property->slug),
            // Un compteur plus bas que sa ligne de base (remis à zéro, bien dupliqué) ne rend pas de vues négatives.
            'views' => max(0, (int) $property->views_count - (int) ($baseline[(string) $property->id] ?? 0)),
            'contact_requests' => (int) ($leads[$property->id] ?? 0),
            'visit_requests' => (int) ($visits[$property->id] ?? 0),
        ])->values()->all();

        return [
            'since' => $since,
            'until' => now()->toImmutable(),
            'views' => array_sum(array_column($rows, 'views')),
            'contact_requests' => array_sum(array_column($rows, 'contact_requests')),
            'visit_requests' => array_sum(array_column($rows, 'visit_requests')),
            'welcome_credits' => $this->welcomeCredits($advertiser),
            'properties' => $rows,
        ];
    }

    /** Le montant de bienvenue que l'activation accordera, ou 0 si ce numéro ou cet espace l'a déjà reçu. */
    private function welcomeCredits(RadarAdvertiser $advertiser): int
    {
        $amount = $this->boost->welcomeAmount();
        $user = User::query()->find($advertiser->user_id);
        if ($amount <= 0 || $user === null || ! is_string($user->phone) || $user->phone === '') {
            return 0;
        }
        // L'espace que `onPhoneVerified()` créditera : le premier dont il est l'administrateur principal.
        $space = Agency::query()->where('primary_admin_id', $user->id)->orderBy('id')->value('id');
        if ($space === null) {
            return 0;
        }
        $granted = CreditWelcomeGrant::query()
            ->where(fn ($query) => $query->whereIn('phone_hash', PhoneFingerprint::all($user->phone))->orWhere('agency_id', $space))
            ->exists();

        return $granted ? 0 : $amount;
    }

    private function availableAt(CarbonInterface $since): CarbonInterface
    {
        return CarbonImmutable::instance($since)->addDays(max(0, (int) config('radar.activation.min_interval_days')));
    }

    /** @param  array<string, mixed>  $figures */
    private function text(RadarAdvertiser $advertiser, array $figures, string $locale): string
    {
        $template = rtrim((string) file_get_contents(resource_path('radar/messages/'.self::VERSION.".{$locale}.md")), "\n");
        $credits = (int) $figures['welcome_credits'];
        // La ligne des crédits ne vaut que s'il y en a à offrir : sinon elle sort, son saut de ligne avec elle.
        $lines = [];
        foreach (explode("\n", $template) as $line) {
            if (str_starts_with($line, self::CREDITS_LINE)) {
                if ($credits <= 0) {
                    continue;
                }
                $line = substr($line, strlen(self::CREDITS_LINE));
            }
            $lines[] = $line;
        }

        $firstName = ConsentMessageComposer::part(RadarPublisher::nameOf($advertiser)[0], 60);

        // Une seule passe : un `{vues}` écrit dans un prénom reste du texte. Sans prénom, l'espace qui le précède s'en va.
        return strtr(implode("\n", $lines), [
            ' {prenom}' => $firstName === '' ? '' : ' '.$firstName,
            '{prenom}' => $firstName,
            '{depuis}' => CarbonImmutable::instance($figures['since'])->locale($locale)->isoFormat('D MMMM'),
            '{vues}' => self::number((int) $figures['views'], $locale),
            '{contacts}' => self::number((int) $figures['contact_requests'], $locale),
            '{visites}' => self::number((int) $figures['visit_requests'], $locale),
            '{credits}' => self::number($credits, $locale),
            '{lien_reclamation}' => $this->claimLinks->url($advertiser, now(), $locale),
        ]);
    }

    private static function number(int $value, string $locale): string
    {
        return $locale === 'fr' ? number_format($value, 0, ',', ' ') : number_format($value);
    }

    /**
     * @param  array<string, mixed>|null  $figures
     * @return array<string, mixed>|null
     */
    private static function onWire(?array $figures): ?array
    {
        if ($figures === null) {
            return null;
        }

        return ['since' => BaseResource::instantOnWire($figures['since']), 'until' => BaseResource::instantOnWire($figures['until'])] + $figures;
    }
}
