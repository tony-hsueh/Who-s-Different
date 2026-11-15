import { useState } from 'react';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type PublicRoomState,
} from '../../../shared';
import { Cover } from '../../components/Cover';
import { PlayerGrid } from '../../components/PlayerGrid';
import { QrCode } from '../../components/QrCode';
import { buildJoinUrl } from '../../lib/join-url';
import { useConnected, useRequest } from '../../net/hooks';
import { usePublicBaseUrl } from '../../net/public-config';
import { ServerButton } from '../../ui/ServerButton';
import './HostLobby.css';

export function HostLobby({ state }: { state: PublicRoomState }) {
  const request = useRequest();
  const connected = useConnected();
  const baseUrl = usePublicBaseUrl();
  const [starting, setStarting] = useState(false);

  const count = state.players.length;
  const canStart = count >= MIN_PLAYERS && count <= MAX_PLAYERS;
  const joinUrl = baseUrl && buildJoinUrl(baseUrl, state.roomCode);

  async function start() {
    setStarting(true);
    const ack = await request('game:start', {});
    if (!ack.ok) setStarting(false);
  }

  return (
    <main className="host-lobby">
      {!connected && (
        <p className="host-lobby__offline" role="status">
          連線中斷，重新連線中…
        </p>
      )}
      <header className="host-lobby__head">
        <Cover size="sm" />
        <h1 className="host-lobby__title">誰跟我不一樣？</h1>
      </header>
      <section className="host-lobby__join" aria-label="加入方式">
        <div className="host-lobby__qr">
          {joinUrl && <QrCode value={joinUrl} label="加入房間的 QR Code" />}
        </div>
        <p className="host-lobby__code-label">房間代碼</p>
        <p className="host-lobby__code">{state.roomCode}</p>
        {joinUrl && <p className="host-lobby__link">{joinUrl}</p>}
        <p className="host-lobby__note">主持人若要一起玩，請用手機掃碼加入</p>
      </section>
      <section className="host-lobby__players" aria-label="玩家名單">
        <div className="host-lobby__count">
          <span className="host-lobby__count-number">
            {count} / {MAX_PLAYERS}
          </span>
          <span className="host-lobby__count-hint">
            至少 {MIN_PLAYERS} 人才能開始
          </span>
        </div>
        <div className="host-lobby__grid">
          <PlayerGrid players={state.players} />
        </div>
        <ServerButton
          size="lg"
          disabled={!canStart || starting}
          onClick={() => void start()}
        >
          開始遊戲
        </ServerButton>
      </section>
    </main>
  );
}
