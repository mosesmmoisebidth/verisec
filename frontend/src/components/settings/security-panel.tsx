"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, FileCheck2, Link2, Loader2, Plus, ShieldCheck, Trash2, UploadCloud, X } from "lucide-react";

import { SettingsCard } from "@/components/settings/parts";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { accountApi, type SecurityAuditEntry, type SecurityState } from "@/lib/console/account-api";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import type { SecuritySettings } from "@/lib/console/types";

const BUTTON = "inline-flex h-10 w-fit items-center justify-center gap-2 rounded-full bg-lime px-5 text-[14px] font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const FIELD = "h-11 w-full rounded-[11px] border border-[#e6e6e3] bg-white px-3.5 text-[14px] text-pine outline-none focus-visible:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/50 disabled:opacity-60";
const TEXTAREA = "min-h-36 w-full resize-y rounded-[11px] border border-[#e6e6e3] bg-white px-3.5 py-3 font-mono text-[12px] text-pine outline-none focus-visible:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/50 disabled:opacity-60";
const TIMEOUT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "No idle timeout" },
  { value: "1", label: "1 hour" },
  { value: "4", label: "4 hours" },
  { value: "8", label: "8 hours" },
  { value: "12", label: "12 hours" },
  { value: "24", label: "24 hours" },
  { value: "72", label: "72 hours" },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatTime(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : date.toLocaleString();
}

export function SecurityPanel({ data }: { data: SecuritySettings }) {
  const { account, status } = useCurrentAccount();
  const canManage = account?.role === "owner" || account?.role === "admin";
  const [security, setSecurity] = useState<SecurityState | null>(null);
  const [timeout, setTimeout] = useState("");
  const [ips, setIps] = useState<string[]>([]);
  const [ipDraft, setIpDraft] = useState("");
  const [ssoName, setSsoName] = useState("");
  const [metadataXml, setMetadataXml] = useState("");
  const [metadataFileName, setMetadataFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<SecurityAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingSso, setSavingSso] = useState(false);
  const [disablingSso, setDisablingSso] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([accountApi.security(), accountApi.audit(100)])
      .then(([securityResult, auditResult]) => {
        if (!active) return;
        setSecurity(securityResult);
        setTimeout(securityResult.sessionTimeoutHours == null ? "" : String(securityResult.sessionTimeoutHours));
        setIps(securityResult.ipAllowlist);
        setSsoName(securityResult.sso.name ?? "");
        setEntries(auditResult.entries);
      })
      .catch((error: unknown) => {
        if (active) setPolicyError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function addIps(value = ipDraft) {
    const additions = value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
    if (!additions.length) return;
    setIps((current) => [...new Set([...current, ...additions])].slice(0, 50));
    setIpDraft("");
    setPolicyError(null);
  }

  async function readMetadataFile(file: File | undefined | null) {
    if (!file) return;
    if (!/\.xml$/i.test(file.name) && !/xml/i.test(file.type)) {
      toast.error("That is not an XML file", "Upload the SAML metadata .xml file your provider gives you.");
      return;
    }
    if (file.size > 1_000_000) {
      toast.error("That file is too large", "SAML metadata files are small — check you picked the right one.");
      return;
    }
    try {
      const text = await file.text();
      setMetadataXml(text);
      setMetadataFileName(file.name);
      // Pre-fill a friendly name from the file if they haven't typed one.
      if (!ssoName.trim()) setSsoName(file.name.replace(/\.xml$/i, "").replace(/[-_]+/g, " ").slice(0, 100).trim());
      setShowPaste(false);
    } catch {
      toast.error("Could not read that file", "Try again, or paste the XML instead.");
    }
  }

  function clearMetadata() {
    setMetadataXml("");
    setMetadataFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function savePolicy() {
    setSavingPolicy(true);
    setPolicyError(null);
    try {
      const result = await accountApi.updateSecurity({
        sessionTimeoutHours: timeout ? Number(timeout) : null,
        ipAllowlist: ips,
      });
      setIps(result.ipAllowlist);
      setTimeout(result.sessionTimeoutHours == null ? "" : String(result.sessionTimeoutHours));
      toast.success("Security settings saved");
      if (account?.userId) {
        const key = `verisec:security-updated:${account.userId}`;
        try { localStorage.setItem(key, String(Date.now())); } catch {}
        window.dispatchEvent(new Event(key));
      }
      void refreshAudit();
    } catch (error) {
      setPolicyError(errorMessage(error));
    } finally {
      setSavingPolicy(false);
    }
  }

  async function refreshAudit() {
    try {
      const result = await accountApi.audit(100);
      setEntries(result.entries);
    } catch {
      // Keep the current view; an audit refresh should not undo a successful settings save.
    }
  }

  async function saveSso() {
    setSavingSso(true);
    try {
      await accountApi.configureSso({ name: ssoName.trim(), metadataXml: metadataXml.trim() });
      const result = await accountApi.security();
      setSecurity(result);
      setSsoName(result.sso.name ?? "");
      setMetadataXml("");
      toast.success("SAML single sign-on configured");
      void refreshAudit();
    } catch (error) {
      toast.error("Could not configure SAML", errorMessage(error));
    } finally {
      setSavingSso(false);
    }
  }

  async function disableSso() {
    setDisablingSso(true);
    try {
      await accountApi.disableSso();
      const result = await accountApi.security();
      setSecurity(result);
      setSsoName("");
      setMetadataXml("");
      toast.success("SAML single sign-on disabled");
      void refreshAudit();
    } catch (error) {
      toast.error("Could not disable SAML", errorMessage(error));
    } finally {
      setDisablingSso(false);
    }
  }

  async function exportAudit() {
    setExporting(true);
    try {
      const file = await accountApi.auditWorkbook();
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `verisec-audit-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Could not export the audit log", errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  async function copyMetadataUrl() {
    const url = security?.sso.metadataUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("SAML metadata URL copied");
    } catch {
      toast.error("Could not copy the metadata URL", "Copy it from the field directly.");
    }
  }

  return (
    <SettingsCard>
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-4" aria-labelledby="sso-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="sso-heading" className="m-0 flex items-center gap-2 text-[16px] font-semibold text-pine">
                <Link2 aria-hidden className="size-4" /> {data.sso.label}
              </h2>
              <p className="mb-0 mt-1 text-[13px] text-pine/60">
                {security?.sso.enabled ? `Connected to ${security.sso.name}.` : "Connect your organization's SAML identity provider through Zitadel."}
              </p>
            </div>
            {security?.sso.enabled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9f4e8] px-3 py-1.5 text-[12px] font-medium text-[#28684c]">
                <ShieldCheck aria-hidden className="size-3.5" /> Connected
              </span>
            ) : null}
          </div>

          {!security?.sso.enabled && canManage ? (
            <ol className="m-0 flex list-none flex-col gap-2.5 rounded-[12px] border border-[#e6e6e3] bg-[#fafaf8] p-4 pl-4 text-[13px] leading-relaxed text-pine/75">
              {[
                "In your sign-in provider (Okta, Microsoft Entra, Keycloak, Google Workspace…), create a SAML application.",
                "Download that application's metadata file — it's an .xml file your provider gives you.",
                "Give the connection a name and add the file below, then press Connect SAML.",
                "We then show you a Service Provider link to paste back into your provider to finish.",
              ].map((step, index) => (
                <li key={index} className="flex items-start gap-2.5">
                  <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-lime text-[11px] font-semibold text-pine">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : null}

          {security?.sso.enabled && security.sso.metadataUrl ? (
            <div className="rounded-[12px] border border-[#e6e6e3] bg-white p-4">
              <p className="m-0 text-[13px] font-medium text-pine">Service provider metadata</p>
              <p className="mb-3 mt-1 text-[12px] leading-relaxed text-pine/60">
                Add this URL to your identity provider's SAML application. It supplies Zitadel's service-provider details, including its entity ID and ACS endpoint.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input aria-label="SAML service provider metadata URL" readOnly value={security.sso.metadataUrl} className={`${FIELD} min-w-0 flex-1`} />
                <button type="button" onClick={() => void copyMetadataUrl()} className={BUTTON}><Copy aria-hidden className="size-4" /> Copy URL</button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-[13px] font-medium text-pine sm:col-span-2">
              Connection name
              <input value={ssoName} onChange={(event) => setSsoName(event.target.value)} maxLength={100} placeholder="A label for you, e.g. Okta or Company SSO" disabled={!canManage || loading} className={`${FIELD} max-w-md`} />
            </label>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-[13px] font-medium text-pine">Identity provider metadata file</span>
              <p className="m-0 text-[12px] leading-relaxed text-pine/55">
                In your SSO provider (Okta, Microsoft Entra, Keycloak, Google Workspace…) open your SAML app and download its{" "}
                <b>metadata XML</b> file, then add it here — no copy-paste needed.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                className="hidden"
                disabled={!canManage || loading}
                onChange={(event) => void readMetadataFile(event.target.files?.[0])}
              />
              {metadataXml ? (
                <div className="flex items-center gap-3 rounded-[12px] border border-[#cfe6d4] bg-[#f1f8f3] px-4 py-3">
                  <FileCheck2 aria-hidden className="size-5 shrink-0 text-[#28684c]" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-pine">{metadataFileName || "Metadata loaded"}</span>
                  <button type="button" onClick={clearMetadata} disabled={!canManage || loading} aria-label="Remove file" className="text-pine/50 hover:text-danger disabled:opacity-50">
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!canManage || loading}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => { event.preventDefault(); setDragging(false); void readMetadataFile(event.dataTransfer.files?.[0]); }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed px-4 py-7 text-center transition-colors disabled:opacity-60 ${dragging ? "border-lime bg-[#f3f9ef]" : "border-[#d7d7d2] bg-white hover:bg-[#f7f7f5]"}`}
                >
                  <UploadCloud aria-hidden className="size-6 text-pine/45" />
                  <span className="text-[13px] font-medium text-pine">Choose your metadata XML file</span>
                  <span className="text-[12px] text-pine/50">or drag and drop it here</span>
                </button>
              )}
              <button type="button" onClick={() => setShowPaste((value) => !value)} className="self-start text-[12px] text-pine/55 underline-offset-2 hover:underline">
                {showPaste ? "Hide the XML box" : "Paste the XML instead"}
              </button>
              {showPaste ? (
                <textarea
                  value={metadataXml}
                  onChange={(event) => { setMetadataXml(event.target.value); setMetadataFileName(""); }}
                  maxLength={1_000_000}
                  placeholder="Paste the SAML metadata XML from your identity provider"
                  disabled={!canManage || loading}
                  className={TEXTAREA}
                />
              ) : null}
              <span className="text-[12px] text-pine/55">Only existing VeriSec team members with a matching email can sign in — SSO never creates new accounts.</span>
            </div>
          </div>
          {!canManage && status === "authed" ? <p className="m-0 text-[13px] text-pine/55">Only an owner or admin can configure SSO.</p> : null}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void saveSso()} disabled={!canManage || loading || savingSso || !ssoName.trim() || !metadataXml.trim()} className={BUTTON}>
              {savingSso ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
              {security?.sso.enabled ? "Update SAML" : "Connect SAML"}
            </button>
            {security?.sso.enabled ? (
              <button type="button" onClick={() => void disableSso()} disabled={!canManage || disablingSso} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ececeb] px-5 text-[14px] font-medium text-pine hover:bg-[#e2e2e0] disabled:opacity-50">
                {disablingSso ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Trash2 aria-hidden className="size-4" />}
                Disable SSO
              </button>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-[#e7e7e3] pt-6" aria-labelledby="session-heading">
          <div>
            <h2 id="session-heading" className="m-0 text-[16px] font-semibold text-pine">Session and network</h2>
            <p className="mb-0 mt-1 text-[13px] text-pine/60">The idle timer and IP allow-list apply to dashboard and API requests for this team.</p>
          </div>
          <div className="flex max-w-sm flex-col gap-2 text-[13px] font-medium text-pine">
            <span>Idle session timeout</span>
            <Select
              block
              label="Idle session timeout"
              options={TIMEOUT_OPTIONS.map((option) => option.label)}
              value={TIMEOUT_OPTIONS.find((option) => option.value === timeout)?.label ?? TIMEOUT_OPTIONS[0]!.label}
              disabled={!canManage || loading}
              onValueChange={(label) => setTimeout(TIMEOUT_OPTIONS.find((option) => option.label === label)?.value ?? "")}
              className={`${FIELD} pr-10`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="security-ip" className="text-[13px] font-medium text-pine">Dashboard IP allow-list</label>
            <p className="m-0 text-[12px] text-pine/55">Enter an IPv4/IPv6 address or CIDR range, then press Enter. Leave empty to allow any address.</p>
            <div className="flex gap-2">
              <input id="security-ip" value={ipDraft} onChange={(event) => setIpDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addIps(); } }} placeholder="203.0.113.0/24" disabled={!canManage || loading} className={`${FIELD} min-w-0 flex-1`} />
              <button type="button" onClick={() => addIps()} disabled={!canManage || loading || !ipDraft.trim()} aria-label="Add IP range" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#ececeb] text-pine hover:bg-[#e2e2e0] disabled:opacity-50"><Plus aria-hidden className="size-4" /></button>
            </div>
            {ips.length ? (
              <ul className="m-0 flex flex-wrap gap-2 p-0" aria-label="Allowed IP addresses">
                {ips.map((ip) => <li key={ip} className="inline-flex items-center gap-2 rounded-full border border-[#e4e4df] bg-white px-3 py-1.5 font-mono text-[12px] text-pine">
                  {ip}<button type="button" onClick={() => setIps((current) => current.filter((value) => value !== ip))} disabled={!canManage || loading} aria-label={`Remove ${ip}`} className="text-pine/55 hover:text-danger disabled:opacity-50"><Trash2 aria-hidden className="size-3.5" /></button>
                </li>)}
              </ul>
            ) : <p className="m-0 rounded-[10px] bg-white px-3 py-2 text-[12px] text-pine/55">No IP restriction is configured.</p>}
          </div>
          {policyError ? <p role="alert" className="m-0 text-[13px] text-danger">{policyError}</p> : null}
          <button type="button" onClick={() => void savePolicy()} disabled={!canManage || loading || savingPolicy} className={BUTTON}>
            {savingPolicy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
            Save security settings
          </button>
          {!canManage && status === "authed" ? <p className="m-0 text-[13px] text-pine/55">Only an owner or admin can change these settings.</p> : null}
        </section>

        <section className="flex flex-col gap-4 border-t border-[#e7e7e3] pt-6" aria-labelledby="audit-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="audit-heading" className="m-0 text-[16px] font-semibold text-pine">{data.audit.label}</h2>
              <p className="mb-0 mt-1 text-[13px] text-pine/60">Most recent security and account events for this team.</p>
            </div>
            <button type="button" onClick={() => void exportAudit()} disabled={exporting || loading || !canManage} className={BUTTON}>
              {exporting ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" />}
              Export .xlsx
            </button>
          </div>
          <div className="overflow-x-auto rounded-[12px] border border-[#e6e6e3] bg-white">
            <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
              <thead><tr className="border-b border-[#ececea] text-pine/55"><th className="px-4 py-3 font-medium">When</th><th className="px-4 py-3 font-medium">Who</th><th className="px-4 py-3 font-medium">Action</th><th className="px-4 py-3 font-medium">Details</th><th className="px-4 py-3 font-medium">IP</th></tr></thead>
              <tbody>
                {entries.map((entry, index) => <tr key={`${entry.at}-${entry.action}-${index}`} className="border-b border-[#f0f0ed] last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-pine">{formatTime(entry.at)}</td><td className="px-4 py-3 text-pine/70">{entry.actor}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-pine/70">{entry.action}</td><td className="max-w-sm px-4 py-3 text-pine/65">{entry.detail || "—"}</td><td className="px-4 py-3 font-mono text-[12px] text-pine/60">{entry.ip || "—"}</td>
                </tr>)}
                {!loading && entries.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-pine/55">No audit events have been recorded yet.</td></tr> : null}
                {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-pine/55">Loading audit events…</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </SettingsCard>
  );
}
