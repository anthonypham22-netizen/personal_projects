import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  NOTIFICATION_FREQUENCIES,
  NOTIFICATION_TYPES,
  type Notification,
  type NotificationFrequency,
  type NotificationPreferences,
  type NotificationType,
} from "./types.ts";
import { inImmediateTransaction } from "./sqlite-transaction.ts";
import { tableExists } from "./sqlite-schema.ts";

const sqliteTimestamp = (date: Date) =>
  date.toISOString().slice(0, 19).replace("T", " ");

const availableAt = (frequency: NotificationFrequency) => {
  const date = new Date();
  if (frequency === "daily_digest") date.setUTCDate(date.getUTCDate() + 1);
  if (frequency === "weekly_digest") date.setUTCDate(date.getUTCDate() + 7);
  return sqliteTimestamp(date);
};

export function notificationPreferencesForUser(
  database: DatabaseSync,
  userId: string,
): NotificationPreferences {
  const preferences = Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, "immediate"]),
  ) as NotificationPreferences;
  if (!tableExists(database, "notification_preferences")) return preferences;
  const rows = database
    .prepare(
      "SELECT notification_type,frequency FROM notification_preferences WHERE user_id=?",
    )
    .all(userId) as Array<{
    notification_type: NotificationType;
    frequency: NotificationFrequency;
  }>;
  for (const row of rows) preferences[row.notification_type] = row.frequency;
  return preferences;
}

export function notificationsForUser(
  database: DatabaseSync,
  userId: string,
  limit = 50,
): Notification[] {
  if (!tableExists(database, "notifications")) return [];
  return database
    .prepare(
      `SELECT id,user_id,type,title,body,href,deal_id,actor_user_id,read_at,created_at
       FROM notifications WHERE user_id=?
       ORDER BY created_at DESC,rowid DESC LIMIT ?`,
    )
    .all(userId, limit)
    .map((row) => ({ ...row })) as Notification[];
}

export function notificationUnreadCountForUser(
  database: DatabaseSync,
  userId: string,
) {
  if (!tableExists(database, "notifications")) return 0;
  const row = database
    .prepare(
      "SELECT COUNT(*) count FROM notifications WHERE user_id=? AND read_at IS NULL",
    )
    .get(userId) as { count: number };
  return row.count;
}

export function activeOrganizationUserIds(
  database: DatabaseSync,
  organizationId: string,
) {
  return organizationUserIds(database, organizationId, false);
}

function organizationUserIds(
  database: DatabaseSync,
  organizationId: string,
  managersOnly: boolean,
) {
  const roleFilter = managersOnly
    ? " AND role IN ('owner','admin','member')"
    : "";
  return (
    database
      .prepare(
        `SELECT user_id FROM organization_members
         WHERE organization_id=? AND status='active'${roleFilter}
         ORDER BY created_at,id`,
      )
      .all(organizationId) as { user_id: string }[]
  ).map(({ user_id }) => user_id);
}

export function dealTeamUserIds(database: DatabaseSync, dealId: string) {
  return dealRecipients(database, dealId, false);
}

/** Users who can manage the seller-side workflow; organization viewers are excluded. */
export function dealManagerUserIds(database: DatabaseSync, dealId: string) {
  return dealRecipients(database, dealId, true);
}

function dealRecipients(
  database: DatabaseSync,
  dealId: string,
  managersOnly: boolean,
) {
  const deal = database
    .prepare(
      `SELECT owner_id,advisor_id,owner_organization_id,advisor_organization_id
       FROM deals WHERE id=?`,
    )
    .get(dealId) as
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
      for (const userId of organizationUserIds(
        database,
        organizationId,
        managersOnly,
      ))
        ids.add(userId);
  return [...ids];
}

export function documentAudienceUserIds(
  database: DatabaseSync,
  dealId: string,
  audience: "team" | "approved" | "buyer",
  buyerId?: string | null,
) {
  if (audience === "team") return dealTeamUserIds(database, dealId);
  if (audience === "buyer") return buyerId ? [buyerId] : [];
  return (
    database
      .prepare(
        "SELECT buyer_id FROM access WHERE deal_id=? AND status='approved' ORDER BY buyer_id",
      )
      .all(dealId) as { buyer_id: string }[]
  ).map(({ buyer_id }) => buyer_id);
}

export function notifyUsers(
  database: DatabaseSync,
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
  if (!tableExists(database, "notifications")) return [];
  if (!tableExists(database, "email_outbox")) return [];
  return withNotificationSavepoint(database, () => {
    const created: string[] = [];
    const uniqueUsers = [...new Set(input.userIds)].filter(
      (userId) => userId && userId !== input.actorUserId,
    );
    if (!uniqueUsers.length) return created;
    const placeholders = uniqueUsers.map(() => "?").join(",");
    const recipients = new Map(
      (
        database
          .prepare(`SELECT id,email FROM users WHERE id IN (${placeholders})`)
          .all(...uniqueUsers) as Array<{ id: string; email: string }>
      ).map(({ id, email }) => [id, email]),
    );
    const preferences = new Map(
      (
        database
          .prepare(
            `SELECT user_id,frequency FROM notification_preferences
             WHERE notification_type=? AND user_id IN (${placeholders})`,
          )
          .all(input.type, ...uniqueUsers) as Array<{
          user_id: string;
          frequency: NotificationFrequency;
        }>
      ).map(({ user_id, frequency }) => [user_id, frequency]),
    );
    const insertNotification = database.prepare(
      `INSERT OR IGNORE INTO notifications(
        id,user_id,type,title,body,href,deal_id,actor_user_id,source_key
      ) VALUES(?,?,?,?,?,?,?,?,?)`,
    );
    const findNotification = database.prepare(
      `SELECT id FROM notifications
       WHERE user_id=? AND type=? AND source_key=? LIMIT 1`,
    );
    const outboxForNotification = database.prepare(
      "SELECT 1 FROM email_outbox WHERE notification_id=? LIMIT 1",
    );
    const insertOutbox = database.prepare(
      `INSERT INTO email_outbox(
        id,notification_id,user_id,recipient_email,subject,body,frequency,status,available_at,provider
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    );
    const applicationUrl = (
      process.env.APP_URL || "http://localhost:3000"
    ).replace(/\/$/, "");
    for (const userId of uniqueUsers) {
      const recipientEmail = recipients.get(userId);
      if (!recipientEmail) continue;
      const notificationId = randomUUID();
      const result = insertNotification.run(
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
        : (findNotification.get(userId, input.type, input.sourceKey) as
            { id: string } | undefined);
      if (!existing) continue;
      if (result.changes) created.push(existing.id);
      const frequency = preferences.get(userId) ?? "immediate";
      if (frequency === "disabled" || outboxForNotification.get(existing.id))
        continue;
      const development = process.env.NODE_ENV !== "production";
      insertOutbox.run(
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

function withNotificationSavepoint<T>(
  database: DatabaseSync,
  operation: () => T,
): T {
  const name = `notify_users_${randomUUID().replaceAll("-", "")}`;
  database.exec(`SAVEPOINT ${name}`);
  try {
    const result = operation();
    database.exec(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (error) {
    try {
      database.exec(`ROLLBACK TO SAVEPOINT ${name}`);
    } finally {
      database.exec(`RELEASE SAVEPOINT ${name}`);
    }
    throw error;
  }
}

export function saveNotificationPreferences(
  database: DatabaseSync,
  userId: string,
  preferences: Partial<NotificationPreferences>,
) {
  inImmediateTransaction(database, () => {
    const update = database.prepare(
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
      update.run(userId, type, frequency);
      if (frequency === "disabled")
        database
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
