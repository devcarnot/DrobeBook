type SendEmailInput = {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
};

export type SendEmailResult = {
  ok: boolean;
  provider: "resend" | "log";
  messageId?: string;
  error?: string;
  warning?: string;
};

export function isUsableResendKey(apiKey: string | undefined) {
  if (!apiKey) {
    return false;
  }

  const normalized = apiKey.trim().toLowerCase();
  if (!normalized.startsWith("re_")) {
    return false;
  }

  if (normalized.length < 16) {
    return false;
  }

  if (/^re_[x]+$/.test(normalized) || normalized.includes("xxxx")) {
    return false;
  }

  return true;
}

function logEmailPreview(
  shop: string,
  input: SendEmailInput,
  hint: string,
): SendEmailResult {
  console.info("[gk-drobe-notification]", {
    shop,
    to: input.to,
    subject: input.subject,
    preview: input.bodyText.slice(0, 240),
    hint,
  });

  return {
    ok: true,
    provider: "log",
    messageId: `log-${Date.now()}`,
    warning:
      "Email logged to the server console. Add a valid RESEND_API_KEY and NOTIFICATION_FROM_EMAIL to deliver real emails.",
  };
}

function resolveFromAddress(fromName: string, fromEmail: string, shop: string) {
  const email = fromEmail.trim() || process.env.NOTIFICATION_FROM_EMAIL?.trim() || "";
  if (!email) {
    return {
      from: `"${fromName || "GK.Drobe"}" <notifications@${shop.replace(/\.myshopify\.com$/i, "")}.gk-drobe.local>`,
      usable: false,
    };
  }

  return {
    from: fromName ? `"${fromName}" <${email}>` : email,
    usable: true,
  };
}

export async function sendNotificationEmail(
  shop: string,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const resendConfigured = isUsableResendKey(apiKey);
  const { usable } = resolveFromAddress(input.fromName, input.fromEmail, shop);

  if (!input.to.trim()) {
    return { ok: false, provider: "log", error: "Missing recipient email." };
  }

  if (!resendConfigured || !usable) {
    return logEmailPreview(
      shop,
      input,
      resendConfigured
        ? "Set Notifications from email in admin settings or NOTIFICATION_FROM_EMAIL in .env."
        : "Set a valid RESEND_API_KEY and NOTIFICATION_FROM_EMAIL to deliver emails.",
    );
  }

  const fromEmail = input.fromEmail.trim() || process.env.NOTIFICATION_FROM_EMAIL!.trim();

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.fromName ? `${input.fromName} <${fromEmail}>` : fromEmail,
        to: [input.to],
        subject: input.subject,
        html: input.bodyHtml,
        text: input.bodyText,
        reply_to: input.replyTo?.trim() || undefined,
      }),
    });

    const data = (await response.json()) as {
      id?: string;
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      const apiError =
        data.message || data.error || `Email API failed (${response.status})`;

      if (process.env.NODE_ENV !== "production") {
        return logEmailPreview(
          shop,
          input,
          `Resend rejected the request: ${apiError}`,
        );
      }

      return {
        ok: false,
        provider: "resend",
        error: apiError,
      };
    }

    return {
      ok: true,
      provider: "resend",
      messageId: data.id,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "resend",
      error: error instanceof Error ? error.message : "Could not send email.",
    };
  }
}
