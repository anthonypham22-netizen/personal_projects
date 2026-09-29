import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DevelopmentEmailProvider,
  deliverPendingEmails,
  emailProvider,
  type EmailMessage,
  type EmailProvider,
} from "../src/lib/email";
import { runMigrations } from "../src/lib/migrations";
import {
  dealManagerUserIds,
  dealTeamUserIds,
  documentAudienceUserIds,
  notifyUsers,
  saveNotificationPreferences,
} from "../src/lib/notifications";
import { seed } from "../src/lib/seed";

const environment = process.env as Record<string, string | undefined>;

function freshDatabase() {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-notifications-"));
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  runMigrations(database);
  seed(database, directory);
  database.exec("DELETE FROM email_outbox; DELETE FROM notifications;");
  return { database, directory };
}

test("production email delivery fails closed without a configured provider", () => {
  const previousNodeEnv = environment.NODE_ENV;
  const previousProvider = process.env.EMAIL_PROVIDER;
  try {
    environment.NODE_ENV = "production";
    delete process.env.EMAIL_PROVIDER;
    assert.throws(
      () => emailProvider(),
      /configure a production EMAIL_PROVIDER/,
    );
    process.env.EMAIL_PROVIDER = "development";
    assert.throws(
      () => emailProvider(),
      /configure a production EMAIL_PROVIDER/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = previousNodeEnv;
    if (previousProvider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = previousProvider;
  }
});

test("the development provider records a successful mock result without credentials", async () => {
  const result = await new DevelopmentEmailProvider().send({
    to: "buyer@example.test",
    subject: "Private opportunity",
    body: "A private opportunity is available in Succera.",
    idempotencyKey: "test-development-email",
  });
  assert.equal(result.provider, "development");
  assert.match(result.messageId, /^development-/);
});

test("the outbox processor claims each queued email once and records delivery", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-notifications-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    runMigrations(database);
    seed(database, directory);
    database
      .prepare(
        "UPDATE organization_members SET status='suspended' WHERE organization_id='org-demo-owner' AND user_id='demo-owner'",
      )
      .run();
    assert.deepEqual(
      dealTeamUserIds(database, "cedar").includes("demo-owner"),
      false,
    );
    database
      .prepare(
        "UPDATE organization_members SET status='active' WHERE organization_id='org-demo-owner' AND user_id='demo-owner'",
      )
      .run();
    notifyUsers(database, {
      userIds: ["demo-buyer"],
      type: "new_message",
      title: "New message",
      body: "The deal team sent a private message.",
      href: "/app/messages",
      sourceKey: "test:email-delivery",
    });
    database
      .prepare(
        "UPDATE email_outbox SET status='queued',available_at='2000-01-01 00:00:00' WHERE notification_id=(SELECT id FROM notifications WHERE source_key='test:email-delivery')",
      )
      .run();

    const sent: EmailMessage[] = [];
    const provider: EmailProvider = {
      async send(message) {
        sent.push(message);
        return { provider: "test", messageId: "test-message-1" };
      },
    };
    assert.deepEqual(await deliverPendingEmails(database, provider), {
      processed: 1,
      sent: 1,
      failed: 0,
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "buyer@example.test");
    assert.ok(sent[0].idempotencyKey);
    assert.deepEqual(await deliverPendingEmails(database, provider), {
      processed: 0,
      sent: 0,
      failed: 0,
    });
    assert.deepEqual(
      {
        ...database
          .prepare(
            "SELECT status,provider,provider_message_id,attempts FROM email_outbox WHERE notification_id=(SELECT id FROM notifications WHERE source_key='test:email-delivery')",
          )
          .get(),
      },
      {
        status: "sent",
        provider: "test",
        provider_message_id: "test-message-1",
        attempts: 1,
      },
    );

    notifyUsers(database, {
      userIds: ["demo-buyer"],
      type: "new_task",
      title: "New task",
      body: "A diligence task is ready.",
      href: "/app/tasks",
      sourceKey: "test:email-failure",
    });
    database
      .prepare(
        "UPDATE email_outbox SET status='queued',available_at='2000-01-01 00:00:00' WHERE notification_id=(SELECT id FROM notifications WHERE source_key='test:email-failure')",
      )
      .run();
    const failingProvider: EmailProvider = {
      async send() {
        throw new Error("Provider unavailable");
      },
    };
    assert.deepEqual(await deliverPendingEmails(database, failingProvider), {
      processed: 1,
      sent: 0,
      failed: 1,
    });
    assert.deepEqual(
      {
        ...database
          .prepare(
            "SELECT status,attempts,last_error FROM email_outbox WHERE notification_id=(SELECT id FROM notifications WHERE source_key='test:email-failure')",
          )
          .get(),
      },
      {
        status: "failed",
        attempts: 1,
        last_error: "Provider unavailable",
      },
    );

    notifyUsers(database, {
      userIds: ["demo-buyer"],
      type: "document_shared",
      title: "Document shared",
      body: "A diligence document is ready.",
      href: "/app/documents",
      sourceKey: "test:email-stale-lease",
    });
    database
      .prepare(
        `UPDATE email_outbox
         SET status='processing',processing_at='2000-01-01 00:00:00',available_at='2000-01-01 00:00:00'
         WHERE notification_id=(SELECT id FROM notifications WHERE source_key='test:email-stale-lease')`,
      )
      .run();
    assert.deepEqual(await deliverPendingEmails(database, provider), {
      processed: 1,
      sent: 1,
      failed: 0,
    });
    assert.ok(sent.at(-1)?.idempotencyKey);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a stale email worker cannot finalize a lease it no longer owns", async () => {
  const { database, directory } = freshDatabase();
  try {
    const previousNodeEnv = environment.NODE_ENV;
    environment.NODE_ENV = "production";
    try {
      notifyUsers(database, {
        userIds: ["demo-buyer"],
        type: "new_message",
        title: "New message",
        body: "A message needs review.",
        href: "/app/messages",
        sourceKey: "test:stale-finalize",
      });
      const provider: EmailProvider = {
        async send() {
          database
            .prepare(
              "UPDATE email_outbox SET processing_token='newer-worker-token' WHERE notification_id=(SELECT id FROM notifications WHERE source_key='test:stale-finalize')",
            )
            .run();
          return { provider: "test", messageId: "stale-result" };
        },
      };
      assert.deepEqual(await deliverPendingEmails(database, provider), {
        processed: 0,
        sent: 0,
        failed: 0,
      });
      assert.deepEqual(
        {
          ...database
            .prepare(
              "SELECT status,provider,processing_token FROM email_outbox WHERE notification_id=(SELECT id FROM notifications WHERE source_key='test:stale-finalize')",
            )
            .get(),
        },
        {
          status: "processing",
          provider: null,
          processing_token: "newer-worker-token",
        },
      );
    } finally {
      if (previousNodeEnv === undefined) delete environment.NODE_ENV;
      else environment.NODE_ENV = previousNodeEnv;
    }
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("disabling a preference retires queued email without removing the in-app notification", async () => {
  const { database, directory } = freshDatabase();
  try {
    const previousNodeEnv = environment.NODE_ENV;
    environment.NODE_ENV = "production";
    try {
      notifyUsers(database, {
        userIds: ["demo-buyer"],
        type: "new_task",
        title: "New task",
        body: "A task needs review.",
        href: "/app/tasks",
        sourceKey: "test:disable-before-delivery",
      });
      saveNotificationPreferences(database, "demo-buyer", {
        new_task: "disabled",
      });
      assert.deepEqual(
        {
          ...database
            .prepare(
              "SELECT status,last_error FROM email_outbox WHERE notification_id=(SELECT id FROM notifications WHERE source_key='test:disable-before-delivery')",
            )
            .get(),
        },
        {
          status: "failed",
          last_error: "Email disabled by recipient",
        },
      );
      let sends = 0;
      const provider: EmailProvider = {
        async send() {
          sends += 1;
          return { provider: "test", messageId: "should-not-send" };
        },
      };
      assert.deepEqual(await deliverPendingEmails(database, provider), {
        processed: 0,
        sent: 0,
        failed: 0,
      });
      assert.equal(sends, 0);
      const notificationCount = database
        .prepare(
          "SELECT COUNT(*) count FROM notifications WHERE source_key='test:disable-before-delivery' AND user_id='demo-buyer'",
        )
        .get() as { count: number };
      assert.equal(notificationCount.count, 1);
    } finally {
      if (previousNodeEnv === undefined) delete environment.NODE_ENV;
      else environment.NODE_ENV = previousNodeEnv;
    }
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an email provider receives cancellation when delivery exceeds its timeout", async () => {
  const { database, directory } = freshDatabase();
  try {
    const previousNodeEnv = environment.NODE_ENV;
    environment.NODE_ENV = "production";
    try {
      notifyUsers(database, {
        userIds: ["demo-buyer"],
        type: "document_shared",
        title: "Document shared",
        body: "A diligence document is ready.",
        href: "/app/documents",
        sourceKey: "test:email-timeout",
      });
      let aborted = false;
      const provider: EmailProvider = {
        async send(_message, options) {
          return new Promise((_, reject) => {
            options?.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("aborted"));
            });
          });
        },
      };
      assert.deepEqual(await deliverPendingEmails(database, provider, 25, 5), {
        processed: 1,
        sent: 0,
        failed: 1,
      });
      assert.equal(aborted, true);
    } finally {
      if (previousNodeEnv === undefined) delete environment.NODE_ENV;
      else environment.NODE_ENV = previousNodeEnv;
    }
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("document notification audiences are independent of funnel categories", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "succera-document-audiences-"),
  );
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    runMigrations(database);
    seed(database, directory);

    assert.deepEqual(documentAudienceUserIds(database, "cedar", "approved"), [
      "demo-buyer",
    ]);
    assert.deepEqual(
      documentAudienceUserIds(database, "cedar", "buyer", "demo-buyer-2"),
      ["demo-buyer-2"],
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("manager-only deal notifications exclude organization viewers", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "succera-notification-viewers-"),
  );
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    runMigrations(database);
    seed(database, directory);

    database
      .prepare(
        "UPDATE organization_members SET role='viewer' WHERE organization_id='org-demo-owner' AND user_id='demo-owner'",
      )
      .run();
    assert.equal(
      dealTeamUserIds(database, "cedar").includes("demo-owner"),
      true,
    );
    assert.equal(
      dealManagerUserIds(database, "cedar").includes("demo-owner"),
      false,
    );
    assert.equal(
      dealManagerUserIds(database, "cedar").includes("demo-advisor"),
      true,
    );

    database
      .prepare(
        "UPDATE organization_members SET role='owner' WHERE organization_id='org-demo-owner' AND user_id='demo-owner'",
      )
      .run();
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("notification creation is retryable across a partial outbox gap", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "succera-notification-gap-"),
  );
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    runMigrations(database);
    seed(database, directory);
    const input = {
      userIds: ["demo-buyer"],
      type: "new_message" as const,
      title: "New message",
      body: "A private message is ready.",
      href: "/app/messages",
      sourceKey: "test:notification-gap",
    };
    assert.equal(notifyUsers(database, input).length, 1);
    database
      .prepare(
        "DELETE FROM email_outbox WHERE notification_id=(SELECT id FROM notifications WHERE user_id=? AND source_key=?)",
      )
      .run("demo-buyer", input.sourceKey);
    assert.equal(notifyUsers(database, input).length, 0);
    assert.deepEqual(
      {
        ...database
          .prepare(
            "SELECT COUNT(*) count FROM notifications WHERE user_id=? AND source_key=?",
          )
          .get("demo-buyer", input.sourceKey),
      },
      { count: 1 },
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            "SELECT COUNT(*) count FROM email_outbox WHERE notification_id=(SELECT id FROM notifications WHERE user_id=? AND source_key=?)",
          )
          .get("demo-buyer", input.sourceKey),
      },
      { count: 1 },
    );

    database.exec("SAVEPOINT outer_notification_test");
    notifyUsers(database, {
      ...input,
      sourceKey: "test:notification-outer-rollback",
    });
    database.exec("ROLLBACK TO SAVEPOINT outer_notification_test");
    database.exec("RELEASE SAVEPOINT outer_notification_test");
    assert.deepEqual(
      {
        ...database
          .prepare(
            "SELECT COUNT(*) count FROM notifications WHERE source_key=?",
          )
          .get("test:notification-outer-rollback"),
      },
      { count: 0 },
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
