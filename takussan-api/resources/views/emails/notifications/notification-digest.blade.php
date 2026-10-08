{{-- verif-599 B1-bis — titre et corps d'une cloche peuvent citer une saisie (titre de bien, nom) : texte, jamais Markdown. --}}
@component('mail::message')
# {{ __('notifications.digest.greeting') }}

{{ __('notifications.digest.intro') }}

@foreach ($grouped as $type => $notifications)
## {{ __('notifications.types.' . $type) }}

@foreach ($notifications as $notification)
- **{{ \App\Support\MarkdownText::escape((string) $notification->title) }}**{{ $notification->body ? ' — ' . \App\Support\MarkdownText::escape((string) $notification->body) : '' }}
@endforeach

@endforeach

@if ($truncated)
@component('mail::button', ['url' => config('app.frontend_url', config('app.url')) . '/app/notifications'])
{{ __('notifications.digest.see_all') }}
@endcomponent
@endif

---

{{ __('notifications.digest.footer') }}

[{{ __('notifications.digest.unsubscribe') }}]({{ $unsubscribeUrl }})

{{ __('notifications.salutation') }}
@endcomponent
