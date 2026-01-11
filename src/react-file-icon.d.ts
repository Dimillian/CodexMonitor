declare module "react-file-icon" {
  import { ComponentType } from "react";
  export const FileIcon: ComponentType<{
    extension?: string;
    [key: string]: unknown;
  }>;
  export const defaultStyles: Record<string, object>;
}
