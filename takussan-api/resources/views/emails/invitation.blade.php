@component('mail::message')
# {{ __('notifications.invitation.greeting') }}

@if ($isReminder)
{{ __('notifications.invitation.reminder_intro', ['role' => __('invitations.roles.'.$invitation->role)]) }}
@else
{{ __('notifications.invitation.intro', ['role' => __('invitations.roles.'.$invitation->role)]) }}
@endif

@component('mail::button', ['url' => $acceptUrl])
{{ __('notifications.invitation.action') }}
@endcomponent

{{ __('notifications.invitation.expires_at', ['date' => $expiresAt?->format('d/m/Y') ?? '']) }}

{{ __('notifications.invitation.ignore') }}

{{ __('notifications.salutation') }}
@endcomponent
