import { useRef, useState } from 'react';
import type { PublicRoomState } from '../../../shared';
import { PlayerGrid } from '../../components/PlayerGrid';
import { useRequest } from '../../net/hooks';
import { Button } from '../../ui/Button';
import { EliminateConfirm } from './EliminateConfirm';
import { SkipRoundConfirm } from './SkipRoundConfirm';
import './HostPlaying.css';

// The round is kept so a dialog opened in an earlier round can never act on a later one.
type Pending =
  | { kind: 'eliminate'; playerId: string; round: number }
  | { kind: 'skip'; round: number };

export function HostPlaying({ state }: { state: PublicRoomState }) {
  const request = useRequest();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  // State updates land after the next click, so a ref is what actually stops a double submit.
  const inFlight = useRef(false);

  const current = pending?.round === state.roundNumber ? pending : null;
  const target =
    current?.kind === 'eliminate'
      ? state.players.find(
          (p) => p.playerId === current.playerId && !p.eliminated,
        )
      : undefined;
  const skipping = current?.kind === 'skip';

  async function submit() {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    if (pending.kind === 'eliminate') {
      await request('game:eliminate', {
        roundNumber: pending.round,
        playerId: pending.playerId,
      });
    } else {
      await request('game:skip-round', { roundNumber: pending.round });
    }
    inFlight.current = false;
    setBusy(false);
    // Accepted or rejected, the screen follows the next room:state, not this dialog.
    setPending(null);
  }

  return (
    <main className="host-playing">
      <h1 className="host-playing__round">Round {state.roundNumber}</h1>
      <p className="host-playing__hint">
        請大家輪流描述自己的詞語，描述完後現場投票
      </p>
      <div className="host-playing__grid">
        <PlayerGrid
          players={state.players}
          onSelect={(player) =>
            setPending({
              kind: 'eliminate',
              playerId: player.playerId,
              round: state.roundNumber,
            })
          }
          isDisabled={(player) => player.eliminated}
        />
      </div>
      <Button
        variant="secondary"
        className="host-playing__skip"
        onClick={() => setPending({ kind: 'skip', round: state.roundNumber })}
      >
        本輪無人淘汰
      </Button>
      {target && (
        <EliminateConfirm
          player={target}
          busy={busy}
          onConfirm={() => void submit()}
          onCancel={() => setPending(null)}
        />
      )}
      {skipping && (
        <SkipRoundConfirm
          busy={busy}
          onConfirm={() => void submit()}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  );
}
