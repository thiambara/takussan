<?php

namespace App\Notifications;

use App\Domain\Notifications\NotificationTarget;
use App\Models\AlertSubscriber;
use App\Models\Enums\NotificationType;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Media\WatermarkRequirement;
use App\Services\Notifications\PreferenceResolver;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use App\Support\MarkdownText;
use App\Support\SavedSearchCriteria;
use Illuminate\Bus\Queueable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;
use Symfony\Component\Mime\Email;

/**
 * TCK-599 (ADR-0050 §3) — « de nouveaux biens correspondent à votre recherche ».
 *
 * Émise directement par `SendSavedSearchAlerts`, PAS par `NotificationService::notify()` : elle y
 * obéissait à `threshold_alert` (le type `system` y est rangé), si bien que couper l'alerte KPI
 * coupait l'alerte de recherche. Son interrupteur est le sien, `saved_search_match`.
 *
 * Aucune prose : titres, corps et e-mail sont des clés `saved_search_alerts.*`, rendues dans la
 * langue du destinataire (Laravel applique `preferredLocale()` le temps de l'envoi).
 *
 * Deux destinataires : un `User` (cloche, e-mail et WhatsApp selon ses préférences) ou un
 * `AlertSubscriber` sans compte (son seul canal confirmé ; jamais `database`, dont la FK vise
 * `users`). Jamais `sms` : {@see self::smsFallbackAllowed()}.
 */
class SavedSearchMatchesNotification extends Notification implements SupportsWhatsapp
{
    use Queueable;

    public const EVENT_TYPE = 'saved_search_match';

    /** Les langues de la surface publique (ADR-0026) ; toute autre retombe sur la première. */
    private const PUBLIC_LOCALES = ['fr', 'en', 'wo'];

    /**
     * @param  Collection<int, Property>  $properties  au plus cinq, rechargés par `Property::public()`
     * @param  int  $total  le compte du moteur, pas celui de `$properties`
     */
    public function __construct(
        public readonly SavedSearch $search,
        public readonly Collection $properties,
        public readonly int $total,
    ) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        if ($notifiable instanceof User) {
            $resolver = app(PreferenceResolver::class);
            // La cloche en DERNIER (verif-599 m11) : un envoi qui échoue lève avant qu'elle soit
            // écrite, la réservation est rendue, et la reprise ne la double pas.
            $channels = [];
            if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_EMAIL)) {
                $channels[] = 'mail';
            }
            if ($this->shouldSendWhatsapp()
                && $resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_WHATSAPP)) {
                $channels[] = 'whatsapp';
            }
            $channels[] = 'database';

            return $channels;
        }

        if ($notifiable instanceof AlertSubscriber && $notifiable->isConfirmed()) {
            return match ($notifiable->channel) {
                AlertSubscriber::CHANNEL_EMAIL => ['mail'],
                AlertSubscriber::CHANNEL_WHATSAPP => $this->shouldSendWhatsapp() ? ['whatsapp'] : [],
                default => [],
            };
        }

        return [];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $locale = $this->localeFor($notifiable);
        $unsubscribe = $this->unsubscribeUrls($notifiable, $locale);

        return (new MailMessage)
            ->subject(__('saved_search_alerts.title', ['name' => $this->name()]))
            ->markdown('emails.alerts.saved-search-matches', [
                // verif-599 B1 — le nom est une saisie : il reste du texte dans le Markdown.
                'name' => MarkdownText::escape($this->name()),
                'total' => $this->total,
                'cards' => $this->cards($locale),
                'seeAllUrl' => $this->seeAllUrl($locale),
                'unsubscribeUrl' => $unsubscribe['page'],
            ])
            // RFC 8058 — la désinscription en un clic du client de messagerie est un POST sur
            // l'API ; le lien visible ouvre une page à un bouton. Un GET ne désinscrit jamais.
            ->withSymfonyMessage(function (Email $message) use ($unsubscribe): void {
                $message->getHeaders()->addTextHeader('List-Unsubscribe', '<'.$unsubscribe['one_click'].'>');
                $message->getHeaders()->addTextHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
            });
    }

    /** @return array<string, mixed> */
    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'title' => __('saved_search_alerts.title', ['name' => $this->name()]),
            'body' => trans_choice('saved_search_alerts.body', $this->total, ['total' => $this->total, 'name' => $this->name()]),
            'data' => $this->toArray($notifiable),
            'referenceable_type' => SavedSearch::class,
            'referenceable_id' => $this->search->getKey(),
            'target' => NotificationTarget::of('saved_searches')->toArray(),
        ];
    }

    /** @return array{saved_search_id: int, total: int, property_ids: list<int>} */
    public function toArray(object $notifiable): array
    {
        return [
            'saved_search_id' => (int) $this->search->getKey(),
            'total' => $this->total,
            'property_ids' => $this->properties->modelKeys(),
        ];
    }

    public function toWhatsapp(object $notifiable): string
    {
        return trans_choice('saved_search_alerts.whatsapp', $this->total, [
            'total' => $this->total,
            'name' => $this->name(),
            'url' => $this->seeAllUrl($this->localeFor($notifiable)),
        ]);
    }

    /** Hors fenêtre de service : le gabarit `utility` du registre, par `whatsappEventType()`. */
    public function whatsappTemplate(object $notifiable): ?WhatsappTemplateRef
    {
        return null;
    }

    public function shouldSendWhatsapp(): bool
    {
        return (bool) config('search_alerts.whatsapp_enabled');
    }

    public function isCriticalWhatsapp(): bool
    {
        return false;
    }

    public function whatsappEventType(): string
    {
        return self::EVENT_TYPE;
    }

    /** @return list<string> */
    public function whatsappTemplateParams(object $notifiable): array
    {
        return [(string) $this->total, $this->name(), $this->seeAllUrl($this->localeFor($notifiable))];
    }

    /** ADR-0050, décision de session 3 — lu par `WhatsappChannel` avant tout repli. */
    public function smsFallbackAllowed(): bool
    {
        return false;
    }

    private function name(): string
    {
        $name = trim((string) $this->search->name);

        return $name !== '' ? $name : __('saved_search_alerts.default_name');
    }

    private function localeFor(object $notifiable): string
    {
        $locale = method_exists($notifiable, 'preferredLocale') ? $notifiable->preferredLocale() : null;

        return in_array($locale, self::PUBLIC_LOCALES, true) ? $locale : self::PUBLIC_LOCALES[0];
    }

    private function frontend(string $path): string
    {
        return rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/').$path;
    }

    /** Le lien « voir les N résultats » : la liste publique, sur les mêmes critères. */
    private function seeAllUrl(string $locale): string
    {
        $query = [];
        foreach (SavedSearchCriteria::toSearchParams($this->search->criteria ?? []) as $key => $value) {
            if ($key === 'cities') {
                // La liste ne lit qu'une ville : la première, plutôt qu'une liste qu'elle ignorerait.
                $value = $value[0] ?? null;
                $key = 'city';
            }
            if ($value === null || $value === '' || $value === []) {
                continue;
            }
            $query[$key] = is_bool($value) ? ($value ? 'true' : 'false') : $value;
        }

        $qs = http_build_query($query, '', '&', PHP_QUERY_RFC3986);

        return $this->frontend('/'.$locale.'/properties'.($qs !== '' ? '?'.$qs : ''));
    }

    /**
     * @return list<array{title: string, url: string, price: string, place: ?string, photo: ?string}>
     */
    private function cards(string $locale): array
    {
        WatermarkRequirement::attach($this->properties);
        $formatter = app(CurrencyFormatter::class);

        return $this->properties->map(function (Property $property) use ($locale, $formatter): array {
            $address = $property->address;
            $media = $property->getFirstMedia('photos');

            return [
                // Un titre est une saisie libre : il reste du texte dans le lien Markdown.
                'title' => MarkdownText::escape((string) $property->title),
                'url' => $this->frontend('/'.$locale.'/properties/'.rawurlencode((string) $property->slug)),
                'price' => $formatter->format((float) $property->price, $property->currency, $locale),
                // Le quartier et la ville sont des saisies libres de l'annonceur (verif-599 B1-bis).
                'place' => ($lieu = $address?->neighborhood ?: $address?->city) ? MarkdownText::escape((string) $lieu) : null,
                'photo' => $media ? PublicPhotoUrl::upTo($media, 'preview', fn () => $property->requiresWatermark()) : null,
            ];
        })->all();
    }

    /** @return array{page: string, one_click: string} */
    private function unsubscribeUrls(object $notifiable, string $locale): array
    {
        if ($notifiable instanceof AlertSubscriber) {
            $token = rawurlencode($notifiable->unsubscribeToken());

            return [
                'page' => $this->frontend('/'.$locale.'/search-alerts/unsubscribe?token='.$token),
                'one_click' => rtrim((string) config('app.url'), '/').'/api/public/search-alerts/unsubscribe?token='.$token,
            ];
        }

        // ADR-0050, décision de session 4 — URL signée RELATIVE : la page du front la rejoue telle
        // quelle vers l'API, dont l'hôte diffère.
        $signed = URL::temporarySignedRoute(
            'saved-searches.unsubscribe',
            now()->addDays((int) config('search_alerts.account_unsubscribe_days', 60)),
            ['savedSearch' => $this->search->getKey()],
            false,
        );
        $query = (string) parse_url($signed, PHP_URL_QUERY);

        return [
            'page' => $this->frontend('/'.$locale.'/search-alerts/unsubscribe?search='.$this->search->getKey().'&'.$query),
            'one_click' => rtrim((string) config('app.url'), '/').$signed,
        ];
    }
}
