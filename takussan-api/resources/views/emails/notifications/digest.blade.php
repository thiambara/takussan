{{-- verif-599 B1-bis — titre et corps d'une cloche peuvent citer une saisie (titre de bien, nom) : texte, jamais Markdown. --}}
@component('mail::message')
# {{ __('notifications.digest.greeting') }}

{{ __('notifications.digest.intro') }}

@foreach ($notifications as $notification)
- **{{ \App\Support\MarkdownText::escape((string) $notification->title) }}** — {{ \App\Support\MarkdownText::escape((string) $notification->body) }}
@endforeach

{{ __('notifications.digest.footer') }}

{{ __('notifications.salutation') }}
@endcomponent
