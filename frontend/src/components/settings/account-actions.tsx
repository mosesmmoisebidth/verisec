"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRightLeft, Download, Loader2, Lock, Trash2, X } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Select } from "@/components/ui/select";
import { SettingsCard } from "@/components/settings/parts";
import { authApi } from "@/lib/auth-api";
import { accountApi, type Member } from "@/lib/console/account-api";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import type { DangerSettings } from "@/lib/console/types";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

/* ------------------------------------------------------------ shared modal -- */

function Modal({ title, onClose, children, tone = "neutral" }: { title: string; onClose: () => void; children: ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-pine/20 backdrop-blur-md duration-200 animate-in fade-in" />
      <div
        role="dialog"
        aria-label={title}
        className="relative flex w-full max-w-[480px] flex-col gap-4 rounded-[20px] border border-hairline bg-white p-6 shadow-[0_28px_70px_-16px_rgba(14,50,40,0.45)] duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", tone === "danger" ? "bg-[#fdeaea] text-[#dc2626]" : "bg-[#eef3f0] text-pine")}>
            {tone === "danger" ? <AlertTriangle aria-hidden className="size-5" strokeWidth={1.8} /> : <ArrowRightLeft aria-hidden className="size-5" strokeWidth={1.8} />}
          </span>
          <h2 className="m-0 flex-1 pt-1 text-[17px] font-semibold text-pine">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-pine/40 transition-colors hover:text-pine">
            <X aria-hidden className="size-5" strokeWidth={1.8} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const redBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#dc2626] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#b91c1c] disabled:opacity-50";
const greyBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#ececeb] px-5 text-[14px] font-medium text-pine transition-colors hover:bg-[#e2e2e0] disabled:opacity-50";
const limeBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-lime px-5 text-[14px] font-semibold text-pine transition-[filter] hover:brightness-95 disabled:opacity-50";

async function signOutAndLeave() {
  try {
    await authApi.logout();
  } catch {
    /* ignore */
  }
  window.location.assign("/login");
}

/* ------------------------------------------------------- Export (Data tab) -- */

export function ExportDataButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/verifications/export.xlsx`, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `verisec-verifications-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export ready", "Your verifications downloaded as an Excel file. Dates of birth and ID numbers are blurred.");
    } catch (e) {
      toast.error("Could not export", String((e as Error).message) === "403" ? "You do not have permission to export." : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={() => void run()} disabled={busy} className={greyBtn}>
      {busy ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} /> : <Download aria-hidden className="size-4" strokeWidth={1.8} />}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------- Danger zone -- */

export function DangerZone({ data }: { data: DangerSettings }) {
  const { account } = useCurrentAccount();
  const isOwner = account?.role === "owner";
  const [open, setOpen] = useState<null | "transfer" | "deactivate" | "delete">(null);
  const [transfer, setTransfer] = useState<Awaited<ReturnType<typeof accountApi.transferStatus>> | null>(null);

  const loadTransfer = () => {
    accountApi.transferStatus().then(setTransfer).catch(() => undefined);
  };
  useEffect(loadTransfer, []);

  const iconFor: Record<string, typeof Lock> = { transfer: ArrowRightLeft, deactivate: Lock, delete: Trash2 };

  return (
    <div className="flex flex-col gap-4">
      {transfer?.transfer ? (
        <TransferBanner state={transfer} onChange={loadTransfer} />
      ) : null}

      {data.cards.map((card) => {
        const danger = card.tone === "danger";
        const Icon = iconFor[card.key] ?? Lock;
        const disabled = !isOwner;
        return (
          <SettingsCard key={card.key} className={danger ? "border-[#f3d2d2] bg-[#fdf4f4]" : undefined}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="flex min-w-0 max-w-[68ch] flex-col gap-1">
                <span className="text-[16px] font-medium text-pine">{card.title}</span>
                <span className="text-[14px] leading-relaxed text-pine/60">{card.description}</span>
                {disabled ? <span className="text-[13px] text-pine/45">Only the owner can do this.</span> : null}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(card.key as "transfer" | "deactivate" | "delete")}
                className={danger ? redBtn : greyBtn}
              >
                <Icon aria-hidden className="size-4" strokeWidth={1.8} />
                {card.action}
              </button>
            </div>
          </SettingsCard>
        );
      })}

      {open === "transfer" ? <TransferDialog onClose={() => { setOpen(null); loadTransfer(); }} /> : null}
      {open === "deactivate" ? <DeactivateDialog orgName={account?.org ?? "your organisation"} onClose={() => setOpen(null)} /> : null}
      {open === "delete" ? <DeleteDialog orgName={account?.org ?? "your organisation"} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/* The live transfer state, shown to both the owner and the recipient. */
function TransferBanner({ state, onChange }: { state: NonNullable<Awaited<ReturnType<typeof accountApi.transferStatus>>>; onChange: () => void }) {
  const t = state.transfer!;
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChange();
    } catch (e) {
      toast.error("That did not work", (e as Error).message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  let line = "";
  const actions: ReactNode[] = [];
  if (t.iAmRecipient && t.status === "pending") {
    line = `You have been asked to take ownership of this organisation.`;
    actions.push(
      <button key="a" disabled={busy} onClick={() => void act(accountApi.transferAccept, "Accepted — the owner will confirm")} className={limeBtn}>Accept</button>,
      <button key="d" disabled={busy} onClick={() => void act(accountApi.transferCancel, "Declined")} className={greyBtn}>Decline</button>,
    );
  } else if (t.iAmOwner && t.status === "pending") {
    line = `Waiting for ${t.toEmail} to accept the ownership transfer.`;
    actions.push(<button key="c" disabled={busy} onClick={() => void act(accountApi.transferCancel, "Transfer cancelled")} className={greyBtn}>Cancel transfer</button>);
  } else if (t.iAmOwner && t.status === "accepted") {
    line = `${t.toEmail} accepted. Confirm to make them the owner — you become an admin.`;
    actions.push(
      <button key="ap" disabled={busy} onClick={() => void act(accountApi.transferApprove, "Ownership transferred")} className={limeBtn}>Confirm transfer</button>,
      <button key="c" disabled={busy} onClick={() => void act(accountApi.transferCancel, "Transfer cancelled")} className={greyBtn}>Cancel</button>,
    );
  } else if (t.iAmRecipient && t.status === "accepted") {
    line = `You accepted. Waiting for the current owner to confirm.`;
  } else {
    line = `An ownership transfer is in progress.`;
  }

  return (
    <SettingsCard className="border-[#d9e7df] bg-[#f1f7f3]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="flex items-center gap-2.5 text-[14px] text-pine">
          <ArrowRightLeft aria-hidden className="size-4 text-pine/60" strokeWidth={1.8} />
          {line}
        </span>
        <span className="flex gap-2">{actions}</span>
      </div>
    </SettingsCard>
  );
}

const TRANSFER_PLACEHOLDER = "Choose a team member…";
const memberLabel = (m: Member) => `${m.name} (${m.email}) · ${m.role}`;

function TransferDialog({ onClose }: { onClose: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [pickLabel, setPickLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    accountApi
      .members()
      .then((r) => setMembers(r.members.filter((m) => !m.isSelf)))
      .catch(() => setMembers([]));
  }, []);

  const send = async () => {
    const target = members?.find((m) => memberLabel(m) === pickLabel);
    if (!target) return;
    setBusy(true);
    try {
      await accountApi.transferInitiate(target.userId);
      toast.success("Transfer request sent", "They will be asked to accept, then you confirm.");
      onClose();
    } catch (e) {
      toast.error("Could not start the transfer", (e as Error).message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Transfer ownership" onClose={onClose}>
      <p className="m-0 text-[14px] leading-relaxed text-pine/65">
        Pick a team member to make the new owner. They are asked to accept; once they do, you confirm and ownership
        moves to them. You become an admin. Nothing changes until both steps are done.
      </p>
      {members === null ? (
        <div className="flex h-11 items-center gap-2 text-[14px] text-pine/50"><Loader2 aria-hidden className="size-4 animate-spin" /> Loading team…</div>
      ) : members.length === 0 ? (
        <p className="m-0 rounded-[12px] border border-dashed border-[#e6e6e3] px-4 py-4 text-[14px] text-pine/60">
          You have no other team members yet. Invite someone on the Team page first, then transfer ownership to them.
        </p>
      ) : (
        <Select
          block
          menuFixed
          label="Team member"
          options={[TRANSFER_PLACEHOLDER, ...members.map(memberLabel)]}
          value={pickLabel || TRANSFER_PLACEHOLDER}
          onValueChange={(v) => setPickLabel(v === TRANSFER_PLACEHOLDER ? "" : v)}
          className="h-11 w-full rounded-[12px] border border-[#e6e6e3] bg-white pr-10 pl-3.5 text-[14px] text-pine"
        />
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={greyBtn}>Cancel</button>
        <button type="button" onClick={() => void send()} disabled={busy || !pickLabel} className={limeBtn}>
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          Send transfer request
        </button>
      </div>
    </Modal>
  );
}

function DeactivateDialog({ orgName, onClose }: { orgName: string; onClose: () => void }) {
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await accountApi.deactivate();
      toast.success("Account deactivated");
      await signOutAndLeave();
    } catch (e) {
      setBusy(false);
      toast.error("Could not deactivate", (e as Error).message || "Please try again.");
    }
  };
  return (
    <Modal title="Deactivate account" onClose={onClose} tone="danger">
      <p className="m-0 text-[14px] leading-relaxed text-pine/70">
        Deactivating <b>{orgName}</b> suspends the whole organisation at once:
      </p>
      <ul className="m-0 flex list-none flex-col gap-1.5 pl-0 text-[14px] text-pine/70">
        {["Everyone on your team is signed out and cannot sign back in", "Every verification link stops opening", "All API keys stop working", "Webhooks and app alerts stop"].map((x) => (
          <li key={x} className="flex items-start gap-2"><X aria-hidden className="mt-0.5 size-4 shrink-0 text-[#dc2626]" strokeWidth={2} />{x}</li>
        ))}
      </ul>
      <p className="m-0 text-[13px] text-pine/55">It can be turned back on by contacting support. To delete the account instead, use Delete.</p>
      <label className="flex items-center gap-2.5 text-[14px] text-pine">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="size-4 accent-[#dc2626]" />
        I understand everyone will be signed out.
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={greyBtn}>Cancel</button>
        <button type="button" onClick={() => void run()} disabled={busy || !ack} className={redBtn}>
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Lock aria-hidden className="size-4" strokeWidth={1.8} />}
          Deactivate account
        </button>
      </div>
    </Modal>
  );
}

function DeleteDialog({ orgName, onClose }: { orgName: string; onClose: () => void }) {
  const [step, setStep] = useState<"warn" | "code">("warn");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const r = await accountApi.deleteStart();
      setSentTo(r.sentTo);
      setStep("code");
      toast.success("Confirmation code sent", `Check ${r.sentTo}.`);
    } catch (e) {
      toast.error("Could not send the code", (e as Error).message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      await accountApi.deleteConfirm(code.trim());
      toast.success("Account deleted");
      await signOutAndLeave();
    } catch (e) {
      setBusy(false);
      toast.error("Could not delete the account", (e as Error).message || "Check the code and try again.");
    }
  };

  return (
    <Modal title="Delete account" onClose={onClose} tone="danger">
      {step === "warn" ? (
        <>
          <p className="m-0 text-[14px] leading-relaxed text-pine/70">
            Deleting <b>{orgName}</b> signs everyone out, stops every verification and API key, and anonymises your
            sign-in so the account can no longer be opened. Your email is released so you could register again fresh.
          </p>
          <p className="m-0 text-[13px] text-pine/55">We will email you a confirmation code first, to be sure it is you.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={greyBtn}>Cancel</button>
            <button type="button" onClick={() => void start()} disabled={busy} className={redBtn}>
              {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Send confirmation code
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-[14px] leading-relaxed text-pine/70">
            Enter the 6-digit code sent to <b>{sentTo}</b> to permanently delete this account.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="h-12 w-full rounded-[12px] border border-[#e6e6e3] bg-white px-4 text-center text-[20px] tracking-[6px] text-pine outline-none focus-visible:ring-2 focus-visible:ring-[#dc2626]/50"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={greyBtn}>Cancel</button>
            <button type="button" onClick={() => void confirm()} disabled={busy || code.length < 6} className={redBtn}>
              {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Trash2 aria-hidden className="size-4" strokeWidth={1.8} />}
              Delete account permanently
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
