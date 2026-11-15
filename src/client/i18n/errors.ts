import type { ErrorCode } from '../../shared';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  NICKNAME_EMPTY: '請輸入暱稱',
  NICKNAME_TOO_LONG: '暱稱太長了，最多 12 個字',
  NICKNAME_TAKEN: '這個暱稱已經有人用了，換一個吧',
  ROOM_FULL: '房間已經滿了',
  ROOM_NOT_FOUND: '找不到這個房間，請確認房間代碼',
  ROOM_CODE_UNAVAILABLE: '暫時無法建立房間，請稍後再試',
  PLAYER_NOT_FOUND: '找不到這位玩家',
  GAME_IN_PROGRESS: '遊戲已經開始，現在不能加入',
  NOT_ENOUGH_PLAYERS: '人數不夠，至少需要 4 位玩家才能開始',
  INVALID_PHASE: '現在不能做這個動作',
  INVALID_TOKEN: '登入資訊無效，請重新加入',
  TOKEN_EXPIRED: '登入資訊已過期，請重新加入',
  ALREADY_ELIMINATED: '這位玩家已經被淘汰了',
  INVALID_PLAYER_COUNT: '玩家人數不符合規定（4 到 15 人）',
  DUPLICATE_PLAYER: '玩家重複了',
  FORBIDDEN: '你沒有權限做這個動作',
  UNAUTHENTICATED: '尚未登入房間，請重新整理頁面',
  ALREADY_AUTHENTICATED: '已經登入過了',
  INVALID_PAYLOAD: '送出的資料不正確',
  RATE_LIMITED: '操作太快了，請稍等一下',
  ROUND_MISMATCH: '畫面不是最新的，請稍後再試',
  INTERNAL_ERROR: '發生未預期的錯誤，請再試一次',
};

export function errorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code];
}
