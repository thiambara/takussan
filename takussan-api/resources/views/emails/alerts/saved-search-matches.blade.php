{{-- TCK-599 (ADR-0050 §3) — au plus cinq biens, le total du moteur, et la sortie de CETTE alerte. --}}
@component('mail::message')
# {{ __('saved_search_alerts.title', ['name' => $name]) }}

{{ trans_choice('saved_search_alerts.body', $total, ['total' => $total, 'name' => $name]) }}

@foreach ($cards as $card)
@if ($card['photo'])
[![{{ $card['title'] }}]({{ $card['photo'] }})]({{ $card['url'] }})
@endif
**[{{ $card['title'] }}]({{ $card['url'] }})**<br>
{{ $card['price'] }}@if ($card['place']) · {{ $card['place'] }}@endif

@endforeach
@if ($total > count($cards))
{{ trans_choice('saved_search_alerts.mail.more', $total - count($cards), ['count' => $total - count($cards)]) }}
@endif

@component('mail::button', ['url' => $seeAllUrl])
{{ trans_choice('saved_search_alerts.mail.see_all', $total, ['total' => $total]) }}
@endcomponent

{{ __('notifications.salutation') }}

@slot('subcopy')
{{ __('saved_search_alerts.mail.reason', ['name' => $name]) }} [{{ __('saved_search_alerts.mail.unsubscribe') }}]({{ $unsubscribeUrl }})
@endslot
@endcomponent
