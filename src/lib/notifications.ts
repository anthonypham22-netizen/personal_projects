import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "./db";
import {
  NOTIFICATION_FREQUENCIES,
  NOTIFICATION_TYPES,
  type Notification,
  type NotificationFrequency,
  type NotificationPreferences,
  type NotificationType,
} from "./types.ts";
import { inTransaction } from "./transaction";
import { tableExists } from "./schema";

const availableAt = (frequency: NotificationFrequency) => {
  const date = new Date();
  if (frequency === "daily_digest") date.setUTCDate(date.getUTCDate() + 1);
  if (frequency === "weekly_digest") date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString();
};

export async function notificationPreferencesForUser(
  database: DatabaseClient,
  userId: string,
): Promise<NotificationPreferences> {
  const preferences = Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, "immediate"]),
  ) as NotificationPreferences;
  if (!(await tableExists(database, "notification_preferences")))
    return preferences;
  const rows = (await database
    .prepare(
      "SELECT notification_type,frequency FROM notification_preferences WHERE user_id=?",
    )
    .all(userId)) as Array<{
    notification_type: NotificationType;
    frequency: NotificationFrequency;
  }>;
  for (const row of rows) preferences[row.notification_type] = row.frequency;
  return preferences;
}

export async function notificationsForUser(
  database: DatabaseClient,
  userId: string,
  limit = 50,
): Promise<Notification[]> {
  if (!(await tableExists(database, "notifications"))) return [];
  return (await database
    .prepare(
      `SELECT id,user_id,type,title,body,href,deal_id,actor_user_id,read_at,created_at
       FROM notifications WHERE user_id=?
       ORDER BY created_at DESC,id DESC LIMIT ?`,
    )
    .all(userId, limit)
    .map((row) => ({ ...row }))) as Notification[];
}

export async function notificationUnreadCountForUser(
  database: DatabaseClient,
  userId: string,
) {
  if (!(await tableExists(database, "notifications"))) return 0;
  const row = (await database
    .prepare(
      "SELECT COUNT(*) count FROM notifications WHERE user_id=? AND read_at IS NULL",
    )
    .get(userId)) as { count: number };
  return row.count;
}

export async function activeOrganizationUserIds(
  database: DatabaseClient,
  organizationId: string,
) {
  return await organizationUserIds(database, organizationId, false);
}

async function organizationUserIds(
  database: DatabaseClient,
  organizationId: string,
  managersOnly: boolean,
) {
  const roleFilter = managersOnly
    ? " AND role IN ('owner','admin','member')"
    : "";
  return (
    (await database
      .prepare(
        `SELECT user_id FROM organization_members
         WHERE organization_id=? AND status='active'${roleFilter}
         ORDER BY created_at,id`,
      )
      .all(organizationId)) as { user_id: string }[]
  ).map(({ user_id }) => user_id);
}

export async function dealTeamUserIds(
  database: DatabaseClient,
  dealId: string,
) {
  return await dealRecipients(database, dealId, false);
}

/** Users who can manage the seller-side workflow; organization viewers are excluded. */
export async function dealManagerUserIds(
  database: DatabaseClient,
  dealId: string,
) {
  return await dealRecipients(database, dealId, true);
}

async function dealRecipients(
  database: DatabaseClient,
  dealId: string,
  managersOnly: boolean,
) {
  const deal = (await database
    .prepare(
      `SELECT owner_id,advisor_id,owner_organization_id,advisor_organization_id
       FROM deals WHERE id=?`,
    )
    .get(dealId)) as
    | {
        owner_id: string;
        advisor_id: string | null;
        owner_organization_id: string | null;
        advisor_organization_id: string | null;
      }
    | undefined;
  if (!deal) return [];
  const ids = new Set<string>();
  if (!deal.owner_organization_id) ids.add(deal.owner_id);
  if (!deal.advisor_organization_id && deal.advisor_id)
    ids.add(deal.advisor_id);
  for (const organizationId of [
    deal.owner_organization_id,
    deal.advisor_organization_id,
  ])
    if (organizationId)
      for (const userId of await organizationUserIds(
        database,
        organizationId,
        managersOnly,
      ))
        ids.add(userId);
  return [...ids];
}

export async function documentAudienceUserIds(
  database: DatabaseClient,
  dealId: string,
  audience: "team" | "approved" | "buyer",
  buyerId?: string | null,
) {
  if (audience === "team") return await dealTeamUserIds(database, dealId);
  if (audience === "buyer") return buyerId ? [buyerId] : [];
  return (
    (await database
      .prepare(
        "SELECT buyer_id FROM access WHERE deal_id=? AND status='approved' ORDER BY buyer_id",
      )
      .all(dealId)) as { buyer_id: string }[]
  ).map(({ buyer_id }) => buyer_id);
}

export async function notifyUsers(
  database: DatabaseClient,
  input: {
    userIds: readonly string[];
    type: NotificationType;
    title: string;
    body: string;
    href: string;
    sourceKey: string;
    dealId?: string | null;
    actorUserId?: string | null;
  },
) {
  if (!(await tableExists(database, "notifications"))) return [];
  if (!(await tableExists(database, "email_outbox"))) return [];
  return withNotificationSavepoint(database, async (transaction) => {
    const created: string[] = [];
    const uniqueUsers = [...new Set(input.userIds)].filter(
      (userId) => userId && userId !== input.actorUserId,
    );
    if (!uniqueUsers.length) return created;
    const placeholders = uniqueUsers.map(() => "?").join(",");
    const recipients = new Map(
      (
        (await transaction
          .prepare(`SELECT id,email FROM users WHERE id IN (${placeholders})`)
          .all(...uniqueUsers)) as Array<{ id: string; email: string }>
      ).map(({ id, email }) => [id, email]),
    );
    const preferences = new Map(
      (
        (await transaction
          .prepare(
            `SELECT user_id,frequency FROM notification_preferences
             WHERE notification_type=? AND user_id IN (${placeholders})`,
          )
          .all(input.type, ...uniqueUsers)) as Array<{
          user_id: string;
          frequency: NotificationFrequency;
        }>
      ).map(({ user_id, frequency }) => [user_id, frequency]),
    );
    const insertNotification = transaction.prepare(
      `INSERT OR IGNORE INTO notifications(
        id,user_id,type,title,body,href,deal_id,actor_user_id,source_key
      ) VALUES(?,?,?,?,?,?,?,?,?)`,
    );
    const findNotification = transaction.prepare(
      `SELECT id FROM notifications
       WHERE user_id=? AND type=? AND source_key=? LIMIT 1`,
    );
    const outboxForNotification = transaction.prepare(
      "SELECT 1 FROM email_outbox WHERE notification_id=? LIMIT 1",
    );
    const insertOutbox = transaction.prepare(
      `INSERT INTO email_outbox(
        id,notification_id,user_id,recipient_email,subject,body,frequency,status,available_at,provider
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    );
    const applicationUrl = (
      process.env.APP_URL || "http://localhost:3000"
    ).replace(/\/$/, "");
    for (const userId of uniqueUsers) {
      const recipientEmail = await recipients.get(userId);
      if (!recipientEmail) continue;
      const notificationId = randomUUID();
      const result = await insertNotification.run(
        notificationId,
        userId,
        input.type,
        input.title,
        input.body,
        input.href,
        input.dealId ?? null,
        input.actorUserId ?? null,
        input.sourceKey,
      );
      const existing = result.changes
        ? { id: notificationId }
        : ((await findNotification.get(userId, input.type, input.sourceKey)) as
            { id: string } | undefined);
      if (!existing) continue;
      if (result.changes) created.push(existing.id);
      const frequency = (await preferences.get(userId)) ?? "immediate";
      if (
        frequency === "disabled" ||
        (await outboxForNotification.get(existing.id))
      )
        continue;
      const development = process.env.NODE_ENV !== "production";
      await insertOutbox.run(
        randomUUID(),
        existing.id,
        userId,
        recipientEmail,
        input.title,
        `${input.body}\n\n${applicationUrl}${input.href}`,
        frequency,
        development ? "recorded" : "queued",
        availableAt(frequency),
        development ? "development" : null,
      );
    }
    return created;
  });
}

async function withNotificationSavepoint<T>(
  database: DatabaseClient,
  operation: (transaction: DatabaseClient) => Promise<T>,
): Promise<T> {
  return inTransaction(database, operation);
}

export async function saveNotificationPreferences(
  database: DatabaseClient,
  userId: string,
  preferences: Partial<NotificationPreferences>,
) {
  await inTransaction(database, async (transaction) => {
    const update = transaction.prepare(
      `INSERT INTO notification_preferences(user_id,notification_type,frequency)
       VALUES(?,?,?)
       ON CONFLICT(user_id,notification_type) DO UPDATE SET
         frequency=excluded.frequency,updated_at=CURRENT_TIMESTAMP
       WHERE notification_preferences.frequency<>excluded.frequency`,
    );
    for (const type of NOTIFICATION_TYPES) {
      const frequency = preferences[type];
      if (!frequency) continue;
      if (!NOTIFICATION_FREQUENCIES.includes(frequency))
        throw new Error("Invalid notification frequency.");
      await update.run(userId, type, frequency);
      if (frequency === "disabled")
        await transaction
          .prepare(
            `UPDATE email_outbox
             SET status='failed',last_error='Email disabled by recipient',processing_at=NULL
             WHERE user_id=? AND frequency='immediate' AND status IN ('queued','recorded')
               AND notification_id IN (
                 SELECT id FROM notifications WHERE user_id=? AND type=?
               )`,
          )
          .run(userId, userId, type);
    }
  });
}
