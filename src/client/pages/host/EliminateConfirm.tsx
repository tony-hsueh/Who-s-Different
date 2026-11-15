import type { PublicPlayer } from '../../../shared';
import { ConfirmDialog } from '../../ui/ConfirmDialog';

export function EliminateConfirm({
  player,
  busy,
  onConfirm,
  onCancel,
}: {
  player: PublicPlayer;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open
      danger
      confirmOnEnter
      title={`確定要淘汰玩家 ${player.nickname} 嗎？`}
      confirmLabel="確認淘汰"
      confirmDisabled={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
