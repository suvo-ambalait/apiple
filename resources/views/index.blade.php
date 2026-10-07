<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }}</title>
    <link rel="stylesheet" href="{{ asset('vendor/api-reference/app.css') }}?v={{ $version }}">
</head>
<body>
    <header id="topbar">
        <button id="btn-menu" class="btn btn-secondary btn-icon" type="button" aria-label="Menu">☰</button>
        <div class="brand">{{ $title }} @if (!empty($options['subtitle']))<small>{{ $options['subtitle'] }}</small>@endif</div>
        <input id="search" type="search" placeholder="Search endpoints…  ( / )" autocomplete="off">
        <div class="topbar-actions">
            <button id="base-pill" class="pill" type="button" title="Base URL — click to change"></button>
            <button id="token-pill" class="pill none" type="button" title="Auth token — click to change">No token</button>
            <button id="btn-settings" class="btn btn-secondary" type="button">Settings</button>
            <button id="btn-postman" class="btn btn-secondary" type="button">Postman collection</button>
            <button id="btn-openapi" class="btn btn-secondary" type="button">OpenAPI JSON</button>
        </div>
    </header>
    <div id="settings" class="popover" hidden></div>
    <div id="backdrop" hidden></div>
    <div id="layout">
        <aside id="sidebar"><nav id="nav"></nav></aside>
        <main id="content"><p class="muted">Loading API reference…</p></main>
    </div>
    {{-- Options for the browser code. The spec URL is relative, so it stays same-origin even if APP_URL is wrong. --}}
    <script>window.API_REFERENCE = {{ \Illuminate\Support\Js::from($options) }};</script>
    @foreach (['core', 'snippets', 'export', 'tryit', 'ui'] as $script)
        <script src="{{ asset('vendor/api-reference/' . $script . '.js') }}?v={{ $version }}"></script>
    @endforeach
</body>
</html>
