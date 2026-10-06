import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, IconButton, Tooltip, type ButtonProps } from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from '@mui/icons-material';

/* CopyButton — clipboard copy with local success feedback. Success is shown
 * on the button itself for 1.5–2s (plan §10.3) and announced through a polite
 * live region instead of a toast, so repeated copies don't spam snackbars. */

export interface CopyButtonProps {
  /** Text placed on the clipboard. */
  value: string;
  /** Accessible name + tooltip, e.g. "Copy public link". */
  label: string;
  /** Render as icon-only button (44px hit area) instead of a labelled button. */
  iconOnly?: boolean;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  onCopied?: () => void;
}

const SUCCESS_MS = 1800;

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  label,
  iconOnly = false,
  size = 'small',
  variant = 'outlined',
  onCopied,
}) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /* FIX-07 — success only on a REAL copy. The execCommand fallback returns
   * false when the browser rejects it; that failure must surface as an error
   * state with guidance, never a fake checkmark. */
  const [failed, setFailed] = useState(false);

  const handleCopy = useCallback(async () => {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API unavailable (permissions, insecure context) — fall back.
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      } finally {
        document.body.removeChild(ta);
      }
      if (!ok) {
        setFailed(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setFailed(false), SUCCESS_MS * 2);
        return;
      }
    }
    setCopied(true);
    onCopied?.();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), SUCCESS_MS);
  }, [value, onCopied]);

  const icon = copied ? (
    <CheckIcon fontSize="small" />
  ) : failed ? (
    <CopyIcon fontSize="small" color="error" />
  ) : (
    <CopyIcon fontSize="small" />
  );

  return (
    <>
      {iconOnly ? (
        <Tooltip title={copied ? 'Đã copy' : failed ? 'Không copy được — chọn và copy thủ công' : label}>
          <IconButton
            aria-label={label}
            onClick={handleCopy}
            className="pressable"
            size={size}
            color={copied ? 'success' : failed ? 'error' : 'default'}
            sx={{ width: 44, height: 44 }}
          >
            {icon}
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          variant={variant}
          size={size}
          onClick={handleCopy}
          className="pressable"
          startIcon={icon}
          color={copied ? 'success' : failed ? 'error' : 'primary'}
          aria-label={label}
        >
          {copied ? 'Đã copy' : failed ? 'Copy thất bại' : label}
        </Button>
      )}
      {/* Polite announcement of the copy result — success AND failure. */}
      <span aria-live="polite" className="visually-hidden">
        {copied ? `${label} — đã copy` : failed ? `${label} — copy thất bại, hãy chọn text và copy thủ công` : ''}
      </span>
    </>
  );
};
