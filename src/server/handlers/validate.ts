import { z } from 'zod';
import type { Requests } from '../../shared/protocol.js';

const MAX_TOKEN_LENGTH = 256;
const MAX_ID_LENGTH = 128;
const MAX_CODE_LENGTH = 32;
// Room rules own the nickname limit. This only stops absurdly large strings.
const MAX_NICKNAME_INPUT = 200;

const empty = z.record(z.string(), z.never());
const token = z.string().min(1).max(MAX_TOKEN_LENGTH);
const roundNumber = z.number().int().min(1);

export const schemas: {
  [E in keyof Requests]: z.ZodType<Requests[E]['payload']>;
} = {
  'room:create': empty,
  'host:auth': z.object({ hostToken: token }),
  'room:join': z.object({
    roomCode: z.string().min(1).max(MAX_CODE_LENGTH),
    nickname: z.string().max(MAX_NICKNAME_INPUT),
  }),
  'player:auth': z.object({ sessionToken: token }),
  'room:leave': empty,
  'game:start': empty,
  'game:eliminate': z.object({
    roundNumber,
    playerId: z.string().min(1).max(MAX_ID_LENGTH),
  }),
  'game:skip-round': z.object({ roundNumber }),
  'game:next-round': empty,
  'game:reset': empty,
};
