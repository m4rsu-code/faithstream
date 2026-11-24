<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reset your FaithStream Studio password</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            display: grid;
            min-height: 100vh;
            margin: 0;
            padding: 24px;
            place-items: center;
            background: #101923;
            color: #f6f2ec;
            font: 16px/1.5 system-ui, sans-serif;
        }

        main {
            width: min(100%, 440px);
            padding: 32px;
            border: 1px solid #ffffff20;
            border-radius: 18px;
            background: #192431;
        }

        h1 {
            margin: 0 0 8px;
            font-size: 26px;
        }

        p {
            color: #f6f2ecaa;
        }

        label {
            display: block;
            margin-top: 18px;
            font-size: 14px;
        }

        input {
            display: block;
            width: 100%;
            margin-top: 6px;
            padding: 12px;
            border: 1px solid #ffffff25;
            border-radius: 9px;
            background: #101923;
            color: #fff;
            font: inherit;
        }

        input:focus {
            border-color: #cb874c;
            outline: 2px solid #cb874c40;
        }

        input[readonly] {
            color: #f6f2ecaa;
        }

        .password-control {
            position: relative;
            margin-top: 6px;
        }

        .password-control input {
            margin-top: 0;
            padding-right: 52px;
        }

        .password-toggle {
            position: absolute;
            top: 50%;
            right: 8px;
            display: grid;
            width: 36px;
            height: 36px;
            margin: 0;
            padding: 7px;
            transform: translateY(-50%);
            place-items: center;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: #aebbc5;
            cursor: pointer;
        }

        .password-toggle:hover,
        .password-toggle:focus-visible {
            background: #ffffff12;
            color: #f6f2ec;
        }

        .password-toggle:focus-visible {
            outline: 2px solid #cb874c;
        }

        .password-toggle svg {
            display: block;
            width: 20px;
            height: 20px;
            fill: none;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 1.8;
        }

        .password-toggle .eye-closed {
            display: none !important;
        }

        .password-toggle.is-visible .eye-open {
            display: none !important;
        }

        .password-toggle.is-visible .eye-closed {
            display: block !important;
        }

        .error {
            padding: 10px 12px;
            border: 1px solid #ef444455;
            border-radius: 9px;
            background: #ef44441a;
            color: #fecaca;
        }

        .hint {
            font-size: 13px;
        }

        .submit-button {
            width: 100%;
            margin-top: 24px;
            padding: 13px;
            border: 0;
            border-radius: 9px;
            background: #cb874c;
            color: #101923;
            font: inherit;
            font-weight: 700;
            cursor: pointer;
        }

        .submit-button:hover {
            background: #dda36f;
        }

        @media (max-width: 480px) {
            main {
                padding: 25px 21px;
            }
        }
    </style>
</head>

<body>
    <main>
        <h1>Reset your password</h1>
        <p>Choose a new password for your FaithStream Studio account.</p>

        @if ($errors->any())
            <div class="error" role="alert">
                {{ $errors->first() }}
            </div>
        @endif

        <form method="POST" action="{{ route('password.update') }}">
            @csrf

            <input type="hidden" name="token" value="{{ $token }}">

            <label for="email">Gmail address</label>
            <input
                id="email"
                name="email"
                type="email"
                value="{{ old('email', $email) }}"
                autocomplete="email"
                required
                readonly
            >

            <label for="password">New password</label>
            <div class="password-control">
                <input
                    id="password"
                    name="password"
                    type="password"
                    minlength="12"
                    maxlength="128"
                    autocomplete="new-password"
                    required
                    autofocus
                >
                <button
                    class="password-toggle"
                    type="button"
                    data-password-toggle
                    aria-label="Show new password"
                    aria-pressed="false"
                >
                    <svg class="eye-open" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <svg class="eye-closed" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 3l18 18"></path>
                        <path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15.7 15.7 0 0 1-3.1 3.8"></path>
                        <path d="M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.3 0 2.5-.3 3.6-.8"></path>
                        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>
                    </svg>
                </button>
            </div>

            <label for="password_confirmation">Confirm new password</label>
            <div class="password-control">
                <input
                    id="password_confirmation"
                    name="password_confirmation"
                    type="password"
                    minlength="12"
                    maxlength="128"
                    autocomplete="new-password"
                    required
                >
                <button
                    class="password-toggle"
                    type="button"
                    data-password-toggle
                    aria-label="Show confirmation password"
                    aria-pressed="false"
                >
                    <svg class="eye-open" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <svg class="eye-closed" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 3l18 18"></path>
                        <path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15.7 15.7 0 0 1-3.1 3.8"></path>
                        <path d="M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.3 0 2.5-.3 3.6-.8"></path>
                        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>
                    </svg>
                </button>
            </div>

            <p class="hint">Use at least 12 characters.</p>

            <button class="submit-button" type="submit">
                Save new password
            </button>
        </form>
    </main>

    <script nonce="{{ request()->attributes->get('cspNonce') }}">
        document.querySelectorAll('[data-password-toggle]').forEach((button) => {
            button.addEventListener('click', () => {
                const control = button.closest('.password-control');
                const input = control?.querySelector('input');
                if (!input) return;

                const willShowPassword = input.type === 'password';
                input.type = willShowPassword ? 'text' : 'password';
                button.classList.toggle('is-visible', willShowPassword);
                button.setAttribute('aria-pressed', String(willShowPassword));

                const label = input.id === 'password'
                    ? 'new password'
                    : 'confirmation password';

                button.setAttribute(
                    'aria-label',
                    `${willShowPassword ? 'Hide' : 'Show'} ${label}`
                );
            });
        });
    </script>
</body>
</html>
