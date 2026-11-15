import type { PublicPlayer, PublicRoomState } from '../../../shared';
import { ROLE_LABEL } from '../../lib/role-labels';
import { useOnce } from '../../hooks/useOnce';
import { useRequest } from '../../net/hooks';
import { Avatar } from '../../ui/Avatar';
import { ServerButton } from '../../ui/ServerButton';
import './HostFinished.css';

export function HostFinished({ state }: { state: PublicRoomState }) {
  const request = useRequest();
  const again = useOnce(() => request('game:reset', {}));
  const { result } = state;
  // The public state and the result are sent together; without a result there is nothing to show.
  if (!result) return null;

  const roles = new Map(result.players.map((p) => [p.playerId, p.role]));
  const byId = new Map<string, PublicPlayer>(
    state.players.map((p) => [p.playerId, p]),
  );

  return (
    <main className="host-finished" data-winner={result.winner}>
      <h1 className="host-finished__winner">
        {ROLE_LABEL[result.winner]}獲勝！
      </h1>
      <dl className="host-finished__words">
        <div>
          <dt>平民詞語</dt>
          <dd>{result.majorityWord}</dd>
        </div>
        <div>
          <dt>臥底詞語</dt>
          <dd>{result.minorityWord}</dd>
        </div>
      </dl>
      <div className="host-finished__body">
        <ul className="host-finished__roster" aria-label="所有玩家的身分">
          {state.players.map((player) => {
            const role = roles.get(player.playerId);
            return (
              <li key={player.playerId} data-role={role}>
                <Avatar
                  nickname={player.nickname}
                  color={player.avatarColor}
                  index={player.avatarIndex}
                />
                {role && (
                  <span className="host-finished__role">
                    {ROLE_LABEL[role]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <section className="host-finished__log">
          <h2>淘汰紀錄</h2>
          <ol>
            {result.eliminations.map((record) => {
              const who =
                record.playerId === null
                  ? undefined
                  : byId.get(record.playerId);
              return (
                <li key={record.roundNumber}>
                  {who && record.role
                    ? `第 ${record.roundNumber} 輪：${who.nickname}（${ROLE_LABEL[record.role]}）`
                    : `第 ${record.roundNumber} 輪：無人淘汰`}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <ServerButton size="lg" disabled={again.busy} onClick={again.run}>
        再玩一場
      </ServerButton>
    </main>
  );
}
