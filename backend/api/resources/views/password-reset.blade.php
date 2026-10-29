<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reset your FaithStream password</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #101923; color: #f6f2ec; font: 16px/1.5 system-ui, sans-serif; }
        main { width: min(100%, 440px); padding: 32px; border: 1px solid #ffffff20; border-radius: 18px; background: #192431; }
        h1 { margin: 0 0 8px; font-size: 26px; }
        p { color: #f6f2ecaa; }
        label { display: block; margin-top: 18px; font-size: 14px; }
        input { display: block; width: 100%; margin-top: 6px; padding: 12px; border: 1px solid #ffffff25; border-radius: 9px; background: #101923; color: #fff; font: inherit; }
        input[readonly] { color: #f6f2ecaa; }
        button { width: 100%; margin-top: 24px; padding: 13px; border: 0; border-radius: 9px; background: #cb874c; color: #101923; font: inherit; font-weight: 700; cursor: pointer; }
        .error { padding: 10px 12px; border: 1px solid #ef444455; border-radius: 9px; background: #ef44441a; color: #fecaca; }
        .hint { font-size: 13px; }
    </style>
</head>
<body>
<main>
    <h1>Reset your password</h1>
    <p>Choose a new password for your FaithStream account.</p>

    @if ($errors->any())
        <div class="error" role="alert">{{ $errors->first() }}</div>
    @endif

    <form method="POST" action="{{ route('password.update') }}">
        @csrf
        <input type="hidden" name="token" value="{{ $token }}">
        <label for="email">Gmail address
            <input id="email" name="email" type="email" value="{{ old('email', $email) }}" autocomplete="email" required readonly>
        </label>
        <label for="password">New password
            <input id="password" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required autofocus>
        </label>
        <label for="password_confirmation">Confirm new password
            <input id="password_confirmation" name="password_confirmation" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>
        </label>
        <p class="hint">Use at least 12 characters.</p>
        <button type="submit">Save new password</button>
    </form>
</main>
</body>
</html>
