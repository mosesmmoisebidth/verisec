import type { SettingsData } from "./types";

/**
 * Settings — demo dataset, built to the Figma frames.
 *
 * Identity values reuse the console shell's existing demo account (Mark Fintech
 * / Mark Grayson) so the whole console stays internally consistent. Everything
 * else (industry, IDs, IP range, audit rows) is specimen. Swap the body of
 * `getSettings()` for a fetch and this file goes away.
 */
export const DEMO_SETTINGS: SettingsData = {
  title: "Settings",

  tabs: [
    { id: "profile", label: "Profile" },
    { id: "business", label: "Business" },
    { id: "security", label: "Security" },
    { id: "data", label: "Data & Retention" },
    { id: "notifications", label: "Notifications" },
    { id: "branding", label: "Branding" },
    { id: "danger", label: "Danger zone", danger: true },
  ],

  /* ---- Profile (Desktop-35) ------------------------------------------- */
  profile: {
    photo: { label: "Profile Photo", initials: "MG", actions: ["View", "Edit", "Delete"] },
    name: { key: "name", label: "Name", kind: "text", icon: "user", value: "Mark Grayson", span: "half" },
    email: { key: "email", label: "Email", kind: "email", icon: "mail", value: "markgrayson@gmail.com", span: "half" },
    password: { key: "password", label: "Password", kind: "password", icon: "lock", value: "sample-pass", span: "full" },
    twoFactor: { label: "Two-factor authentication", on: false },
    twoFactorSetup: {
      qrImage: "/qr/qr-handoff.png",
      cancelLabel: "Cancel setup",
      backLabel: "Back",
      continueLabel: "Continue",
      finishLabel: "Finish",
      closeLabel: "Close",
      scan: {
        title: "Scan the QR code",
        subtitle: "Scan this with Google Authenticator, Authy, or another authenticator app.",
        manualLabel: "Can't scan? Enter this code manually",
        manualCode: "JBSW Y3DP EHPK 3PXP QK4T",
      },
      verify: {
        title: "Verify your code",
        subtitle: "Enter the 6-digit code from your authenticator app to confirm setup.",
      },
      backup: {
        title: "Save your backup codes",
        subtitle: "Store these somewhere safe, each code works once if you lose access to your authenticator app.",
        codes: ["4F9C-2K7D", "8QX1-M3ZR", "PL06-7WVE", "T2NB-51JD", "9GKH-XR4A", "MC38-B7YU", "ZE5V-0QNP", "6HTS-D2LW"],
        copyLabel: "Copy",
        downloadLabel: "Download",
        savedLabel: "I've saved these codes",
      },
    },
    language: {
      key: "language",
      label: "Language",
      kind: "select",
      icon: "globe",
      value: "English",
      options: ["English", "Français", "Kinyarwanda", "Português", "العربية"],
      span: "full",
    },
    save: "Save",
  },

  /* ---- Business (Desktop-37) ------------------------------------------ */
  business: {
    photo: { label: "Business Profile", initials: "MF", actions: ["View", "Edit", "Delete"] },
    name: { key: "businessName", label: "Business name", kind: "text", icon: "building", value: "Mark Fintech", span: "full" },
    industry: {
      key: "industry",
      label: "Industry",
      kind: "select",
      icon: "building",
      value: "Fintech",
      options: ["Fintech", "Banking", "Crypto / digital assets", "Telecom", "Marketplace", "Gaming", "Other"],
      span: "full",
    },
    tenantId: { key: "tenantId", label: "Tenant ID", kind: "readonly", icon: "info", value: "biz_mk_9f3c", span: "full" },
    transfer: "Transfer Ownership",
  },

  /* ---- Security (Desktop-50) ------------------------------------------ */
  security: {
    enforce2fa: { label: "Enforce 2FA for all users", on: true },
    sso: { label: "SSO / SAML", connect: "Connect" },
    sessionTimeout: {
      key: "sessionTimeout",
      label: "Session timeout (hrs)",
      kind: "select",
      icon: "clock",
      value: "24",
      options: ["1", "4", "8", "12", "24", "72"],
      span: "full",
    },
    ipAllowlist: {
      key: "ipAllowlist",
      label: "Dashboard IP allow-list",
      kind: "text",
      icon: "list",
      placeholder: "203.0.113.0/24",
      span: "full",
    },
    audit: {
      label: "Audit log",
      rows: [
        { time: "8/13/2026, 8:49:35 PM", actor: "System", action: "audit_start" },
        { time: "8/13/2026, 8:49:35 PM", actor: "System", action: "audit_start" },
        { time: "8/13/2026, 8:49:35 PM", actor: "System", action: "audit_start" },
        { time: "8/13/2026, 8:49:35 PM", actor: "System", action: "audit_start" },
      ],
    },
    password: { key: "secPassword", label: "Password", kind: "password", icon: "lock", value: "sample-pass", span: "full" },
    export: "Export",
  },

  /* ---- Data & Retention (Desktop-39) --------------------------------- */
  data: {
    enforce2fa: { label: "Enforce 2FA for all users", on: true },
    retention: {
      key: "retention",
      label: "Retention period",
      kind: "select",
      icon: "clock",
      value: "1 year",
      options: ["30 days", "90 days", "1 year", "Custom"],
      span: "full",
    },
    region: {
      key: "region",
      label: "Storage region",
      kind: "select",
      icon: "globe",
      value: "EU",
      options: ["EU", "US", "Africa"],
      span: "full",
    },
    note: "PII is masked by default. Reveals are role-gated and logged.",
    exportData: "Export Tenant Data",
    deleteData: "Delete All Data",
  },

  /* ---- Notifications (Desktop-40) ------------------------------------ */
  notifications: {
    columns: { event: "Event", email: "Email", inApp: "In-app", slack: "Slack" },
    rows: [
      { key: "lowBalance", label: "Low balance", email: true, inApp: true, slack: false },
      { key: "paymentFailed", label: "Payment failed", email: true, inApp: true, slack: false },
      { key: "liveKey", label: "Live key created/revoked", email: true, inApp: true, slack: false },
      { key: "securityAlert", label: "Security alert", email: true, inApp: true, slack: false },
      { key: "volumeAnomaly", label: "Volume anomaly", email: true, inApp: true, slack: false },
    ],
    slack: {
      title: "Connect to Slack",
      description:
        "Send these alerts to a Slack channel. Connect your workspace to choose where notifications land.",
      connect: "Connect",
    },
  },

  /* ---- Branding (Desktop-41) ----------------------------------------- */
  branding: {
    companyName: { key: "companyName", label: "Company name", kind: "text", icon: "building", value: "Mark Fintech", span: "half" },
    returnUrl: { key: "returnUrl", label: "Return URL", kind: "url", icon: "link", value: "https://markfintech.co/verified", span: "half" },
    customDomain: { key: "customDomain", label: "Custom domain", kind: "text", icon: "globe", placeholder: "verify.markfintech.co", span: "full" },
    save: "Save",
  },

  /* ---- Danger zone (Desktop-49) -------------------------------------- */
  danger: {
    cards: [
      {
        key: "transfer",
        title: "Transfer ownership",
        description:
          "Move account ownership to another team member. They'll gain full Owner permissions, including billing and the ability to delete this account. You'll be reassigned to Admin.",
        action: "Transfer Ownership",
        tone: "neutral",
      },
      {
        key: "deactivate",
        title: "Deactivate account",
        description:
          "Temporarily suspend the whole organisation. Everyone on your team is signed out and cannot sign back in, every verification link and API key stops, and app alerts pause. Your data is kept — reactivating is done by contacting support.",
        action: "Deactivate account",
        tone: "danger",
      },
      {
        key: "delete",
        title: "Delete account",
        description:
          "Close this account. Everyone is signed out, every verification link and API key stops, and your sign-in is anonymised so the account can no longer be opened. Your email is released so you could register again. We email you a confirmation code first. Export your data from Data & Retention beforehand if you need it.",
        action: "Delete account",
        tone: "danger",
      },
    ],
  },
};
