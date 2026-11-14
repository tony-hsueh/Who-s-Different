export interface EchoPayload {
  text: string;
}

export interface ClientToServerEvents {
  echo: (payload: EchoPayload, ack: (payload: EchoPayload) => void) => void;
}

export type ServerToClientEvents = Record<never, never>;
