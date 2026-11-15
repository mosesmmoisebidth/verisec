"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

import { humanCheckProblem, useHumanCheck } from "@/components/security/human-check";
import { SelectField, TextField, TextareaField } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { contactForm } from "@/config/contact";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

/**
 * The contact page's message form. After the security check it goes to the console, which emails it to the team's
 * mailbox with the visitor as the reply-to address.
 */
export function ContactForm() {
  const { fields } = contactForm;
  const human = useHumanCheck("contact");
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(["fullName", "workEmail", "company", "companySize", "reason", "message"].map((k) => [k, String(fd.get(k) ?? "").trim()]));
    if (!body.fullName || !body.workEmail || !body.message) {
      toast.error("A few details are missing", "Add your name, work email and a message.");
      return;
    }
    if (!human.ready) {
      toast.error("One more step", "Complete the security check above the button.");
      return;
    }
    setPending(true);
    try {
      const captcha = human.take();
      const r = await fetch(`${API}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(captcha ? { "X-Captcha-Token": captcha } : {}) },
        body: JSON.stringify(body),
      });
      const data = (await r.json().catch(() => null)) as { message?: unknown } | null;
      if (!r.ok) {
        const msg = humanCheckProblem(r.status, data) ?? (typeof data?.message === "string" ? data.message : "Please try again in a moment.");
        toast.error("Your message wasn't sent", msg);
        return;
      }
      setSentTo(body.workEmail);
    } catch {
      toast.error("Your message wasn't sent", "We couldn't reach our servers. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (sentTo)
    return (
      <div role="status" className="mt-4 flex flex-col items-start gap-3 rounded-2xl bg-white/80 p-6">
        <CheckCircle2 aria-hidden className="size-8 text-pine" strokeWidth={1.8} />
        <p className="m-0 text-lg font-medium text-pine">Thanks, your message is on its way.</p>
        <p className="m-0 text-base text-ink-muted">
          We&apos;ll reply to <span className="font-medium break-all text-pine">{sentTo}</span>.
        </p>
      </div>
    );

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
      <TextField id="fullName" label={fields.fullName.label} placeholder={fields.fullName.placeholder} autoComplete="name" />
      <TextField
        id="workEmail"
        label={fields.workEmail.label}
        placeholder={fields.workEmail.placeholder}
        type="email"
        autoComplete="email"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="company" label={fields.company.label} placeholder={fields.company.placeholder} autoComplete="organization" />
        <SelectField id="companySize" label={fields.companySize.label} options={fields.companySize.options} defaultValue="11-50" />
      </div>
      <SelectField id="reason" label={fields.reason.label} options={fields.reason.options} />
      <TextareaField id="message" label={fields.message.label} placeholder={fields.message.placeholder} rows={4} />
      {human.widget}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="mt-2 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-pine text-sm font-medium text-white transition-colors hover:bg-pine/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        {contactForm.submit}
        {pending ? null : <ArrowRight aria-hidden className="size-3.5" />}
      </button>
    </form>
  );
}
