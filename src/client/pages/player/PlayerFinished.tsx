import type { PublicGameResult } from '../../../shared';
import { ROLE_LABEL } from '../../lib/role-labels';

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
          <p className="wd-player__lead">{ROLE_LABEL[result.winner]}獲勝</p>
          <dl className="wd-words">
            <div>
              <dt>平民詞語</dt>
              <dd>{result.majorityWord}</dd>
            </div>
            <div>
              <dt>臥底詞語</dt>
              <dd>{result.minorityWord}</dd>
            </div>
          </dl>
          {myRole && <p>你是{ROLE_LABEL[myRole]}</p>}
        </>
      )}
      <p className="wd-player__lead">請看大螢幕</p>
    </main>
  );
}
