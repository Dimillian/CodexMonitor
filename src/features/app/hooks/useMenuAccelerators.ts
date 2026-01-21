import { useEffect } from "react";
import { setMenuAccelerators } from "../../../services/tauri";
import { toMenuAccelerator } from "../../../utils/shortcuts";

type MenuAccelerator = {
  id: string;
  shortcut: string | null | undefined;
};

type UseMenuAcceleratorsOptions = {
  accelerators: MenuAccelerator[];
  onError?: (error: unknown) => void;
};

export function useMenuAccelerators({
  accelerators,
  onError,
}: UseMenuAcceleratorsOptions) {
  useEffect(() => {
    let active = true;
    const updateMenuAccelerators = async () => {
      try {
        if (!active) {
          return;
        }
        await setMenuAccelerators(
          accelerators.map(({ id, shortcut }) => ({
            id,
            accelerator: toMenuAccelerator(shortcut),
          })),
        );
      } catch (error) {
        onError?.(error);
      }
    };
    void updateMenuAccelerators();
    return () => {
      active = false;
    };
  }, [accelerators, onError]);
}
