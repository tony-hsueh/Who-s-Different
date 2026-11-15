import type { PublicGameResult, Role } from '../../../shared';

const ROLE_NAMES: Record<Role, string> = {
  majority: '多數方',
  minority: '少數方',
};

export interface PlayerFinishedProps {
  playerId: string;
  // Missing only for the moment between the private and the public state arriving.
  result: PublicGameResult | undefined;
}

export function PlayerFinished({ playerId, result }: PlayerFinishedProps) {
  const myRole = result?.players.find((p) => p.playerId === playerId)?.role;
  return (
    <main className="wd-player">
      <h1>遊戲結束</h1>
      {result && (
        <>
          <p className="wd-player__lead">{ROLE_NAMES[result.winner]}獲勝</p>
          <dl className="wd-words">
            <div>
              <dt>多數詞</dt>
              <dd>{result.majorityWord}</dd>
            </div>
            <div>
              <dt>少數詞</dt>
              <dd>{result.minorityWord}</dd>
            </div>
          </dl>
          {myRole && <p>你是{ROLE_NAMES[myRole]}</p>}
        </>
      )}
      <p className="wd-player__lead">請看大螢幕</p>
    </main>
  );
}
