/**
 * A real checkbox with `role="switch"`.
 *
 * Not a styled div: it is focusable, space toggles it, and a screen reader
 * announces "switch, on" before a single handler exists. Every use of it is
 * currently unwired — turning one into a control means adding `onChange`, not
 * rebuilding it.
 */
export function Switch({
  on,
  label,
  name,
  onChange,
  disabled,
}: {
  on: boolean;
  /** Announced instead of a visible label when the switch stands alone. */
  label: string;
  name?: string;
  /** Wires the switch: called with its new state. */
  onChange?: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        name={name}
        defaultChecked={on}
        aria-label={label}
        disabled={disabled}
        onChange={onChange ? (e) => onChange(e.currentTarget.checked) : undefined}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0"
      />
      {/* The knob moves via a child selector on the TRACK, not `peer-checked`
          on the knob itself: `peer-*` compiles to a general SIBLING combinator,
          and the knob is a child of the track rather than a sibling of the
          input, so it would silently never match. */}
      <span
        aria-hidden
        className="pointer-events-none flex h-5 w-9 items-center rounded-pill bg-well p-0.5 transition-colors peer-checked:bg-lime peer-checked:[&>span]:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2"
      >
        <span className="size-4 rounded-pill bg-page shadow-sm transition-transform" />
      </span>
    </span>
  );
}
