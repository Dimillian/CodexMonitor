import { describe, expect, it } from "vitest";
import {
  collectMentionNames,
  connectorMentionSlug,
  resolveBoundAppMentions,
} from "./appMentions";

describe("connectorMentionSlug", () => {
  it("normalizes connector labels to mention slugs", () => {
    expect(connectorMentionSlug("Calendar App")).toBe("calendar-app");
    expect(connectorMentionSlug("Miro+Boards")).toBe("miro-boards");
  });
});

describe("resolveBoundAppMentions", () => {
  it("returns only mentions that still appear in the message text", () => {
    const mentions = resolveBoundAppMentions("check $calendar-app and $notes", [
      {
        slug: "calendar-app",
        mention: { name: "Calendar App", path: "app://connector_calendar" },
      },
      {
        slug: "drive",
        mention: { name: "Drive", path: "app://connector_drive" },
      },
    ]);

    expect(mentions).toEqual([
      { name: "Calendar App", path: "app://connector_calendar" },
    ]);
  });

  it("collects mention names with valid boundaries", () => {
    expect(Array.from(collectMentionNames("$calendar and $drive")).sort()).toEqual([
      "calendar",
      "drive",
    ]);
    expect(Array.from(collectMentionNames("foo$calendar $")).sort()).toEqual([]);
  });
});
