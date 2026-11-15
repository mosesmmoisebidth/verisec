"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { demoBooking } from "@/config/contact";
import { SelectField } from "@/components/ui/field";
import {
  humanCheckProblem,
  useHumanCheck,
} from "@/components/security/human-check";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const subscribeToLocalDate = (notify: () => void) => {
  window.addEventListener("focus", notify);
  document.addEventListener("visibilitychange", notify);
  return () => {
    window.removeEventListener("focus", notify);
    document.removeEventListener("visibilitychange", notify);
  };
};

const localDateSnapshot = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const serverDateSnapshot = () => "";

function monthFromDateKey(todayKey: string, offset: number) {
  const [year = 0, month = 1] = todayKey.split("-").map(Number);
  return new Date(year, month - 1 + offset, 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(date: Date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, "0")}`;
}

function isBookableDate(date: Date, todayKey: string) {
  return dateKey(date) > todayKey && date.getDay() !== 0 && date.getDay() !== 6;
}

function firstBookableDate(month: Date, todayKey: string) {
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  for (let day = 1; day <= count; day += 1) {
    const candidate = new Date(month.getFullYear(), month.getMonth(), day);
    if (isBookableDate(candidate, todayKey)) return dateKey(candidate);
  }
  return "";
}

function formatMonth(month: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(month);
}

function formatBookingDate(value: string) {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

type ZoneOption = { id: string; label: string; offset: number };

/** Minutes east of UTC parsed from a "GMT+02:00" style offset string. */
function offsetMinutes(raw: string) {
  const m = raw.match(/([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** City + region from an IANA id: "Africa/Kigali" -> { city: "Kigali", region: "Africa" }. */
function zoneParts(id: string) {
  const segs = id.split("/");
  const city = (segs[segs.length - 1] ?? id).replace(/_/g, " ");
  const region = segs.length > 1 ? (segs[0] ?? "").replace(/_/g, " ") : "";
  return { city, region };
}

/**
 * A deterministic starting list (no clock reads), so the server-rendered markup
 * and the first client render match. The browser's full, offset-labelled list
 * replaces it right after mount.
 */
function fallbackZones(ids: readonly string[]): ZoneOption[] {
  return ids.map((id, index) => {
    const { city, region } = zoneParts(id);
    return {
      id,
      label: region ? `${city} · ${region}` : city,
      offset: index,
    };
  });
}

/** Every zone the browser knows, labelled with its current UTC offset, sorted west to east. */
function buildZoneOptions(fallback: readonly string[]): ZoneOption[] {
  let ids: string[] = [];
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    if (supported) ids = supported("timeZone");
  } catch {
    ids = [];
  }
  if (!ids.length) return fallbackZones(fallback);

  const now = new Date();
  const seen = new Set<string>();
  const out: ZoneOption[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: id,
        timeZoneName: "longOffset",
      }).formatToParts(now);
      const raw =
        parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
      const offLabel = /\d/.test(raw)
        ? raw.replace("GMT", "UTC")
        : "UTC+00:00";
      const { city, region } = zoneParts(id);
      out.push({
        id,
        label: region
          ? `(${offLabel}) ${city} · ${region}`
          : `(${offLabel}) ${city}`,
        offset: offsetMinutes(raw),
      });
    } catch {
      // skip a zone the browser cannot format
    }
  }
  out.sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label));
  return out;
}

/** The visitor's own time zone, or "" when the browser will not say. */
function detectZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

/**
 * Demo booking card: month grid, slot picker and timezone select, plus a name and work email.
 * Confirming sends the request to our team by email (the console's /api/contact/book-demo, which
 * mails admin@verisec.dev) after the same security check as the contact form. A person then
 * replies with the invite. The calendar itself stays as designed; the picked day and slot ride
 * along in the email.
 */
export function DemoBooking() {
  const todayKey = useSyncExternalStore(
    subscribeToLocalDate,
    localDateSnapshot,
    serverDateSnapshot,
  );
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  const [slot, setSlot] = useState<string>(demoBooking.selectedSlot);
  // Starts as the deterministic fallback list (so SSR and the first client render
  // match); the browser's full list and the visitor's own zone land in the effect.
  const [zones, setZones] = useState<ZoneOption[]>(() =>
    fallbackZones(demoBooking.timezoneFallback),
  );
  const [tzId, setTzId] = useState<string>(
    () => demoBooking.timezoneFallback[0] ?? "UTC",
  );
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const human = useHumanCheck("book_demo");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once the real date is known (after hydration), open on the first month that actually has a bookable
  // weekday and pre-select it, so the calendar never opens on an all-greyed month with nothing chosen.
  const seeded = useRef(false);
  useEffect(() => {
    if (!todayKey || seeded.current) return;
    seeded.current = true;
    for (let offset = 0; offset <= 12; offset += 1) {
      const iso = firstBookableDate(monthFromDateKey(todayKey, offset), todayKey);
      if (iso) {
        setMonthOffset(offset);
        setSelectedDate(iso);
        break;
      }
    }
  }, [todayKey]);

  // After mount, swap in the browser's full, offset-labelled zone list and open
  // the picker on the visitor's own detected zone (keeping the fallback default
  // if it is not in the list).
  const zonesBuilt = useRef(false);
  useEffect(() => {
    if (zonesBuilt.current) return;
    zonesBuilt.current = true;
    const full = buildZoneOptions(demoBooking.timezoneFallback);
    setZones(full);
    const detected = detectZone();
    setTzId((current) =>
      detected && full.some((z) => z.id === detected)
        ? detected
        : full.some((z) => z.id === current)
          ? current
          : (full[0]?.id ?? current),
    );
  }, []);

  const selectedZoneLabel =
    zones.find((z) => z.id === tzId)?.label ?? zones[0]?.label ?? "";

  const calendarMonth = todayKey
    ? monthFromDateKey(todayKey, monthOffset)
    : null;
  const displayedMonthKey = calendarMonth ? monthKey(calendarMonth) : "";
  const firstAvailableDate =
    calendarMonth && todayKey ? firstBookableDate(calendarMonth, todayKey) : "";
  const activeDate =
    selectedDate.startsWith(displayedMonthKey) && selectedDate > todayKey
      ? selectedDate
      : firstAvailableDate;
  const leadingBlanks = calendarMonth
    ? Array.from({ length: calendarMonth.getDay() })
    : [];
  const daysInMonth = calendarMonth
    ? new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() + 1,
        0,
      ).getDate()
    : 0;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function moveMonth(offset: number) {
    if (!calendarMonth || !todayKey) return;
    const nextOffset = monthOffset + offset;
    if (nextOffset < 0) return;
    const nextMonth = monthFromDateKey(todayKey, nextOffset);
    setMonthOffset(nextOffset);
    setSelectedDate(firstBookableDate(nextMonth, todayKey));
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending || done) return;
    const name = fullName.trim().replace(/\s+/g, " ");
    const email = workEmail.trim().toLowerCase();
    if (name.length < 2) {
      setError(demoBooking.nameMissing);
      return;
    }
    if (!EMAIL.test(email)) {
      setError(demoBooking.emailInvalid);
      return;
    }
    if (!activeDate) {
      setError(demoBooking.dateMissing);
      return;
    }
    if (!human.ready) {
      setError(demoBooking.humanMissing);
      return;
    }
    setError(null);
    setSending(true);
    try {
      const captcha = human.take();
      const r = await fetch(`${API}/api/contact/book-demo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(captcha ? { "X-Captcha-Token": captcha } : {}),
        },
        body: JSON.stringify({
          fullName: name,
          workEmail: email,
          date: activeDate,
          slot,
          timezoneId: tzId,
          timezone: selectedZoneLabel,
          page: window.location.pathname,
        }),
      });
      const data = (await r.json().catch(() => null)) as {
        code?: unknown;
        message?: unknown;
      } | null;
      if (!r.ok) {
        const fixable =
          data?.code === "invalid" && typeof data.message === "string"
            ? data.message
            : null;
        setError(
          humanCheckProblem(r.status, data) ??
            fixable ??
            demoBooking.failedBody,
        );
        return;
      }
      setDone(true);
    } catch {
      setError(demoBooking.failedBody);
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      id="book-a-demo"
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-2 rounded-3xl border border-[#f1f5f9] bg-white p-8 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.1)]"
    >
      <p className="text-[11px] font-bold tracking-wide text-[#5b6472] uppercase">
        {demoBooking.eyebrow}
      </p>
      <h2 className="text-2xl font-medium text-pine">{demoBooking.heading}</h2>

      <div className="mt-4 rounded-[20px] border border-[#f1f5f9] bg-[#f8fafc]/60 p-4 pt-6">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-sm font-bold text-pine">
            {calendarMonth
              ? formatMonth(calendarMonth)
              : "Loading available dates…"}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              disabled={!calendarMonth || monthOffset === 0}
              onClick={() => moveMonth(-1)}
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-pine/60 transition-colors hover:bg-white hover:text-pine disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              disabled={!calendarMonth}
              onClick={() => moveMonth(1)}
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-pine/60 transition-colors hover:bg-white hover:text-pine disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight aria-hidden className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {demoBooking.weekdays.map((weekday, index) => (
            <span
              key={`${weekday}-${index}`}
              aria-hidden
              className="py-1 text-center text-[10px] font-bold text-[#5b6472]"
            >
              {weekday}
            </span>
          ))}
          {leadingBlanks.map((_, index) => (
            <span key={`blank-${index}`} />
          ))}
          {days.map((date) => {
            const candidate = calendarMonth
              ? new Date(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth(),
                  date,
                )
              : null;
            const key = candidate ? dateKey(candidate) : "";
            const isAvailable =
              !!candidate && !!todayKey && isBookableDate(candidate, todayKey);
            const isSelected = key === activeDate;
            return (
              <button
                key={date}
                type="button"
                disabled={!isAvailable}
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedDate(key);
                  setError(null);
                }}
                className={cn(
                  "aspect-square rounded-xl text-sm transition-colors",
                  isSelected
                    ? "bg-lime font-bold text-pine"
                    : isAvailable
                      ? "cursor-pointer bg-white text-pine shadow-[0_0_0_1px_#f1f5f9] hover:bg-lime/25"
                      : "text-pine/25",
                )}
              >
                {date}
              </button>
            );
          })}
        </div>
        <p className="mt-3 px-1 text-[11px] leading-snug text-[#5b6472]">
          {demoBooking.weekdaysNote}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <p className="text-xs font-bold text-pine">{demoBooking.slotsLabel}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {demoBooking.slots.map((option) => {
            const isSelected = option === slot;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setSlot(option);
                  setError(null);
                }}
                className={cn(
                  "h-10 cursor-pointer rounded-full border text-sm font-medium transition-colors",
                  isSelected
                    ? "border-pine bg-pine text-white"
                    : "border-[#e2e8f0] bg-white text-pine hover:border-pine/40",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <SelectField
        id="timezone"
        label={demoBooking.timezoneLabel}
        options={zones.map((z) => z.label)}
        value={selectedZoneLabel}
        onChange={(value) => {
          const match = zones.find((z) => z.label === value);
          if (match) setTzId(match.id);
          setError(null);
        }}
        className="mt-4 [&_button]:border-[#e2e8f0] [&_button]:bg-white"
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BookingField
          id="demo-name"
          label={demoBooking.nameLabel}
          placeholder={demoBooking.namePlaceholder}
          autoComplete="name"
          maxLength={80}
          value={fullName}
          onChange={(v) => {
            setFullName(v);
            if (error) setError(null);
          }}
        />
        <BookingField
          id="demo-email"
          label={demoBooking.emailLabel}
          placeholder={demoBooking.emailPlaceholder}
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          value={workEmail}
          onChange={(v) => {
            setWorkEmail(v);
            if (error) setError(null);
          }}
        />
      </div>

      {human.widget ? <div className="mt-3">{human.widget}</div> : null}

      {done ? (
        <div
          role="status"
          className="mt-5 flex items-start gap-2.5 rounded-[18px] bg-lime/25 px-4 py-3 text-sm leading-relaxed text-pine"
        >
          <CheckCircle2
            aria-hidden
            className="mt-0.5 size-[18px] shrink-0 text-positive"
            strokeWidth={2}
          />
          <span>
            <span className="font-medium">{demoBooking.confirmedTitle}</span>{" "}
            {demoBooking.confirmedBody}
          </span>
        </div>
      ) : (
        <>
          {error ? (
            <p
              role="alert"
              className="mt-3 text-[13px] leading-snug text-danger"
            >
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            aria-disabled={sending || undefined}
            className="mt-5 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-pine text-sm font-medium text-white transition-colors hover:bg-pine/90 aria-disabled:cursor-wait aria-disabled:opacity-75"
          >
            {sending ? (
              <>
                <Loader2 aria-hidden className="size-4 animate-spin" />
                {demoBooking.sending}
              </>
            ) : (
              <>
                Request {activeDate ? formatBookingDate(activeDate) : "a demo"}{" "}
                at {slot}
                <ArrowRight aria-hidden className="size-3.5" />
              </>
            )}
          </button>
        </>
      )}
    </form>
  );
}

/** A controlled text field in the booking card, matching the marketing form inputs. */
function BookingField({
  id,
  label,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  maxLength,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  type?: "text" | "email";
  inputMode?: "text" | "email";
  autoComplete: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-pine">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-3xl border border-[#e2e8f0] bg-white px-4 text-sm text-pine transition-colors outline-none placeholder:text-pine/60 focus-visible:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/60"
      />
    </div>
  );
}
