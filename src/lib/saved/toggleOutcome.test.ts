import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveSavedToggleOutcome } from "./toggleOutcome";

describe("resolveSavedToggleOutcome", () => {
  test("reports saved when an unsaved place becomes saved", () => {
    assert.equal(resolveSavedToggleOutcome(false, true), "saved");
  });

  test("reports removed when a saved place becomes unsaved", () => {
    assert.equal(resolveSavedToggleOutcome(true, false), "removed");
  });

  test("reports rolled-back when the saved state is unchanged after a failed toggle", () => {
    assert.equal(resolveSavedToggleOutcome(false, false), "rolled-back");
    assert.equal(resolveSavedToggleOutcome(true, true), "rolled-back");
  });
});