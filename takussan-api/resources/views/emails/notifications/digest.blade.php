@component('mail::message')
# {{ __('notifications.digest.greeting') }}

{{ __('notifications.digest.intro') }}

@foreach ($notifications as $notification)
- **{{ $notification->title }}** — {{ $notification->body }}
@endforeach

{{ __('notifications.digest.footer') }}

{{ __('notifications.salutation') }}
@endcomponent
