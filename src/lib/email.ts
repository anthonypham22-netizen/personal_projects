import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "./db";

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
};

export type EmailResult = {
  provider: string;
  messageId: string;
};

export type EmailSendOptions = {
  signal?: AbortSignal;
};

export interface EmailProvider {
  send(message: EmailMessage, options?: EmailSendOptions): Promise<EmailResult>;
}

export class DevelopmentEmailProvider implements EmailProvider {
  async send(_message: EmailMessage): Promise<EmailResult> {
    return {
      provider: "development",
      messageId: `development-${randomUUID()}`,
    };
  }
}

export function emailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (
    process.env.NODE_ENV === "production" &&
    (!provider || provider === "development")
  )
    throw new Error(
      "Email delivery is disabled: configure a production EMAIL_PROVIDER before processing the outbox.",
    );
  if (!provider || provider === "development")
    return new DevelopmentEmailProvider();
  throw new Error(
    `Email provider "${provider}" is not configured. Leave EMAIL_PROVIDER unset to record emails safely in development.`,
  );
}

export async function deliverPendingEmails(
  database: DatabaseClient,
  provider: EmailProvider = emailProvider(),
  limit = 25,
  deliveryTimeoutMs = 60_000,
) {
  const rows = (await database
    .prepare(
      `SELECT e.id,e.recipient_email,e.subject,e.body
       FROM email_outbox e
       LEFT JOIN notification_preferences p
         ON p.user_id=e.user_id AND p.notification_type=(
           SELECT type FROM notifications WHERE id=e.notification_id
         )
       WHERE e.frequency='immediate'
         AND COALESCE(p.frequency,'immediate')='immediate'
         AND e.available_at<=CURRENT_TIMESTAMP
         AND (
           e.status='queued' OR
           (e.status='processing' AND e.processing_at<=datetime('now','-15 minutes'))
         )
       ORDER BY e.available_at,e.created_at,e.id LIMIT ?`,
    )
    .all(limit)) as Array<{
    id: string;
    recipient_email: string;
    subject: string;
    body: string;
  }>;
  const claim = database.prepare(
    `UPDATE email_outbox
     SET status='processing',attempts=attempts+1,processing_at=CURRENT_TIMESTAMP,
         processing_token=?
     WHERE id=?
       AND COALESCE((
         SELECT p.frequency FROM notification_preferences p
         JOIN notifications n ON n.type=p.notification_type
         WHERE p.user_id=email_outbox.user_id AND n.id=email_outbox.notification_id
       ),'immediate')='immediate'
       AND (
       status='queued' OR
       (status='processing' AND processing_at<=datetime('now','-15 minutes'))
     )`,
  );
  const markSent = database.prepare(
    `UPDATE email_outbox SET status='sent',provider=?,provider_message_id=?,
       last_error=NULL,processing_at=NULL,processing_token=NULL,
       sent_at=CURRENT_TIMESTAMP WHERE id=? AND status='processing' AND processing_token=?`,
  );
  const markFailed = database.prepare(
    `UPDATE email_outbox
     SET status='failed',last_error=?,processing_at=NULL,processing_token=NULL
     WHERE id=? AND status='processing' AND processing_token=?`,
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const processingToken = randomUUID();
    const claimed = await claim.run(processingToken, row.id);
    if (!claimed.changes) continue;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort(new Error("Email delivery timed out."));
          reject(new Error("Email delivery timed out."));
        }, deliveryTimeoutMs);
      });
      const result = await Promise.race([
        provider.send(
          {
            to: row.recipient_email,
            subject: row.subject,
            body: row.body,
            idempotencyKey: row.id,
          },
          { signal: controller.signal },
        ),
        timeoutPromise,
      ]);
      if (
        (
          await markSent.run(
            result.provider,
            result.messageId,
            row.id,
            processingToken,
          )
        ).changes
      )
        sent += 1;
    } catch (error) {
      if (
        (
          await markFailed.run(
            (error instanceof Error
              ? error.message
              : "Email delivery failed"
            ).slice(0, 1000),
            row.id,
            processingToken,
          )
        ).changes
      )
        failed += 1;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  return { processed: sent + failed, sent, failed };
}
