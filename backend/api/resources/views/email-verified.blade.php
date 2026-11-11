<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Email verified — FaithStream Studio</title>
    <style>
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #101923; color: #f6f2ec; font: 16px/1.5 system-ui, sans-serif; }
        main { width: min(100%, 440px); padding: 32px; border: 1px solid #ffffff20; border-radius: 18px; background: #192431; text-align: center; }
        h1 { margin: 0 0 8px; font-size: 26px; }
        p { color: #f6f2ecaa; }
    </style>
</head>
<body>
<main>
    <h1>{{ $alreadyVerified ? 'Email already verified' : 'Email verified' }}</h1>
    <p>Your FaithStream Studio email is verified. You can now sign in to the website or desktop app with the same account.</p>
</main>
</body>
</html>
