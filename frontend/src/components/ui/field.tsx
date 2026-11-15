import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

/**
 * Marketing form fields (contact page). Softer and rounder than the auth
 * inputs: translucent white fill, pill-radius text inputs, pine hairline.
 */

const controlBase =
  // 16px below laptop width: iPhones zoom the whole page in when a field with smaller text is tapped
  "w-full border border-pine/13 bg-white/30 px-4 text-base text-pine outline-none transition-colors placeholder:text-pine/60 focus-visible:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/60 lg:text-sm";

function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-bold text-pine">
      {children}
    </label>
  );
}

export function TextField({
  id,
  label,
  placeholder,
  type = "text",
  autoComplete,
  className,
}: {
  id: string;
  label: string;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={cn(controlBase, "h-11 rounded-3xl")}
      />
    </div>
  );
}

export function SelectField({
  id,
  label,
  options,
  defaultValue,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  options: readonly string[];
  defaultValue?: string;
  /** Pass value + onChange to drive the select; leave both out for an uncontrolled field. */
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  const controlled = value !== undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {/* The platform's own dropdown (styled trigger + menu), not the OS native <select>.
          It writes a hidden input under `id`, so the marketing form still submits the value. */}
      <Select
        id={id}
        name={id}
        label={label}
        options={options}
        defaultValue={defaultValue ?? options[0]}
        {...(controlled ? { value, onValueChange: onChange } : {})}
        block
        className={cn(
          "h-11 w-full rounded-3xl border border-pine/13 bg-white/30 pl-4 pr-10 text-base text-pine transition-colors hover:border-pine/25 focus-visible:border-pine/40 focus-visible:ring-lime/60 lg:text-sm",
        )}
      />
    </div>
  );
}

export function TextareaField({
  id,
  label,
  placeholder,
  rows = 4,
  className,
}: {
  id: string;
  label: string;
  placeholder: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={id}
        rows={rows}
        placeholder={placeholder}
        className={cn(
          controlBase,
          "resize-none rounded-2xl py-3 leading-relaxed",
        )}
      />
    </div>
  );
}
