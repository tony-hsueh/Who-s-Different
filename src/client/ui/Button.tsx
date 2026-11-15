import type { ComponentPropsWithRef } from 'react';
import './Button.css';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      data-variant={variant}
      data-size={size}
      className={className ? `wd-btn ${className}` : 'wd-btn'}
    />
  );
}
