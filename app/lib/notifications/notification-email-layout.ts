const BRAND = {
  bg: "#f6f4f1",
  card: "#ffffff",
  text: "#1a1a1a",
  muted: "#5c5c5c",
  accent: "#2d2a26",
  accentSoft: "#8b7355",
  border: "#e8e4de",
  button: "#1a1a1a",
  buttonText: "#ffffff",
};

const DETAIL_LABELS = new Set(
  [
    "Delivery date",
    "Return date",
    "Event date",
    "Order reference",
    "Date",
    "Time",
    "Duration",
    "Track your delivery",
    "Credit code",
    "Value",
    "Expires",
  ].map((label) => label.toLowerCase()),
);

function isProductHighlightLine(line: string) {
  return /·\s*Size\s+\d+/i.test(line) || /\bSize\s+\d+/i.test(line);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function isDetailLabel(label: string) {
  return DETAIL_LABELS.has(label.trim().toLowerCase());
}

function renderDetailTable(rows: Array<{ label: string; value: string }>) {
  if (!rows.length) {
    return "";
  }

  const cells = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 16px 10px 0;color:${BRAND.muted};font-size:14px;vertical-align:top;width:38%;">${escapeHtml(row.label)}</td>
          <td style="padding:10px 0;font-size:14px;color:${BRAND.text};font-weight:600;">${textToHtml(row.value)}</td>
        </tr>`,
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;background:${BRAND.bg};border-radius:12px;border:1px solid ${BRAND.border};">
      <tr>
        <td style="padding:16px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${cells}</table>
        </td>
      </tr>
    </table>`;
}

function renderButton(href: string, label: string) {
  const safeHref = escapeHtml(href);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:999px;background:${BRAND.button};">
          <a href="${safeHref}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${BRAND.buttonText};text-decoration:none;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

function buttonLabelForUrl(url: string) {
  if (/claim|waitlist|token/i.test(url)) {
    return "View availability";
  }
  if (/track|shipping|auspost|startrack/i.test(url)) {
    return "Track delivery";
  }
  return "Open link";
}

/** Turn plain-text template body into structured HTML blocks. */
export function bodyTextToStructuredHtml(bodyText: string) {
  const blocks = bodyText.split(/\n\n+/).filter((block) => block.trim());
  const parts: string[] = [];
  let pendingDetails: Array<{ label: string; value: string }> = [];

  const flushDetails = () => {
    if (pendingDetails.length) {
      parts.push(renderDetailTable(pendingDetails));
      pendingDetails = [];
    }
  };

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
      const detailMatch = /^([^:\n]+):\s*(.+)$/.exec(line);
      if (detailMatch && isDetailLabel(detailMatch[1])) {
        pendingDetails.push({
          label: detailMatch[1].trim(),
          value: detailMatch[2].trim(),
        });
        continue;
      }

      if (/^https?:\/\//i.test(line)) {
        flushDetails();
        parts.push(renderButton(line, buttonLabelForUrl(line)));
        continue;
      }

      flushDetails();

      if (isProductHighlightLine(line)) {
        parts.push(`
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 18px;background:${BRAND.bg};border-left:4px solid ${BRAND.accentSoft};border-radius:8px;">
            <tr>
              <td style="padding:14px 18px;font-size:16px;line-height:1.5;color:${BRAND.text};font-weight:600;">${textToHtml(line)}</td>
            </tr>
          </table>`);
        continue;
      }

      const trackInline = /Track your delivery:\s*(https?:\/\/\S+)/i.exec(line);
      if (trackInline) {
        parts.push(
          `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.text};">Track your delivery</p>`,
        );
        parts.push(renderButton(trackInline[1], "Track delivery"));
        continue;
      }

      const bookInline = /Book now while it's available:\s*(https?:\/\/\S+)/i.exec(line);
      if (bookInline) {
        parts.push(
          `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.text};">A gown on your waitlist may be available now.</p>`,
        );
        parts.push(renderButton(bookInline[1], "Book now"));
        continue;
      }

      parts.push(
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${BRAND.text};">${textToHtml(line)}</p>`,
      );
    }
  }

  flushDetails();
  return parts.join("\n");
}

export function wrapNotificationEmailHtml(input: {
  shopName: string;
  subject: string;
  bodyInnerHtml: string;
  preheader?: string;
}) {
  const shopName = escapeHtml(input.shopName.trim() || "GK Drobe");
  const preheader = escapeHtml(
    (input.preheader ?? input.subject).replace(/\s+/g, " ").trim().slice(0, 120),
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="padding:0 0 20px;text-align:center;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:0.06em;color:${BRAND.accent};">${shopName}</div>
              <div style="height:3px;width:48px;background:${BRAND.accentSoft};margin:12px auto 0;border-radius:999px;"></div>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;padding:32px 28px;box-shadow:0 8px 30px rgba(26,26,26,0.06);">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                ${input.bodyInnerHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.muted};">
              <p style="margin:0 0 6px;">You're receiving this email about your booking with ${shopName}.</p>
              <p style="margin:0;">Questions? Reply to this email — we're happy to help.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
