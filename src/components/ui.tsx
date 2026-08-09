import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import type { Verification } from '../model/identity.ts';
import { VERIFICATION_LABEL } from '../model/identity.ts';

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="content">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/** Transient confirmation message. Deliberately the only feedback channel. */
export function useToast(): [ReactNode, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // Stable identity so effects can depend on it without re-firing.
  const show = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 2600);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const node = message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null;
  return [node, show];
}

/**
 * QR rendered locally as inline SVG — no network, no image service. Very long
 * profiles exceed what a QR code can hold, in which case we say so plainly
 * rather than rendering an unscannable block.
 */
export function QR({ text, label }: { text: string; label?: string }) {
  const svg = (() => {
    // Type 0 lets the library pick the smallest version that fits. 'L' error
    // correction maximises capacity, which is what we want for long payloads.
    try {
      const qr = qrcode(0, 'L');
      qr.addData(text);
      qr.make();
      const count = qr.getModuleCount();
      const quiet = 2;
      const size = count + quiet * 2;
      const parts: string[] = [];
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) parts.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
        }
      }
      return { size, path: parts.join(''), ok: true as const };
    } catch {
      return { ok: false as const };
    }
  })();

  if (!svg.ok) {
    return (
      <div className="qr-wrap too-big">
        This profile is too detailed to fit in a QR code. Use the share link or code instead — they have no size limit.
      </div>
    );
  }

  return (
    <div className="qr-wrap">
      <svg viewBox={`0 0 ${svg.size} ${svg.size}`} role="img" aria-label={label ?? 'QR code'} shapeRendering="crispEdges">
        <rect width={svg.size} height={svg.size} fill="#fff" />
        <path d={svg.path} fill="#000" />
      </svg>
    </div>
  );
}

/** Copy button that confirms in place, so the action never feels silent. */
export function CopyButton({
  text,
  label = 'Copy',
  className = 'btn',
  onCopied,
}: {
  text: string;
  label?: string;
  className?: string;
  onCopied?: () => void;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={className}
      onClick={async () => {
        const ok = await copyText(text);
        setDone(ok);
        if (ok) {
          onCopied?.();
          setTimeout(() => setDone(false), 1800);
        }
      }}
    >
      {done ? '✓ Copied' : label}
    </button>
  );
}

/** Clipboard with a selection-based fallback for non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * A person's picture. Falls back to their emoji whenever there is no photo, so
 * every profile has a usable identity mark without requiring an upload.
 */
export function Avatar({
  emoji,
  src,
  name,
  size = 40,
}: {
  emoji: string;
  src?: string;
  name?: string;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.52) };
  if (src) {
    return (
      <img
        className="avatar-img"
        src={src}
        alt={name ? `${name}'s profile picture` : 'Profile picture'}
        style={style}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span className="avatar-emoji" style={style} role="img" aria-label={name ? `${name}'s icon` : 'Profile icon'}>
      {emoji}
    </span>
  );
}

/**
 * Signature status. Deliberately visible rather than a silent filter — an
 * unsigned profile is not an error, and a *bad* signature is something the
 * member must be able to see rather than something we quietly drop.
 */
export function VerificationTag({ verification, compact = false }: { verification: Verification; compact?: boolean }) {
  const { label, tone, hint } = VERIFICATION_LABEL[verification];
  if (verification === 'legacy' && compact) return null;
  const icon = verification === 'verified' ? '✓' : verification === 'invalid' ? '⚠️' : '';
  return (
    <span className={`tag ${tone}`} title={hint} style={{ marginLeft: compact ? 6 : 0 }}>
      {icon} {label}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="big">{icon}</span>
      <strong>{title}</strong>
      {children && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

/**
 * Label for a single form control. Wrapping in `<label>` is what associates the
 * two — so this must only ever contain one input, never a row of buttons.
 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <div className="faint" style={{ marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

/**
 * Label for a *set* of controls — chip rows, toggle groups, a lone button.
 * Using `<label>` here would make the first button inherit the label's entire
 * text as its accessible name, which is both wrong and unusable with a screen
 * reader. A named `group` is the correct container.
 */
export function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="label" aria-hidden="true">{label}</span>
      {children}
      {hint && <div className="faint" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
