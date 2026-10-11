import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export type BuddyDisclosureAction = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  pressed?: boolean;
  restoreFocus?: boolean;
};

type Props = {
  label: string;
  open: boolean;
  actions: BuddyDisclosureAction[];
  toggle: () => void;
  dismiss: () => void;
};

/** A disclosure with ordinary Tab navigation, rather than a partial ARIA menu. */
export default function BuddyDisclosure({ label, open, actions, toggle, dismiss }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) dismiss();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, dismiss]);

  return (
    <div
      ref={root}
      className="buddy-disclosure"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) dismiss();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        event.stopPropagation();
        dismiss();
        trigger.current?.focus({ preventScroll: true });
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="buddy-disclosure-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        {label}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div
        id={id}
        className="buddy-disclosure-panel"
        role="region"
        aria-label={label}
        hidden={!open}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={action.disabled}
            aria-pressed={action.pressed}
            onClick={() => {
              dismiss();
              if (action.restoreFocus !== false) trigger.current?.focus({ preventScroll: true });
              action.onSelect();
            }}
          >
            <span aria-hidden="true">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
