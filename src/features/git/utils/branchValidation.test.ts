import { describe, expect, it } from "vitest";
import { validateBranchName } from "./branchValidation";

describe("validateBranchName", () => {
  it("returns null for valid names", () => {
    expect(validateBranchName("feature/add-login")).toBeNull();
    expect(validateBranchName(" release/v1 ")).toBeNull();
  });

  it("rejects invalid names", () => {
    expect(validateBranchName(".")).toContain("cannot be '.' or '..'");
    expect(validateBranchName("hello world")).toContain("cannot contain spaces");
    expect(validateBranchName("feature//oops")).toContain("cannot contain '//'");
    expect(validateBranchName("feature..oops")).toContain("cannot contain '..'");
    expect(validateBranchName("topic@{x")).toContain("cannot contain '@{'");
  });
});
