"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Eye, Loader2, MailCheck, Plus, X } from "lucide-react";

import { BrandedQR } from "@/components/auth/branded-qr";
import { toast } from "@/components/ui/toast";
import { useAccess } from "@/lib/access";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import { workflowsApi } from "@/lib/console/workflows-api";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* The three mode glyphs, rebuilt from Desktop-27's own icons (a bolt, a
   workflow-of-nodes, and a single-item scan) so they match the frame exactly
   and take `currentColor`, the card tints them green when picked. lucide's
   Zap / Workflow / ShieldCheck were close but not these. */
type Glyph = (props: { className?: string }) => React.ReactElement;

const IconBolt: Glyph = ({ className }) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M2.66667 9.33333C2.54051 9.33376 2.41682 9.29839 2.30997 9.23132C2.20312 9.16425 2.11749 9.06824 2.06303 8.95444C2.00858 8.84064 1.98753 8.71372 2.00233 8.58844C2.01714 8.46315 2.06719 8.34464 2.14667 8.24667L8.74667 1.44667C8.79617 1.38952 8.86364 1.3509 8.93799 1.33715C9.01234 1.32341 9.08915 1.33534 9.15582 1.371C9.22249 1.40666 9.27506 1.46393 9.30489 1.53341C9.33472 1.60288 9.34005 1.68043 9.32 1.75333L8.04 5.76667C8.00226 5.86768 7.98958 5.97635 8.00306 6.08334C8.01654 6.19033 8.05577 6.29245 8.11739 6.38095C8.17901 6.46945 8.26118 6.54168 8.35685 6.59144C8.45252 6.6412 8.55883 6.66702 8.66667 6.66667H13.3333C13.4595 6.66624 13.5832 6.70161 13.69 6.76868C13.7969 6.83575 13.8825 6.93176 13.937 7.04556C13.9914 7.15936 14.0125 7.28628 13.9977 7.41156C13.9829 7.53685 13.9328 7.65536 13.8533 7.75333L7.25333 14.5533C7.20383 14.6105 7.13636 14.6491 7.06201 14.6628C6.98766 14.6766 6.91085 14.6647 6.84418 14.629C6.77751 14.5933 6.72494 14.5361 6.69511 14.4666C6.66528 14.3971 6.65995 14.3196 6.68 14.2467L7.96 10.2333C7.99774 10.1323 8.01042 10.0237 7.99694 9.91666C7.98346 9.80967 7.94423 9.70755 7.88261 9.61905C7.82099 9.53055 7.73882 9.45832 7.64315 9.40856C7.54748 9.3588 7.44117 9.33298 7.33333 9.33333H2.66667Z"
      stroke="currentColor"
      strokeWidth="1.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconWorkflow: Glyph = ({ className }) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M6 2H3.33333C2.59695 2 2 2.59695 2 3.33333V6C2 6.73638 2.59695 7.33333 3.33333 7.33333H6C6.73638 7.33333 7.33333 6.73638 7.33333 6V3.33333C7.33333 2.59695 6.73638 2 6 2Z"
      stroke="currentColor"
      strokeWidth="1.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.66667 7.33333V10C4.66667 10.3536 4.80714 10.6928 5.05719 10.9428C5.30724 11.1929 5.64638 11.3333 6 11.3333H8.66667"
      stroke="currentColor"
      strokeWidth="1.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12.6667 8.66667H10C9.26362 8.66667 8.66667 9.26362 8.66667 10V12.6667C8.66667 13.403 9.26362 14 10 14H12.6667C13.403 14 14 13.403 14 12.6667V10C14 9.26362 13.403 8.66667 12.6667 8.66667Z"
      stroke="currentColor"
      strokeWidth="1.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconSingleCheck: Glyph = ({ className }) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M9.66667 1.33333V13C9.66667 13.9333 8.93333 14.6667 8 14.6667C7.06667 14.6667 6.33333 13.9333 6.33333 13V1.33333"
      stroke="currentColor"
      strokeWidth="1.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M5.66667 1.33333H10.3333" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9.66667 10.6667H6.33333" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * "New verification session" — Figma Desktop-27 / 28 / 29 (choose) → Desktop-30
 * (session ready). One dialog, two modes.
 *
 * The only stateful thing on the Verifications / Dashboard header, so the only
 * client island there: it owns open/closed and which option is picked, nothing
 * else. A native `<dialog>` via `showModal()`, so focus-trap, Escape, the top
 * layer and page-inertness are the platform's job (same call as CreateKeyDialog).
 *
 * The three modes are distinct, as the frames draw them:
 *  - Default workflow — one click, no picker; runs the standard KYC.
 *  - Pick a workflow  — choose one of your workflows, or any template (it is kept once used).
 *  - Single check     — run one check only.
 * Creating the session moves to the "Session ready" view: a REAL scannable QR
 * (segno SVG) plus the single-use link, and the way into the flow. The link and
 * QR are specimen demo values — no PII.
 */

type Mode = "choose" | "ready";
type Option = "default" | "pick" | "single";

const OPTIONS: { id: Option; icon: Glyph; title: string; sub: string }[] = [
  { id: "default", icon: IconBolt, title: "Default workflow", sub: "One click" },
  { id: "pick", icon: IconWorkflow, title: "Pick a workflow", sub: "Yours or a template" },
  { id: "single", icon: IconSingleCheck, title: "Single check", sub: "One check only" },
];


const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";
/** A real verification: its one-time link (the QR encodes it) and the reference it is filed under. */
type Created = { link: string; reference: string; accessSentTo?: string; workflow?: { id: string; name: string; version: number } };
/** What the operator can run: one of the organisation's published workflows, or a template. */
type Runnable = { id?: string; template?: string; label: string };
/**
 * What the dialog can run: the organisation's published workflows, then every template (one runs the
 * first time it is picked and is then kept as the organisation's workflow), the default, and drafts.
 */
type Workflows = { runnable: Runnable[]; own: number; defaultName: string | null; drafts: number };
/** Single check has no backing yet: shown, not selectable. */
const SOON: Partial<Record<Option, string>> = { single: "Coming soon" };
// Where the session opens. The applicant/preview flow starts at Desktop-1
// (/welcome), which then leads into the card flow.
const SESSION_ENTRY = "/welcome";

export function NewSessionButton({ label, compact }: { label: string; compact?: boolean }) {
  // only a role that may start verifications sees it (Owner, Admin, Developer, Reviewer)
  const mayRun = useAccess().can("run");
  // the signed-in operator's own email, offered as a one-tap fill (verifying yourself, or a quick test)
  const myEmail = useCurrentAccount().account?.email?.trim().toLowerCase() || "";
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>("choose");
  const [option, setOption] = useState<Option>("default");
  const [reference, setReference] = useState("");
  // the applicant's email: their access code is sent there (never shown on this screen)
  const [applicantEmail, setApplicantEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const open = () => {
    setMode("choose");
    setOption("default");
    setCopied(false);
    ref.current?.showModal();
    load();
  };
  const close = () => ref.current?.close();

  const [created, setCreated] = useState<Created | null>(null);
  const [creating, setCreating] = useState(false);
  // the organisation's workflows, loaded fresh each time the dialog opens (one just published shows up)
  const [flows, setFlows] = useState<Workflows | null>(null);
  const runnable = flows?.runnable ?? null;
  const [picked, setPicked] = useState<string>("");

  const load = () => {
    setFlows(null);
    void Promise.all([workflowsApi.list(), workflowsApi.catalogue()]).then(([r, c]) => {
      if (!r.ok) {
        setFlows({ runnable: [], own: 0, defaultName: null, drafts: 0 });
        toast.error("Couldn't load your workflows", r.message);
        return;
      }
      const live = r.data.workflows.filter((w) => w.status === "active" && w.version);
      const seen = new Set<string>();
      const unique = (label: string, id: string) => {
        // two with one name stay apart
        const out = seen.has(label) ? `${label} ${id.slice(-4)}` : label;
        seen.add(out);
        return out;
      };
      const own: Runnable[] = live.map((w) => ({
        id: w.id,
        // the label names the version and the default
        label: unique(`${w.name} (v${w.version})${w.isDefault ? ", default" : ""}`, w.id),
      }));
      // every template that can run, except one the organisation already runs unchanged (listed above)
      const kept = new Set(live.filter((w) => w.matchesTemplate && w.template).map((w) => w.template!));
      const templates: Runnable[] = c.ok
        ? c.data.templates
            .filter((t) => t.available && !kept.has(t.id))
            .map((t) => ({ template: t.id, label: unique(t.name, t.id) }))
        : [];
      const list = [...own, ...templates];
      setFlows({
        runnable: list,
        own: own.length,
        defaultName: r.data.workflows.find((w) => w.isDefault)?.name ?? null,
        drafts: r.data.workflows.filter((w) => w.status === "draft").length,
      });
      setPicked((p) => (list.some((w) => w.label === p) ? p : (list[0]?.label ?? "")));
    });
  };

  const choose = (id: Option) => {
    if (SOON[id]) return;
    setOption(id);
  };

  // The session is created for real, for the operator's organisation; its link opens the flow on any device.
  const create = async () => {
    if (creating) return;
    const mail = applicantEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) {
      setEmailError("Enter the applicant's email. Their access code is sent there.");
      document.getElementById("ns-email")?.focus();
      return;
    }
    setEmailError(null);
    setCreating(true);
    try {
      const r = await fetch(`${API}/api/verifications/sessions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: reference.trim() || undefined,
          email: mail,
          ...(option === "pick"
            ? { workflowId: runnable?.find((w) => w.label === picked)?.id, template: runnable?.find((w) => w.label === picked)?.template }
            : {}),
        }),
      });
      const j = (await r.json().catch(() => null)) as (Created & { message?: string }) | null;
      if (!r.ok || !j?.link) throw new Error(typeof j?.message === "string" ? j.message : "");
      setCreated({ link: j.link, reference: j.reference, accessSentTo: j.accessSentTo, workflow: j.workflow });
      setMode("ready");
    } catch (e) {
      toast.error("Couldn't create the session", (e as Error).message || "Please check you are signed in and try again.");
    } finally {
      setCreating(false);
    }
  };

  // A preview of the workflow this session runs, in its own tab: a separate session of the operator's own, so the
  // applicant's link stays unopened (a link belongs to the first device that opens it).
  const [previewing, setPreviewing] = useState(false);
  const preview = async () => {
    if (previewing) return;
    setPreviewing(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const r = await fetch(`${API}/api/kyc/sessions/dev`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(created?.workflow ? { workflowId: created.workflow.id } : {}),
      });
      const j = (await r.json().catch(() => null)) as { clientSecret?: string; reason?: string; message?: string } | null;
      if (!r.ok || !j?.clientSecret) throw new Error(j?.reason ?? (typeof j?.message === "string" ? j.message : ""));
      const url = `/verify/start?session=${encodeURIComponent(j.clientSecret)}`;
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else window.location.href = url;
    } catch (e) {
      tab?.close();
      toast.error("Couldn't open the preview", (e as Error).message || "Please check you are signed in and try again.");
    } finally {
      setPreviewing(false);
    }
  };

  const copyLink = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the link is visible to select by hand */
    }
  };

  const displayRef = created?.reference ?? reference.trim();

  if (!mayRun) return null;
  return (
    <>
      <button
        type="button"
        onClick={open}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-pill bg-lime px-3 text-micro font-medium text-pine transition-[filter] hover:brightness-95",
          compact ? "h-[30px]" : "h-[35px]",
        )}
      >
        <Plus aria-hidden className="size-[15px]" strokeWidth={2.2} />
        {label}
      </button>

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={ref}
        aria-labelledby="new-session-title"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className="m-auto w-[min(672px,calc(100vw-2rem))] rounded-[20px] border border-edge bg-white p-0 text-ink shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
      >
        {mode === "choose" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
            className="flex max-h-[88dvh] flex-col overflow-y-auto p-6"
          >
            <Header
              title="New verification session"
              sub="Pick how to run this verification. A unique link + QR is generated for one applicant."
              onClose={close}
            />

            {/* Desktop-27/28/29 — the three modes, selectable. */}
            <div
              role="radiogroup"
              aria-label="How to run this verification"
              className="mt-5 grid gap-3 sm:grid-cols-3"
            >
              {OPTIONS.map(({ id, icon: Icon, title, sub }) => {
                const active = option === id;
                const soon = SOON[id];
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-disabled={soon ? true : undefined}
                    onClick={() => choose(id)}
                    className={cn(
                      "flex flex-col items-start gap-2.5 rounded-[14px] border p-3.5 text-left transition-colors",
                      soon && "cursor-not-allowed opacity-60",
                      // Desktop-27: the picked card is a white-green card, not
                      // the black outline we had — a lime-green border on a pale
                      // lime wash, its glyph tinted the same green.
                      active
                        ? "border-[#9bd021] bg-lime/12"
                        : "border-hairline bg-panel hover:border-pine/30",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-[#7cb518]" : "text-slate")} />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body font-medium text-ink">{title}</span>
                      <span className="text-micro text-slate">
                        {/* with no published workflow of its own, the organisation runs Standard KYC */}
                        {soon ?? (id === "default" && flows ? `Runs ${flows.defaultName ?? "Standard KYC"}` : sub)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* The picker the frame reveals for Pick-a-workflow / Single-check. */}
            {option === "pick" ? (
              <div className="mt-4 flex flex-col gap-2.5">
                <label htmlFor="ns-picker" className="text-body text-ink">
                  Workflow
                </label>
                {runnable === null ? (
                  <span className="flex h-9 items-center gap-2 text-micro text-slate">
                    <Loader2 aria-hidden className="size-4 animate-spin" /> Please wait…
                  </span>
                ) : runnable.length === 0 ? (
                  <span className="text-micro text-slate">
                    No published workflow yet.{" "}
                    <Link href="/workflows/" className="font-medium text-pine underline underline-offset-2">
                      Publish one on the Workflows page
                    </Link>
                    .
                  </span>
                ) : (
                  <Select
                    block
                    id="ns-picker"
                    name="workflow"
                    label="Workflow"
                    options={runnable.map((w) => w.label)}
                    sections={[
                      ...(flows && flows.own > 0 ? [{ label: "Your workflows", start: 0 }] : []),
                      ...(flows && runnable.length > flows.own ? [{ label: "Templates", start: flows.own }] : []),
                    ]}
                    menuFixed
                    value={picked}
                    onValueChange={setPicked}
                    className="h-9 w-full rounded-[10px] border border-hairline bg-panel py-0 pr-10 pl-3.5 text-body text-ink"
                  />
                )}
                {flows && flows.drafts > 0 ? (
                  <span className="text-micro text-slate">
                    {flows.drafts} draft{flows.drafts === 1 ? " is" : "s are"} not listed: a workflow runs verifications once it is published.
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="ns-email" className="text-body text-ink">
                  Applicant&apos;s email
                </label>
                {/* Verifying yourself (or a quick test): one tap fills your own signed-in email. */}
                {myEmail && applicantEmail.trim().toLowerCase() !== myEmail ? (
                  <button
                    type="button"
                    onClick={() => {
                      setApplicantEmail(myEmail);
                      setEmailError(null);
                    }}
                    title={`Send the code to your own email (${myEmail})`}
                    className="inline-flex max-w-[55%] items-center gap-1.5 rounded-pill border border-hairline bg-panel px-2.5 py-1 text-micro text-pine transition-colors hover:border-pine/30 hover:bg-hover-panel"
                  >
                    <MailCheck aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
                    <span className="truncate">Use my email</span>
                  </button>
                ) : null}
              </div>
              <input
                id="ns-email"
                name="applicant-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={applicantEmail}
                onChange={(e) => {
                  setApplicantEmail(e.target.value);
                  setEmailError(null);
                }}
                aria-invalid={emailError ? true : undefined}
                aria-describedby="ns-email-note"
                placeholder="applicant@example.com"
                className={cn(
                  "h-9 w-full rounded-[10px] border bg-panel px-3.5 text-body text-ink outline-none placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime",
                  emailError ? "border-danger" : "border-hairline",
                )}
              />
              <span id="ns-email-note" role={emailError ? "alert" : undefined} className={cn("text-micro", emailError ? "text-danger" : "text-slate")}>
                {emailError ?? "We email them a 6-digit access code. The link opens only with it."}
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
              <label htmlFor="ns-ref" className="text-body text-ink">
                Your reference (optional)
              </label>
              <input
                id="ns-ref"
                name="reference"
                type="text"
                autoComplete="off"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. user_10422"
                className="h-9 w-full rounded-[10px] border border-hairline bg-panel px-3.5 text-body text-ink outline-none placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime"
              />
            </div>

            {/* Exactly which workflow this session will run, before it is created: so a Default-mode
                session is never mistaken for a picked one (the applicant's steps are this workflow's). */}
            {option !== "single" ? (
              <p className="mt-5 flex items-center gap-2 rounded-[10px] border border-hairline bg-panel px-3.5 py-2.5 text-micro text-slate">
                <IconWorkflow className="size-4 shrink-0 text-pine/70" />
                <span>
                  This session runs{" "}
                  <span className="font-medium text-ink">
                    {option === "pick" ? picked || "a workflow you pick" : (flows?.defaultName ?? "Standard KYC")}
                  </span>
                  . The applicant only sees this workflow&apos;s steps.
                </span>
              </p>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={close}
                className="inline-flex h-9 items-center justify-center rounded-pill border border-hairline px-5 text-body text-ink transition-colors hover:bg-hover-panel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-pill bg-pine px-5 text-body font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-70"
              >
                {creating ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.2} /> : null}
                Create session
              </button>
            </div>
          </form>
        ) : (
          // Desktop-30 — session ready: QR + single-use link + the way in.
          <div className="flex max-h-[88dvh] flex-col overflow-y-auto p-6">
            <Header
              title="Session ready"
              sub="Share this link or QR with the applicant. Their access code went to their email: the link opens only with it, within an hour, and only on the first device that opens it."
              onClose={close}
            />

            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-stretch">
              <div className="grid size-[216px] shrink-0 place-items-center overflow-hidden rounded-[14px] border border-hairline bg-white p-2">
{created ? <BrandedQR data={created.link} size={200} label="QR code, scan to open this verification session" /> : null}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-micro text-slate">Verification link</span>
                  <div className="flex items-stretch gap-2">
                    <input
                      readOnly
                      value={created?.link ?? ""}
                      aria-label="Verification link"
                      className="h-9 min-w-0 flex-1 rounded-[10px] border border-hairline bg-panel px-3 text-micro text-ink outline-none"
                    />
                    <button
                      type="button"
                      onClick={copyLink}
                      aria-label="Copy link"
                      className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-hairline bg-panel text-ink transition-colors hover:bg-hover-panel"
                    >
                      {copied ? (
                        <Check aria-hidden className="size-4 text-positive" strokeWidth={2.2} />
                      ) : (
                        <Copy aria-hidden className="size-4" strokeWidth={1.7} />
                      )}
                    </button>
                  </div>
                </div>

                {created?.accessSentTo ? (
                  <div className="flex items-start gap-3 rounded-[12px] border border-lime bg-lime-tint px-3.5 py-3">
                    <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-pine" strokeWidth={1.7} />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-body font-medium text-pine">Access code emailed to {created.accessSentTo}</span>
                      <span className="text-micro text-pine/75">
                        They enter it when they open the link on their device. Nobody sees the code here, so the link alone opens nothing.
                      </span>
                    </span>
                  </div>
                ) : null}

                <p className="m-0 text-micro text-slate">
                  Reference · <span className="font-medium text-ink">{displayRef}</span>
                  {created?.workflow ? (
                    <>
                      {" "}
                      · Workflow · <span className="font-medium text-ink">{created.workflow.name} v{created.workflow.version}</span>
                    </>
                  ) : null}
                </p>

                {/* The applicant flow is a separate surface from the console —
                    it opens in its own tab so the operator keeps this session
                    (link + QR) in front of them rather than navigating away. */}
                <div className="mt-auto flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={preview}
                    disabled={previewing}
                    title="Walk this workflow yourself, in a separate session (the applicant's link stays unopened)"
                    className="inline-flex h-9 items-center gap-2 rounded-pill border border-hairline px-4 text-body text-ink transition-colors hover:bg-hover-panel disabled:opacity-70"
                  >
                    {previewing ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Eye aria-hidden className="size-4" strokeWidth={1.7} />}
                    Preview flow
                  </button>
                  <a
                    href={created?.link ?? SESSION_ENTRY}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-pill bg-pine px-4 text-body font-medium text-white transition-[filter] hover:brightness-110"
                  >
                    Open session here
                    <ArrowUpRight aria-hidden className="size-4" strokeWidth={1.9} />
                  </a>
                </div>
                <p className="m-0 text-micro text-muted">
                  Opening the session here ties it to this browser. For the applicant&apos;s phone, scan the QR instead.
                </p>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

function Header({
  title,
  sub,
  onClose,
}: {
  title: string;
  sub: string;
  onClose: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h2
          id="new-session-title"
          className="m-0 text-[17.9px] leading-[18px] font-medium tracking-[-0.45px] text-ink"
        >
          {title}
        </h2>
        <p className="m-0 text-body text-slate">{sub}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="-m-1 grid size-6 shrink-0 place-items-center rounded-pill text-ink transition-colors hover:bg-hover-panel"
      >
        <X aria-hidden className="size-4" strokeWidth={1.6} />
      </button>
    </header>
  );
}
