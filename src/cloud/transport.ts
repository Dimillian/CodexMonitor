export type TransportKind = "local" | "cloudkit" | "nats" | "telegram";

export type TransportCaps = {
  realtime: boolean;
  snapshots: boolean;
  commands: boolean;
};

export type TransportStatus =
  | { ok: true; label: string }
  | { ok: false; label: string; detail?: string };

export interface Transport {
  kind: TransportKind;
  caps(): TransportCaps;
  status(): Promise<TransportStatus>;
}

