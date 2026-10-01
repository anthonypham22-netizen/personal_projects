import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { EnvironmentBanner } from "../src/components/environment-banner";

test("only staging renders the persistent fictional-data warning", () => {
  const staging = renderToStaticMarkup(
    createElement(EnvironmentBanner, { environment: "staging" }),
  );
  assert.match(staging, /STAGING — FICTIONAL DATA/);
  assert.equal(
    renderToStaticMarkup(
      createElement(EnvironmentBanner, { environment: "production" }),
    ),
    "",
  );
  assert.equal(
    renderToStaticMarkup(
      createElement(EnvironmentBanner, { environment: "development" }),
    ),
    "",
  );
});
