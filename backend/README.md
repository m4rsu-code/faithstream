# FaithStream Backend

API and server for FaithStream: authentication, church accounts, saved slides and stream settings.

## Local development

The Laravel API lives in `backend/api`. It supports Gmail-only account registration, signed email verification, password login and reset, Sanctum bearer tokens, current-user lookup, and sign-out.

1. Install PHP 8.3 or newer, Composer, and PostgreSQL.
2. In `backend/api/.env`, set `DB_DATABASE=faithstream`, `DB_USERNAME=postgres`, and `DB_PASSWORD` to the PostgreSQL password you chose. The file is local and must not be committed.
3. Create the `faithstream` database in pgAdmin if it does not exist.
4. From the FaithStream project root, run:

   ```powershell
   php artisan migrate
   php artisan serve
   ```

5. Keep that terminal running, then start the desktop app. The desktop sign-in form calls `http://127.0.0.1:8000/api`.

Laravel hashes passwords before storing them. Registration accepts only addresses whose domain is exactly `gmail.com`; this checks the address format and domain, but does not yet verify ownership through a Google sign-in or email verification flow.

## Password reset email

The forgot-password button uses Laravel's password broker and the existing `password_reset_tokens` table. Reset tokens are stored hashed, expire after 60 minutes, and are throttled. The reset form is served by Laravel at the link sent by email. A successful reset revokes the user's existing API tokens.

The default `MAIL_MAILER=log` is development-only: Laravel writes the reset email, including its link, to `storage/logs/laravel.log` instead of sending it. To deliver mail to Gmail, configure a trusted SMTP provider in `backend/api/.env`; use an app password or provider credential and never commit or share it. The forgot-password endpoint always returns the same message whether an account exists, to avoid exposing registered addresses.

## Email verification

New accounts receive Laravel's signed, temporary email-verification link. Sign-in is blocked until the link is opened; the app offers a rate-limited resend action for existing unverified accounts. A successful link visit sets `users.email_verified_at`. The verification link also requires working mail delivery, so configure SMTP as described above; with `MAIL_MAILER=log`, inspect `storage/logs/laravel.log` during local development.

## Database safety

The authentication endpoints use Laravel validation and Eloquent/database parameter binding; they do not build SQL from user input. Do not add raw SQL with interpolated form values. For a deployed environment, use a dedicated PostgreSQL role with only the permissions the app needs, set `APP_DEBUG=false`, restrict CORS to the app's trusted origin, and keep `.env` and mail credentials private. No application can promise that it is impossible to be hacked, but these practices reduce the main risks for this flow.
