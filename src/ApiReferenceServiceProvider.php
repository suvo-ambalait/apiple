<?php

namespace Suvo\Apiple;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Suvo\Apiple\Console\InstallCommand;
use Suvo\Apiple\Http\Controllers\ApiReferenceController;

/**
 * Registers the API reference page.
 *
 * Laravel finds this class by itself (composer.json -> extra.laravel.providers).
 * What it does:
 *   - merges config/api-reference.php into the app config
 *   - registers the page and spec routes (only when the page is enabled)
 *   - makes three things publishable: the config, the browser assets, the Blade view
 *   - registers the `php artisan api-reference:install` command
 */
class ApiReferenceServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/../config/api-reference.php', 'api-reference');
    }

    public function boot(): void
    {
        $this->loadViewsFrom(__DIR__ . '/../resources/views', 'api-reference');

        if (config('api-reference.enabled')) {
            $this->registerRoutes();
        }

        if ($this->app->runningInConsole()) {
            $this->commands([InstallCommand::class]);

            // php artisan vendor:publish --tag=api-reference-config
            $this->publishes([
                __DIR__ . '/../config/api-reference.php' => config_path('api-reference.php'),
            ], 'api-reference-config');

            // php artisan vendor:publish --tag=api-reference-assets   (CSS, JS, fonts -> public/vendor/api-reference)
            $this->publishes([
                __DIR__ . '/../public' => public_path('vendor/api-reference'),
            ], 'api-reference-assets');

            // php artisan vendor:publish --tag=api-reference-views    (only if you want to edit the page shell)
            $this->publishes([
                __DIR__ . '/../resources/views' => resource_path('views/vendor/api-reference'),
            ], 'api-reference-views');
        }
    }

    /** GET {path} (the page) and GET {path}/spec (the OpenAPI JSON), behind the configured middleware. */
    private function registerRoutes(): void
    {
        $path = trim((string) config('api-reference.path', 'api-docs'), '/');

        Route::middleware(config('api-reference.middleware', ['web']))->group(function () use ($path) {
            Route::get($path, [ApiReferenceController::class, 'index'])->name('api-reference');
            Route::get($path . '/spec', [ApiReferenceController::class, 'spec'])->name('api-reference.spec');
        });
    }
}
