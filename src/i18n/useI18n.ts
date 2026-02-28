import { useContext } from "react";
import { I18nContext } from "./provider";

export function useI18n() {
  return useContext(I18nContext);
}
