/** Contact page content ("Let's Talk"). */

export const contactHero = {
  heading: "Let's Talk.",
  subline:
    "Questions about a Workflow, pricing, or a security disclosure, reach the right team below.",
  primaryCta: { label: "Book A Demo", href: "#book-a-demo" },
  // opens the sales chat (salesChat below), at the lower right of the page
  secondaryCta: { label: "Chat With Sales" },
} as const;

export type ContactTeam = {
  id: string;
  name: string;
  description: string;
  email: string;
  icon: "mail" | "life-buoy" | "shield" | "newspaper";
};

export const contactTeams: ContactTeam[] = [
  {
    id: "sales",
    name: "Sales",
    description: "Pricing, demos, and Workflow design help.",
    email: "sales@verisec.dev",
    icon: "mail",
  },
  {
    id: "support",
    name: "Support",
    description: "Integration issues, API errors, account access.",
    email: "support@verisec.dev",
    icon: "life-buoy",
  },
  {
    id: "security",
    name: "Security",
    description: "Responsible disclosure, PGP key available.",
    email: "security@verisec.dev",
    icon: "shield",
  },
  {
    id: "press",
    name: "Press & Partnerships",
    description: "Media inquiries and integration partnerships.",
    email: "press@verisec.dev",
    icon: "newspaper",
  },
];

export const contactForm = {
  eyebrow: "General inquiry",
  heading: "Send us a message",
  fields: {
    fullName: { label: "Full name", placeholder: "Mark Grayson" },
    workEmail: { label: "Work email", placeholder: "mark@company.com" },
    company: { label: "Company", placeholder: "Invincible Inc." },
    companySize: {
      label: "Company size",
      options: ["1-10", "11-50", "51-200", "201-1000", "1000+"],
    },
    reason: {
      label: "Reason for contact",
      options: [
        "Sales & pricing",
        "Technical support",
        "Security disclosure",
        "Press & partnerships",
        "Something else",
      ],
    },
    message: {
      label: "Message",
      placeholder: "Tell us a little about what you're building…",
    },
  },
  submit: "Send message",
} as const;

/**
 * "Chat With Sales": a small guided chat at the lower right. The visitor picks what they would like to use, may add a
 * rough monthly volume and a note, then leaves a name and work email. It goes to the sales team by email, after the
 * same security check as the contact form, and a person replies by email. Nothing here may promise more than that.
 *
 * Product names are the ones the site already uses (Solutions, the Financial portal, the onboarding's plain names for
 * each check), never new ones. The volume choices are the onboarding's, plus "Not sure yet".
 */
export const salesChat = {
  /** Shown when sending fails, so the visitor always has a way through. */
  email: "sales@verisec.dev",
  title: "VeriSec Sales",
  subtitle: "We reply by email",
  greeting:
    "Hello, this is VeriSec Sales. Answer a few short questions and we will pass your request to our sales team.",
  products: {
    question: "What would you like to use? Pick one or more.",
    groups: [
      {
        id: "identity",
        label: "Identity",
        options: [
          { id: "kyc", label: "KYC verification" },
          { id: "documents", label: "Identity documents" },
          { id: "face", label: "Face match and liveness" },
          { id: "aml", label: "AML screening" },
          { id: "age", label: "Age verification" },
          { id: "contact", label: "Phone and email" },
          { id: "device", label: "Device and IP risk" },
          { id: "address", label: "Proof of address" },
        ],
      },
      {
        id: "financial",
        label: "Financial",
        options: [
          { id: "micr", label: "Cheque reading (MICR)" },
          { id: "cards", label: "Payment card reading" },
          { id: "bin", label: "BIN lookup" },
          { id: "banks", label: "Bank lookup" },
        ],
      },
    ],
    other: { id: "other", label: "Something else" },
    none: "Pick at least one option.",
    picked: (n: number) => (n === 1 ? "1 picked" : `${n} picked`),
    prompt: "Pick one or more",
    change: "Change the products",
  },
  details: {
    question:
      "Thanks. What monthly volume do you expect? A rough number is fine.",
    volumes: [
      "Fewer than 1,000",
      "1,000 to 10,000",
      "10,000 to 100,000",
      "More than 100,000",
      "Not sure yet",
    ],
    volumeLabel: "Monthly volume",
    message: "Anything else we should know?",
    messagePlaceholder: "For example your use case, countries or timeline",
    // "Something else" was picked: the note is where they can say what
    messageOther: "Tell us a little about what you need.",
    messageOtherPlaceholder:
      "For example the documents or checks you have in mind",
    note: "Both are optional",
    none: "No details for now",
    skip: "Skip",
    change: "Change the details",
  },
  contact: {
    question: "How can our team reach you?",
    name: {
      label: "Your name",
      placeholder: contactForm.fields.fullName.placeholder,
    },
    email: {
      label: "Work email",
      placeholder: contactForm.fields.workEmail.placeholder,
    },
    company: {
      label: "Company",
      optional: "optional",
      placeholder: contactForm.fields.company.placeholder,
    },
    nameMissing: "Enter your name.",
    emailInvalid: "Enter a valid work email.",
    humanMissing: "Complete the security check first.",
    send: "Send",
    sending: "Sending",
  },
  sending: "Sending your request",
  done: {
    thanks: (name: string) => `Thanks, ${name}.`,
    body: "We are passing your request to our sales team. A person from our team will read it and reply to",
  },
  failed: {
    title: "Your request was not sent.",
    later: "Please try again in a moment.",
    offline: "We could not reach our servers. Check your connection.",
    email: "You can also email us at",
    retry: "Try again",
  },
  next: "Continue",
  change: "Change",
  startOver: "Start over",
  close: "Close",
  closeLabel: "Close the chat",
} as const;

export const demoBooking = {
  eyebrow: "Book a demo",
  heading: "Pick a time that suits you",
  weekdays: ["S", "M", "T", "W", "T", "F", "S"],
  weekdaysNote: "Weekdays only. Past days and weekends can't be booked.",
  slotsLabel: "Available slots",
  slots: ["09:00", "10:30", "13:00", "15:30"],
  selectedSlot: "10:30",
  timezoneLabel: "Timezone",
  /**
   * The timezone picker is filled at runtime with every zone the visitor's
   * browser knows (Intl.supportedValuesOf), each labelled with its current UTC
   * offset, and it opens on the visitor's own detected zone. This is only the
   * fallback list for the rare browser that cannot enumerate zones; either way,
   * the team email converts the chosen time into our own timezone to read.
   */
  timezoneFallback: [
    "Africa/Kigali",
    "Africa/Lagos",
    "Africa/Johannesburg",
    "Africa/Cairo",
    "Africa/Nairobi",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Toronto",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Madrid",
    "Europe/Istanbul",
    "Europe/Moscow",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Asia/Hong_Kong",
    "Australia/Sydney",
    "Pacific/Auckland",
    "UTC",
  ],
  dateMissing: "Choose a future weekday for the demo.",
  /** The visitor leaves a name and work email so our team can send the invite. */
  nameLabel: "Your name",
  namePlaceholder: contactForm.fields.fullName.placeholder,
  emailLabel: "Work email",
  emailPlaceholder: contactForm.fields.workEmail.placeholder,
  nameMissing: "Enter your name.",
  emailInvalid: "Enter a valid work email.",
  humanMissing: "Complete the security check first.",
  sending: "Sending your request",
  confirmedTitle: "Your demo is requested.",
  confirmedBody:
    "We have your request and will email you to confirm the exact time and send the invite.",
  failedTitle: "Your request was not sent.",
  failedBody: "Please try again in a moment, or email admin@verisec.dev.",
} as const;

export const contactFaq = {
  heading: "Before you\nreach out.",
  subline:
    "Quick answers to the questions our team gets most often through this form.",
  defaultOpen: "security-vuln",
  items: [
    {
      id: "response-time",
      question: "How fast will I hear back?",
      answer:
        "Sales and support reply within one business day. Security disclosures are acknowledged within four hours.",
    },
    {
      id: "security-vuln",
      question: "I found a security vulnerability, who do I tell?",
      answer:
        "Email security@verisec.dev using the PGP key linked above. We acknowledge within four hours and coordinate a fix and disclosure timeline with you.",
    },
    {
      id: "live-demo",
      question: "Can I get a live demo before I sign up?",
      answer:
        "Yes. Book a slot above and a solutions engineer will walk your team through a Workflow built for your use case.",
    },
    {
      id: "languages",
      question: "Do you offer support in languages other than English?",
      answer:
        "Yes. Our team covers English, French and Kinyarwanda across Kigali and Princeton hours.",
    },
    {
      id: "existing-customer",
      question:
        "I'm a current customer with an account issue, is this the right form?",
      answer:
        "Email support@verisec.dev directly, or open a ticket from the portal so it lands with your account history attached.",
    },
  ],
} as const;
