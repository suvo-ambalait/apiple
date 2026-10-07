<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Enabled
    |--------------------------------------------------------------------------
    | Turn the page on or off. Default: on everywhere except production.
    | Set API_REFERENCE_ENABLED=true in .env to show it in production too
    | (and consider adding 'auth' to the middleware below).
    */
    'enabled' => (bool) env('API_REFERENCE_ENABLED', env('APP_ENV') !== 'production'),

    /*
    |--------------------------------------------------------------------------
    | URL path
    |--------------------------------------------------------------------------
    | The page is served at /{path} and the OpenAPI JSON at /{path}/spec.
    | Do not use a name that is also a folder inside your public/ directory.
    */
    'path' => env('API_REFERENCE_PATH', 'api-docs'),

    /*
    |--------------------------------------------------------------------------
    | Middleware
    |--------------------------------------------------------------------------
    | Add 'auth' (or your own admin middleware) to keep the docs private.
    */
    'middleware' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Branding
    |--------------------------------------------------------------------------
    | title: shown in the top bar, the browser tab and download file names.
    |        Defaults to "<APP_NAME> API".
    | subtitle: small text next to the title.
    */
    'title' => env('API_REFERENCE_TITLE'),
    'subtitle' => env('API_REFERENCE_SUBTITLE', 'Reference'),

    /*
    |--------------------------------------------------------------------------
    | OpenAPI file
    |--------------------------------------------------------------------------
    | The JSON file the page renders. l5-swagger writes storage/api-docs/api-docs.json.
    | Scribe, Dedoc, or any generator that outputs OpenAPI 3 JSON works too:
    | just point 'file' at it.
    */
    'spec' => [
        'file' => env('API_REFERENCE_SPEC', storage_path('api-docs/api-docs.json')),
    ],

    /*
    |--------------------------------------------------------------------------
    | Login helper (Settings -> Authentication)
    |--------------------------------------------------------------------------
    | Lets people log in from the page and keeps the Bearer token for "Try it".
    | Adjust these to match your own login endpoint.
    |
    | endpoint        path appended to the base URL, no leading slash
    | username_field  name of the username/email field in the request body
    | password_field  name of the password field in the request body
    | username_label  label shown above the username input
    | token_path      where the token is in the JSON response (dot notation)
    | user_path       where the user object is in the response (for the name)
    */
    'login' => [
        'endpoint' => 'api/login',
        'username_field' => 'email',
        'password_field' => 'password',
        'username_label' => 'Email',
        'token_path' => 'access_token',
        'user_path' => 'user',
    ],

];
