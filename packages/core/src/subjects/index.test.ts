import { describe, expect, it } from "vitest";

import { TOPIC_STATUS_LABEL, TOPIC_STATUSES, nextTopicStatus } from "./index";

describe("nextTopicStatus", () => {
  it("advances through the learning journey", () => {
    expect(nextTopicStatus("not_started")).toBe("learning");
    expect(nextTopicStatus("learning")).toBe("mastered");
  });

  it("wraps at the end so the cycle never dead-ends", () => {
    expect(nextTopicStatus("mastered")).toBe("learning");
  });

  it("only ever returns a declared status", () => {
    for (const status of TOPIC_STATUSES) {
      expect(TOPIC_STATUSES).toContain(nextTopicStatus(status));
    }
  });
});

describe("TOPIC_STATUS_LABEL", () => {
  it("has wording for every status, because the chip always renders it", () => {
    for (const status of TOPIC_STATUSES) {
      expect(TOPIC_STATUS_LABEL[status]).toBeTruthy();
    }
  });

  it("never says the same thing twice", () => {
    const labels = TOPIC_STATUSES.map((s) => TOPIC_STATUS_LABEL[s]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
