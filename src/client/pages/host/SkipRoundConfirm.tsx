import { ConfirmDialog } from '../../ui/ConfirmDialog';

export function SkipRoundConfirm({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open
      confirmOnEnter
      title="本輪不淘汰任何人，直接進入下一輪？"
      confirmLabel="確認"
      confirmDisabled={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
