import { expect, vi } from "vitest";
import { parseFileLocation, type ParsedFileLocation } from "../../../utils/fileLinks";

export function expectOpenedFileTarget(
  mock: ReturnType<typeof vi.fn>,
  path: string,
  line: number | null = null,
  column: number | null = null,
) {
  expect(mock).toHaveBeenCalledWith({ path, line, column });
}

export function fileTarget(rawPath: string): ParsedFileLocation {
  return parseFileLocation(rawPath);
}
