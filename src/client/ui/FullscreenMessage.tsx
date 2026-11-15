import type { ReactNode } from 'react';
import './FullscreenMessage.css';

export interface FullscreenMessageProps {
  title: string;
  message?: string;
  children?: ReactNode;
}

export function FullscreenMessage({
  title,
  message,
  children,
}: FullscreenMessageProps) {
  return (
    <main className="wd-fullscreen">
      <h1>{title}</h1>
      {message && <p>{message}</p>}
      {children && <div className="wd-fullscreen__actions">{children}</div>}
    </main>
  );
}
