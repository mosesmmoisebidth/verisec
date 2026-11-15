"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Field } from "@/components/auth/auth-shell";

/**
 * A password input with the frames' reveal toggle.
 *
 * The only client component on either auth page — showing and hiding a value
 * is genuinely local state. The button carries a real label that CHANGES with
 * the state, so a screen reader is told what pressing it will do rather than
 * just "button"; `aria-pressed` reports whether the password is currently
 * exposed, which matters if somebody is behind you.
 */
export function PasswordField({
  id,
  label,
  placeholder,
  autoComplete,
  error,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  autoComplete: string;
  error?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const [shown, setShown] = useState(false);
  const Glyph = shown ? EyeOff : Eye;

  return (
    <Field
      id={id}
      label={label}
      placeholder={placeholder}
      type={shown ? "text" : "password"}
      autoComplete={autoComplete}
      error={error}
      onChange={onChange}
    >
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute right-4 grid size-8 place-items-center rounded-pill text-quiet transition-colors hover:text-pine"
      >
        <Glyph aria-hidden className="size-5" strokeWidth={1.7} />
      </button>
    </Field>
  );
}
