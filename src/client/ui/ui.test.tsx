import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { FullscreenMessage } from './FullscreenMessage';
import { ToastProvider, useToast } from './Toast';

afterEach(() => vi.useRealTimers());

describe('Button', () => {
  it('is type=button by default and calls onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>確定</Button>);
    const button = screen.getByRole('button', { name: '確定' });
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        確定
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('carries its variant as a data attribute', () => {
    render(<Button variant="danger">淘汰</Button>);
    expect(screen.getByRole('button').dataset.variant).toBe('danger');
  });
});

describe('Toast', () => {
  function Trigger() {
    const toast = useToast();
    return <button onClick={() => toast.show('出錯了')}>go</button>;
  }

  it('shows a message and removes it after a while', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByRole('status').textContent).toContain('出錯了');
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByText('出錯了')).toBeNull();
  });

  it('can be dismissed by hand', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    expect(screen.queryByText('出錯了')).toBeNull();
  });
});

describe('ConfirmDialog', () => {
  const props = {
    title: '淘汰小明？',
    message: '這個動作無法復原',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders nothing while closed', () => {
    render(<ConfirmDialog {...props} open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirms and cancels with the buttons', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...props}
        open
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('dialog', { name: '淘汰小明？' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cancels on Escape and focuses the safe button first', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} open onCancel={onCancel} />);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: '取消' }),
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('ConfirmDialog focus', () => {
  it('keeps Tab inside the dialog and returns focus to the opener', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>open</button>
          <ConfirmDialog
            open={open}
            title="t"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'open' });
    opener.focus();
    fireEvent.click(opener);
    const cancel = screen.getByRole('button', { name: '取消' });
    const confirm = screen.getByRole('button', { name: '確定' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    expect(document.activeElement).toBe(opener);
  });
});

describe('FullscreenMessage', () => {
  it('shows title, message and actions', () => {
    render(
      <FullscreenMessage title="房間已失效" message="請回首頁重新建立">
        <button>回首頁</button>
      </FullscreenMessage>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: '房間已失效' }),
    ).toBeDefined();
    expect(screen.getByText('請回首頁重新建立')).toBeDefined();
    expect(screen.getByRole('button', { name: '回首頁' })).toBeDefined();
  });
});
