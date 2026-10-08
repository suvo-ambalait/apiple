# Laravel API Reference

A clean, Postman-style API documentation page for Laravel projects. Use it **instead of Swagger UI**.

It reads an OpenAPI JSON file (the one `l5-swagger` already writes, or the output of Scribe, Dedoc and similar tools) and gives you:

- a **collapsible menu** grouped by tag, with search (press `/`)
- for every endpoint: the full URL, a "needs token / public" badge, readable parameter cards (type, required, description, limits, example) and example responses
- a **Try it** panel to send real requests, with an always-visible response area (status, time, size, body, headers)
- a **login helper** that gets a Bearer token and reuses it for every request
- **code snippets** in cURL, JavaScript and PHP
- one-click **Postman collection** and **OpenAPI JSON** downloads
- white theme, self-hosted font (works offline), no build step

Requires PHP 8.2+ and Laravel 11 or 12.

---

## 1. Install it in any Laravel project

Run these in the **root folder of your Laravel project** (the one that contains `artisan`):

```bash
composer require suvo-ambalait/apiple
php artisan api-reference:install
```

If Composer cannot find the package, add the GitHub repository first:

```bash
composer config repositories.apiple vcs https://github.com/suvo-ambalait/apiple.git
```

`api-reference:install` copies the browser files to `public/vendor/api-reference/` and the config to `config/api-reference.php`.

## 2. Generate the OpenAPI file and open the page

The page needs an OpenAPI JSON file (see section 3). With l5-swagger:

```bash
php artisan l5-swagger:generate
php artisan serve
```

Open **`/api-docs`** in your browser (for example `http://127.0.0.1:8000/api-docs`). Done.

## 3. Where does the documentation come from?

From an OpenAPI JSON file. By default the package reads `storage/api-docs/api-docs.json`, which is exactly where **l5-swagger** (`darkaonline/l5-swagger`) writes it, so if you already document your API with Swagger annotations you do not need to change anything. If l5-swagger is set to generate always, the page regenerates the file on each load.

Using another generator? Point to its file in `.env`:

```env
API_REFERENCE_SPEC=/full/path/to/openapi.json
```

### Writing docs that look great

The page shows whatever the OpenAPI file contains, so fill these in on your endpoints:

- `summary` becomes the menu label and page title, `description` is rendered as Markdown
- a `description` and an `example` on **every request property and parameter**. Without them the Try it body starts with the word `"string"`
- a response example for each status (200, 401, 422...)
- `tags` decide the menu groups; add a tag description for the group subtitle
- `security` on private endpoints shows the "Needs token" badge

## 4. Configuration

Edit `config/api-reference.php` or use `.env`.

| Option | `.env` | Default | What it does |
|---|---|---|---|
| `enabled` | `API_REFERENCE_ENABLED` | on, except in production | Show or hide the page (404 when off) |
| `path` | `API_REFERENCE_PATH` | `api-docs` | URL of the page (`/{path}`) and spec (`/{path}/spec`). Do not use a name that exists as a folder in `public/` |
| `middleware` | | `['web']` | Add `'auth'` or your admin middleware to keep it private |
| `title` | `API_REFERENCE_TITLE` | `"<APP_NAME> API"` | Top bar, browser tab, download file names |
| `subtitle` | `API_REFERENCE_SUBTITLE` | `Reference` | Small text next to the title |
| `spec.file` | `API_REFERENCE_SPEC` | `storage/api-docs/api-docs.json` | The OpenAPI file to render |
| `login.*` | | see below | How the login helper talks to your API |

### Login helper

The Settings panel can log in and keep the token for "Try it". Match it to your own login endpoint:

```php
'login' => [
    'endpoint'       => 'api/login',     // appended to the base URL, no leading slash
    'username_field' => 'email',         // field names in the request body
    'password_field' => 'password',
    'username_label' => 'Email',
    'token_path'     => 'access_token',  // where the token is in the JSON response (dot notation)
    'user_path'      => 'user',          // where the user object is (used to show the name)
],
```

If your API does not have a login endpoint, ignore it: people can paste a token under "Use a token instead".

### Keeping it private in production

```php
'enabled'    => true,
'middleware' => ['web', 'auth'],   // or ['web', 'can:view-api-docs']
```

or simply leave it off in production (the default).

## 5. Updating

In each project:

```bash
composer update suvo-ambalait/apiple
php artisan api-reference:install --force
```

To refresh the assets automatically after every `composer update`, add to the project's `composer.json`:

```json
"scripts": {
    "post-update-cmd": ["@php artisan api-reference:install --force"]
}
```

## 6. Customising the page shell

```bash
php artisan vendor:publish --tag=api-reference-views
```

copies the Blade view to `resources/views/vendor/api-reference/index.blade.php`.

## What is in this folder

```
composer.json                          package definition (auto-discovered by Laravel)
config/api-reference.php               default config
src/ApiReferenceServiceProvider.php    registers routes, config, publishable files, the install command
src/Console/InstallCommand.php         php artisan api-reference:install
src/Http/Controllers/...               serves the page and the OpenAPI JSON
resources/views/index.blade.php        page shell
public/                                CSS, JavaScript and fonts (copied to public/vendor/api-reference)
```

## Troubleshooting

- **404 on `/api-docs`**: the page is disabled (`API_REFERENCE_ENABLED=false` or production) or `php artisan route:clear` / `config:clear` is needed.
- **"Could not load the API spec (HTTP 404)"**: the OpenAPI file does not exist yet. Run `php artisan l5-swagger:generate`, or set `API_REFERENCE_SPEC`.
- **`l5-swagger:generate` says a `$ref` like `#/components/schemas/Error` was not found** (swagger-php 6): shared schemas, responses and parameters must not be stacked on the same class. Put `#[OA\Schema]` attributes on one class and `#[OA\Response]` / `#[OA\Parameter]` on another.
- **Page loads but says the spec was not found**: the OpenAPI file is missing. Generate it (`php artisan l5-swagger:generate`) or set `API_REFERENCE_SPEC`.
- **Unstyled page / 404 on assets**: run `php artisan api-reference:install`.
- **Try it fails with "Request failed"**: open Settings and check the Base URL (it defaults to the first server in the OpenAPI file). Calls to a different domain need CORS enabled on your API.

## License

MIT. See [LICENSE](LICENSE).
