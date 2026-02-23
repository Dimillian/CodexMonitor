import { describe, expect, it } from "vitest";
import { buildRemoteDirectoryBreadcrumbs } from "./remoteDirectoryBreadcrumbs";

describe("buildRemoteDirectoryBreadcrumbs", () => {
  it("builds POSIX breadcrumbs", () => {
    expect(buildRemoteDirectoryBreadcrumbs("/srv/repos/my-project")).toEqual([
      { label: "/", path: "/" },
      { label: "srv", path: "/srv" },
      { label: "repos", path: "/srv/repos" },
      { label: "my-project", path: "/srv/repos/my-project" },
    ]);
  });

  it("normalizes and splits Windows paths", () => {
    expect(buildRemoteDirectoryBreadcrumbs("C:\\Users\\dev\\repo")).toEqual([
      { label: "C:", path: "C:/" },
      { label: "Users", path: "C:/Users" },
      { label: "dev", path: "C:/Users/dev" },
      { label: "repo", path: "C:/Users/dev/repo" },
    ]);
  });
});
