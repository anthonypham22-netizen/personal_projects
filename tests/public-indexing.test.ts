import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let directory: string;

before(() => {
  directory = mkdtempSync(path.join(tmpdir(), "succera-public-indexing-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  process.env.APP_URL = "https://succera.example";
  process.env.PUBLIC_NETWORK_INDEXING_ENABLED = "true";
});

after(async () => {
  const { db } = await import("../src/lib/db");
  db().close();
  rmSync(directory, { recursive: true, force: true });
});

test("enabled indexing exposes only public-network routes", async () => {
  const [{ default: robots }, { default: sitemap }, metadata] =
    await Promise.all([
      import("../src/app/robots"),
      import("../src/app/sitemap"),
      import("../src/lib/public-metadata"),
    ]);

  assert.equal(metadata.publicNetworkIndexingEnabled, true);
  assert.deepEqual(metadata.publicPageMetadata({
    title: "Network",
    description: "Public network",
    path: "/network",
  }).robots, { index: true, follow: true });

  const robotsResult = robots();
  assert.deepEqual(robotsResult.rules, {
    userAgent: "*",
    allow: "/",
    disallow: ["/app", "/api", "/login", "/register"],
  });
  assert.equal(
    robotsResult.sitemap,
    "https://succera.example/sitemap.xml",
  );

  const paths = sitemap().map(({ url }) => new URL(url).pathname);
  assert.ok(paths.includes("/"));
  assert.ok(paths.includes("/network"));
  assert.ok(paths.includes("/buyers/evergreen-capital-demo-buyer"));
  assert.ok(
    paths.includes(
      "/transactions/industrial-services-ontario-evergreen-services",
    ),
  );
  assert.equal(paths.some((value) => value.startsWith("/app")), false);
  assert.equal(paths.some((value) => value.startsWith("/api")), false);
  assert.equal(paths.some((value) => value.includes("cedar-co")), false);
});
