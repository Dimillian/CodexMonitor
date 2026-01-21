import { useEffect, useRef } from "react";
import type { Unsubscribe } from "../../../services/events";

type Subscribe<T> = (handler: (payload: T) => void) => Unsubscribe;
type SubscribeVoid = (handler: () => void) => Unsubscribe;

type UseTauriEventOptions = {
  enabled?: boolean;
};

export function useTauriEvent(
  subscribe: SubscribeVoid,
  handler: () => void,
  options?: UseTauriEventOptions,
): void;
export function useTauriEvent<T>(
  subscribe: Subscribe<T>,
  handler: (payload: T) => void,
  options?: UseTauriEventOptions,
): void;
export function useTauriEvent<T>(
  subscribe: Subscribe<T> | SubscribeVoid,
  handler: ((payload: T) => void) | (() => void),
  options: UseTauriEventOptions = {},
): void {
  const handlerRef = useRef<(payload: T) => void>(handler as (payload: T) => void);
  const enabled = options.enabled ?? true;

  useEffect(() => {
    handlerRef.current = handler as (payload: T) => void;
  }, [handler]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const unlisten = (subscribe as Subscribe<T>)((payload: T) => {
      handlerRef.current(payload);
    });
    return () => {
      unlisten();
    };
  }, [enabled, subscribe]);
}
