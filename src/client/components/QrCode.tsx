import QRCode from 'qrcode';
import { useMemo } from 'react';
import './QrCode.css';

const QUIET_ZONE = 4;

// One path made of horizontal runs of dark modules; the svg scales to any size.
function drawModules(value: string) {
  const { modules } = QRCode.create(value, {
    errorCorrectionLevel: 'M',
  });
  const { size } = modules;
  let d = '';
  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!modules.get(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < size && modules.get(row, col)) col++;
      d += `M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${col - start}v1h-${col - start}z`;
    }
  }
  return { d, side: size + QUIET_ZONE * 2 };
}

export interface QrCodeProps {
  value: string;
  label: string;
}

export function QrCode({ value, label }: QrCodeProps) {
  const { d, side } = useMemo(() => drawModules(value), [value]);
  return (
    <svg
      className="wd-qr"
      role="img"
      aria-label={label}
      data-value={value}
      viewBox={`0 0 ${side} ${side}`}
      shapeRendering="crispEdges"
    >
      <rect width={side} height={side} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
