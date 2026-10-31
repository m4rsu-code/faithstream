<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Verify your FaithStream email</title>
</head>
<body style="margin:0;padding:32px 12px;background-color:#0b1420;color:#f6f2ec;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background-color:#142235;border:1px solid #26374b;border-radius:16px;">
        <tr>
            <td align="center" style="padding:32px 28px 12px;">
                <img src="cid:faithstream-logo@faithstream.local" width="260" alt="FaithStream" style="display:block;width:100%;max-width:260px;height:auto;border:0;">
            </td>
        </tr>
        <tr>
            <td style="padding:16px 36px 36px;">
                <h1 style="margin:0 0 16px;color:#ffffff;font-size:25px;line-height:1.3;text-align:center;">Verify your email</h1>
                <p style="margin:0 0 12px;color:#e5e7eb;font-size:15px;line-height:1.7;">Hello {{ $name }},</p>
                <p style="margin:0 0 24px;color:#cbd5e1;font-size:15px;line-height:1.7;">Thanks for creating a FaithStream account. Confirm this email address to finish setting up your account.</p>
                <p style="margin:0 0 26px;text-align:center;">
                    <a href="{{ $verificationUrl }}" style="display:inline-block;padding:13px 24px;border-radius:8px;background-color:#d58d4b;color:#111827;font-size:15px;font-weight:bold;text-decoration:none;">Verify email address</a>
                </p>
                <p style="margin:0 0 8px;color:#aebccc;font-size:12px;line-height:1.6;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;"><a href="{{ $verificationUrl }}" style="color:#f1ad6d;">{{ $verificationUrl }}</a></p>
                <hr style="height:1px;margin:26px 0;border:0;background-color:#2c3c50;">
                <p style="margin:0;color:#8998aa;font-size:12px;line-height:1.6;">If you did not create this account, you can ignore this email.</p>
            </td>
        </tr>
    </table>
</body>
</html>
