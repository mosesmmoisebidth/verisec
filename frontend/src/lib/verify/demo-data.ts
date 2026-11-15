/**
 * ════════════════════════════════════════════════════════════════════════════
 *  EVERY VALUE IN THIS FILE IS INVENTED.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * It exists so the applicant flow can be built, reviewed and demonstrated
 * before a backend exists. Read `IS_DEMO_DATA` in `./index.ts` rather than
 * testing for this module by identity.
 *
 * Three constraints shaped what is written here, and they are not stylistic:
 *
 *   · NO PERSONAL DATA, REAL OR CONVINCINGLY FAKE. The review screen exists to
 *     show an applicant what the engine read off their document, so the frame
 *     shows a name, a date of birth and a document number. Those are exactly
 *     the fields the project forbids inventing, because a plausible one is
 *     indistinguishable from a leaked one on a screenshot. So the review screen
 *     carries specimen tokens (SPECIMEN / SAMPLE), a masked document number and
 *     a documentation-only email domain. The LAYOUT is the deliverable; the
 *     values are deliberately unusable.
 *
 *   · NO VERDICT IS STORED. `SIGNALS` below is the only statement of how a
 *     check came out. The "Here's What We Found" screen lists a subset of them;
 *     the final screen derives its verdict, risk level and reason codes from
 *     all of them through `decide()` in `./index.ts`. Flip one `outcome` here
 *     from "pass" to "attention" and both screens change together — that is the
 *     whole point, and it is the same discipline as the console's derived
 *     workflow price.
 *
 *   · NO POSITION IS STORED. No screen says "2 of 4". The step owns an ordered
 *     `screens` array and the view counts it. The Figma frames contradict
 *     themselves here — Capture Front is drawn both "2 of 4" and "2 of 3" — and
 *     a stored counter is how that contradiction would have shipped.
 *
 * When a step becomes real, delete its entry rather than editing the numbers to
 * look plausible.
 */

import type { Signal, VerifyFlow } from "./types";

/* ----------------------------------------------------------------------------
   Signals, the single source of truth for every outcome in the flow
---------------------------------------------------------------------------- */

/**
 * Ordered as they were run, because `decide()` reports reason codes in that
 * order and a reader expects the document checks before the address ones.
 *
 * All of these pass, which is what makes the final frame say "You're Verified".
 * That is a property of the data, not of the code: change `face.match` to
 * "attention" and the result screen becomes "Needs review" at Medium risk with
 * a reason code, with no other edit anywhere.
 *
 * Each `detail` reports an OUTCOME and nothing else — no document numbers, no
 * dates, no addresses. An applicant-facing summary that echoes the data back is
 * a data-leak surface on a shared screen.
 */
export const SIGNALS: Signal[] = [
  {
    id: "doc.authenticity",
    group: "Document",
    label: "Document authenticity",
    outcome: "pass",
    detail: "Security features, fonts and layout match a genuine document of this type.",
  },
  {
    id: "doc.expiry",
    group: "Document",
    label: "Validity",
    outcome: "pass",
    detail: "The document is in date.",
  },
  {
    id: "doc.mrz",
    group: "Document",
    label: "Machine-readable zone",
    outcome: "pass",
    detail: "Check digits are consistent with the printed data.",
  },
  {
    id: "nfc.chip",
    group: "ePassport",
    label: "Chip read",
    outcome: "pass",
    detail: "The chip was read and its signature verified against the issuing authority.",
  },
  {
    id: "face.liveness",
    group: "Face",
    label: "Liveness",
    outcome: "pass",
    detail: "A live person was present for the capture.",
  },
  {
    id: "face.match",
    group: "Face",
    label: "Face match",
    outcome: "pass",
    detail: "Your selfie matches the portrait on the document.",
  },
  {
    id: "contact.phone",
    group: "Contact",
    label: "Phone number",
    outcome: "pass",
    detail: "Confirmed by one-time code.",
  },
  {
    id: "contact.email",
    group: "Contact",
    label: "Email address",
    outcome: "pass",
    detail: "Confirmed by one-time code.",
  },
  {
    id: "address.document",
    group: "Address",
    label: "Proof of address",
    outcome: "pass",
    detail: "The document is an accepted type and is dated within the last three months.",
  },
  {
    id: "address.match",
    group: "Address",
    label: "Address match",
    outcome: "pass",
    detail: "The address on the document matches the one you confirmed.",
  },
];

/** Everything the interim summary covers — the checks run before that screen. */
const FINDINGS_SO_FAR = [
  "doc.authenticity",
  "doc.expiry",
  "doc.mrz",
  "nfc.chip",
  "face.liveness",
  "face.match",
  "contact.phone",
  "contact.email",
];

/* ----------------------------------------------------------------------------
   The flow
---------------------------------------------------------------------------- */

export const DEMO_FLOW: VerifyFlow = {
  brand: {
    // `{org}` is the organisation that opened the verification, filled in at run time from the
    // session (components/verify/tenant.tsx); VeriSec itself for a demo session. Its initials
    // are drawn from that name, so `tenantInitials` stays empty here.
    tenant: "{org}",
    tenantInitials: "",
    wordmark: "VeriSec",
    saveAndExit: "Save & exit",
    legal: "Your data is encrypted in transit and processed securely by VeriSec.",
  },

  copy: {
    back: "Back",
    stepCounter: "Step {n}/{total}",
    substep: "{n} of {total}",
    optional: "optional",
    poweredBy: "Secured by VeriSec",
  },

  landing: {
    badge: "Your workspace is ready",
    heading: "See exactly what your applicants will experience.",
    body: "Before you invite real users, walk through the full applicant flow yourself, document capture, chip read, selfie + liveness, address, and result. It takes about 90 seconds and the completed session lands in your Verifications list.",
    cta: { label: "Verify yourself now", to: "start" },
    secondary: { label: "Skip to dashboard", href: "/dashboard" },
    cards: [
      { index: "01", label: "See what applicants see" },
      { index: "02", label: "Learn the Trust Seal" },
      { index: "03", label: "Get your first session" },
    ],
  },

  signals: SIGNALS,

  steps: [
    /* ---- 1 · Get Started ------------------------------------------------ */
    {
      id: "get-started",
      title: "Get Started",
      caption: "Review what you'll need",
      screens: [
        {
          slug: "start",
          // Desktop-2: single-line checklist, left explainer + "Why do we need
          // this?", "Begin". `{org}` is the organisation that asked for the check.
          title: "Get Started",
          intro: "{org} needs to verify your identity. This takes about 2 minutes.",
          aside: {
            body: "We use VeriSec to confirm you are who you say you are. Your document is checked for authenticity and matched against a live selfie.",
            // a workflow without the document, its authenticity check or the selfie reads a shorter, true line
            needs: ["document", "authenticity", "liveness"],
            leaner: [
              { needs: ["document", "liveness"], value: "We use VeriSec to confirm you are who you say you are. You'll capture your ID document and take a short live selfie." },
              { needs: ["document"], value: "We use VeriSec to confirm you are who you say you are. You'll capture your ID document." },
              { needs: ["liveness"], value: "We use VeriSec to confirm you are who you say you are. You'll take a short live selfie." },
              { needs: [], value: "We use VeriSec to confirm you are who you say you are." },
            ],
            link: {
              label: "Why do we need this?",
              tip: {
                title: "Why do we need this?",
                kind: "paragraphs",
                body: [
                  "Verifying your identity helps {org} confirm you're really you, which protects your account from fraud and keeps things safe for everyone using the platform. It's also a legal requirement for many financial and regulated services.",
                  "You'll need a government-issued ID (like a passport or ID card) and a working camera, the whole process usually takes about 2 minutes, and you can save your progress and come back if you need to.",
                ],
                needs: ["document"],
                leaner: [
                  {
                    needs: ["liveness"],
                    value: [
                      "Verifying your identity helps {org} confirm you're really you, which protects your account from fraud and keeps things safe for everyone using the platform. It's also a legal requirement for many financial and regulated services.",
                      "You'll need a working camera, the whole process usually takes about 2 minutes, and you can save your progress and come back if you need to.",
                    ],
                  },
                  {
                    needs: [],
                    value: [
                      "Verifying your identity helps {org} confirm you're really you, which protects your account from fraud and keeps things safe for everyone using the platform. It's also a legal requirement for many financial and regulated services.",
                      "The whole process usually takes about 2 minutes, and you can save your progress and come back if you need to.",
                    ],
                  },
                ],
              },
            },
          },
          panel: {
            kind: "checklist",
            items: [
              { icon: "id-card", label: "Photo ID or passport", needs: ["document"] },
              { icon: "light", label: "Well-lit space", needs: ["document", "liveness", "face-match", "address"] },
              { icon: "phone", label: "Your phone (for the chip step)", needs: ["nfc"] },
              { icon: "clock", label: "About 2 minutes" },
            ],
          },
          next: { label: "Begin", to: "terms" },
        },
        {
          slug: "terms",
          // Desktop-3: left explainer + "Read full policy", two separate consent
          // checkboxes on the right, "Continue".
          title: "Terms & Privacy",
          intro: "Please review before continuing.",
          aside: {
            body: "{org} collects your ID document and selfie only to verify your identity. Data is encrypted and retained per its privacy policy.",
            link: { label: "Read full policy", href: "/privacy" },
          },
          panel: {
            kind: "consent",
            agreements: [
              "I agree to the terms and privacy policy.",
              "I consent to biometric processing of my selfie.",
            ],
          },
          back: "start",
          next: { label: "Continue", to: "document-type" },
        },
      ],
    },

    /* ---- 2 · Document --------------------------------------------------- */
    {
      id: "document",
      title: "Document",
      caption: "Capture and confirm your ID",
      screens: [
        {
          slug: "document-type",
          // Desktop-4: a Country selector above two-up, single-line options.
          title: "Choose Your Document",
          intro: "Select the government-issued ID you'll use.",
          aside: {
            body: "We accept government-issued ID only. Make sure it hasn't expired and all four corners are visible.",
          },
          panel: {
            kind: "choice",
            name: "documentType",
            country: {
              label: "Country",
              value: "South Africa",
              options: [
                "South Africa",
                "Nigeria",
                "Kenya",
                "Ghana",
                "Rwanda",
                "Egypt",
                "United Kingdom",
                "United States",
              ],
            },
            options: [
              { value: "national-id", icon: "id-card", label: "National ID" },
              { value: "passport", icon: "passport", label: "Passport" },
              { value: "licence", icon: "licence", label: "Driver's licence" },
              { value: "residence-permit", icon: "residence-permit", label: "Residence permit" },
            ],
          },
          back: "terms",
          next: { label: "Continue", to: "document-front" },
        },
        {
          slug: "document-front",
          title: "Capture Front",
          intro: "Photograph the front of your document.",
          aside: {
            body: "Place your document on a flat, dark surface. Avoid glare and make sure the text is sharp.",
            link: {
              label: "Tips for a clear photo",
              tip: {
                title: "Tips for a clear photo",
                body: [
                  "Place your document on a flat, dark surface, this makes the edges easier to detect.",
                  "Use bright, even lighting. Avoid direct flash or glare, especially over the photo and text.",
                  "Keep all four corners in frame, with nothing covering any part of the document.",
                  "Hold your camera directly above it, not at an angle, this avoids distortion.",
                  "Make sure text is sharp and readable before capturing, especially the document number and date fields.",
                ],
              },
            },
          },
          panel: {
            kind: "capture",
            frame: "id-landscape",
            guide: "Align document within the frame",
            tips: [
              { icon: "light", label: "Good, even light" },
              { icon: "glare", label: "No glare or reflections" },
              { icon: "crop", label: "All four corners inside the frame" },
            ],
            shutter: "Capture",
            captured: {
              heading: "Is this readable?",
              retake: "Retake",
              accept: "Use this photo",
            },
            // Flip to "captured" to render the frame's second state. It is one
            // screen with two states rather than two routes — the applicant
            // does not navigate between them, the camera does. When capture is
            // real this becomes component state and the field goes away.
            state: "empty",
          },
          back: "document-type",
          next: { label: "Continue", to: "document-back" },
        },
        {
          slug: "document-back",
          title: "Capture Back",
          intro: "Photograph the back of your document.",
          aside: {
            body: "Place your document on a flat, dark surface. Avoid glare and make sure the text is sharp.",
            link: {
              label: "Tips for a clear photo",
              tip: {
                title: "Tips for a clear photo",
                body: [
                  "Place your document on a flat, dark surface, this makes the edges easier to detect.",
                  "Use bright, even lighting. Avoid direct flash or glare, especially over the photo and text.",
                  "Keep all four corners in frame, with nothing covering any part of the document.",
                  "Hold your camera directly above it, not at an angle, this avoids distortion.",
                  "Make sure text is sharp and readable before capturing, especially the document number and date fields.",
                ],
              },
            },
          },
          panel: {
            kind: "capture",
            frame: "id-landscape",
            guide: "Align document within the frame",
            tips: [
              { icon: "light", label: "Good, even light" },
              { icon: "glare", label: "No glare or reflections" },
              { icon: "crop", label: "Barcode fully inside the frame" },
            ],
            shutter: "Capture",
            captured: {
              heading: "Is this readable?",
              retake: "Retake",
              accept: "Use this photo",
            },
            state: "empty",
          },
          back: "document-front",
          next: { label: "Continue", to: "document-review" },
        },
        {
          slug: "document-review",
          // Desktop-7: portrait + signature crops, then Full name / DOB /
          // Document number / Expiry, MRZ line, Document Type. All SPECIMEN —
          // the frame's real-looking values ("Mark Grayson", a live MRZ) are
          // deliberately NOT reproduced (org no-PII rule; see this file header).
          title: "Confirm Details",
          intro: "Check these match your ID exactly.",
          aside: {
            body: "We read these fields from your document. Correct anything that doesn't match before continuing.",
          },
          panel: {
            kind: "review",
            note: "Sample values. These fields are filled by the extraction engine at run time.",
            crops: [
              { label: "Portrait Photo Extracted", image: "/samples/selfie-sample.jpg" },
              { label: "Signature" },
            ],
            fields: [
              { key: "fullName", label: "Full name", kind: "text", value: "SPECIMEN SAMPLE", span: "half" },
              { key: "dateOfBirth", label: "Date of birth", kind: "date", value: "1990-01-01", span: "half" },
              {
                key: "documentNumber",
                label: "Document number",
                kind: "text",
                value: "SPEC00000",
                readOnly: true,
                span: "half",
              },
              { key: "expiry", label: "Expiry", kind: "date", value: "2031-12-31", span: "half" },
              {
                key: "mrz",
                label: "MRZ Lines",
                kind: "text",
                // ICAO-style specimen: fictional country UTO, name SPECIMEN SAMPLE.
                value:
                  "P<UTOSPECIMEN<<SAMPLE<<<<<<<<<<<<<<<<<<<<<<<SP000000<0UTO9001014M3112319<<<<<<<<<<<<<<02",
                mono: true,
                readOnly: true,
                span: "full",
              },
              {
                key: "documentType",
                label: "Document Type",
                kind: "select",
                value: "National ID",
                span: "half",
                options: [
                  { value: "National ID", label: "National ID" },
                  { value: "Passport", label: "Passport" },
                  { value: "Driver's licence", label: "Driver's licence" },
                  { value: "Residence permit", label: "Residence permit" },
                ],
              },
            ],
          },
          back: "document-back",
          next: { label: "Continue", to: "document-face" },
        },
        {
          slug: "document-face",
          // Still inside the Document step: a passive selfie matched 1:1 against
          // the portrait read from the document, so the person holding the phone
          // is the person on the ID before any liveness or chip checks. The
          // client component (document-face-step) drives the camera and match;
          // this panel is a placeholder for the static shell.
          title: "Match Your Face",
          intro: "Take a quick selfie so we can match it to your document photo.",
          aside: {
            body: "We compare your selfie to the photo on the document you just added, to confirm the ID belongs to you. Look straight at the camera in good light, no movement needed.",
          },
          panel: { kind: "illustration", icon: "selfie" },
          back: "document-review",
          next: { label: "Continue", to: "epassport" },
        },
      ],
    },

    /* ---- 3 · ePassport -------------------------------------------------- */
    {
      id: "epassport",
      title: "ePassport Authentication",
      caption: "Prove your passport chip is genuine",
      optional: true,
      screens: [
        {
          slug: "epassport",
          // Desktop-8: QR + "Waiting for phone…", left explainer + "What is an
          // ePassport chip?" — the updated frame drops the numbered how-to.
          title: "ePassport Authentication",
          intro: "Scan the QR with your phone, or continue here.",
          aside: {
            body: "Reading the NFC chip inside your passport cryptographically proves the document is genuine. This step is optional but makes approval faster.",
            link: {
              label: "What is an ePassport chip?",
              tip: {
                title: "What is an ePassport chip?",
                body: [
                  "Many modern passports and ID cards have a small chip embedded in the cover or page, marked with a small gold square symbol. It holds a digitally signed copy of your details and photo, signed by the government that issued your document, so it can't be altered without detection.",
                  "Scanning it with your phone's NFC lets us verify that signature directly, which is the strongest way to confirm your document is genuine rather than a copy, edit, or fake. It's optional, if your device can't scan it, you can continue on the web instead.",
                ],
              },
            },
          },
          panel: {
            kind: "handoff",
            // The design's own QR render (pine dots + lime VeriSec badge),
            // exported from Desktop-8. Encodes the handoff link.
            qr: "/qr/qr-epassport.png",
            status: "Waiting for phone…",
          },
          back: "document-review",
          next: { label: "Continue", to: "face-intro" },
          skip: { label: "Skip this step", to: "face-intro" },
        },
      ],
    },

    /* ---- 4 · Face ------------------------------------------------------- */
    {
      id: "face",
      title: "Face Verification",
      caption: "Take a live selfie",
      screens: [
        {
          slug: "face-intro",
          // Desktop-9: left explainer + a large face-scan illustration, "Start".
          title: "Face Verification",
          intro: "Next we'll take a live selfie.",
          aside: {
            body: "Your selfie is matched against the portrait on your document, and checked for liveness so a photo of a photo can't pass.",
            notice: {
              title: "How we handle your selfie",
              points: [
                "Used only to confirm you are the person on your document, and that you are really here.",
                "Never used for anything else. Never sold, and never used for advertising or profiling.",
                "Encrypted in transit and at rest, and seen only by people who need it to review your check.",
                "Deleted when the retention period required by law ends. You can ask for earlier deletion where the law allows.",
              ],
              links: [
                { label: "Privacy Policy", href: "/privacy/" },
                { label: "Biometric data", href: "/privacy/#biometric-data" },
                { label: "Terms of Service", href: "/terms/" },
              ],
            },
          },
          panel: { kind: "illustration", icon: "selfie" },
          back: "epassport",
          next: { label: "Start", to: "selfie" },
        },
        {
          slug: "selfie",
          title: "Take a Liveness Test",
          intro: "A quick camera check to confirm you're really here.",
          aside: {
            body: "Face a window or a light source, remove hats and sunglasses, and keep your whole face inside the oval.",
            link: {
              label: "Lighting & positioning tips",
              tip: {
                title: "Lighting & positioning tips",
                body: [
                  "Face a light source, natural daylight or a lamp in front of you works best. Avoid strong light or windows behind you, which can shadow your face.",
                  "Remove glasses, hats, or anything covering your face.",
                  "Center your face in the oval and look straight at the camera.",
                  "Hold your device at eye level, about an arm's length away.",
                  "Keep still for a couple of seconds while we confirm it's really you.",
                ],
              },
            },
          },
          panel: {
            kind: "capture",
            frame: "face",
            guide: "Keep your whole face inside the oval",
            tips: [
              { icon: "light", label: "Even lighting on your face" },
              { icon: "selfie", label: "Look straight ahead" },
              { icon: "crop", label: "Whole face inside the oval" },
            ],
            shutter: "Capture",
            captured: { heading: "Happy with this?", retake: "Retake", accept: "Use this photo" },
            // Shown captured so the frame reads like Desktop-77 — a public
            // sample selfie under a SAMPLE ribbon, not an empty oval.
            state: "captured",
          },
          back: "face-intro",
          next: { label: "Continue", to: "phone" },
        },
      ],
    },

    /* ---- 5 · Contact Verification --------------------------------------- */
    {
      id: "contact",
      // The frames name this step three ways — "Phone Verification", "Contact
      // Verification" and "Phone & Email Verification". The rail is the surface
      // an applicant reads on every screen, so its wording is the one kept.
      title: "Phone & Email Verification",
      caption: "Confirm your phone number",
      screens: [
        {
          slug: "phone",
          // Desktop-12: country-code selector + number, left explainer, "Send Code".
          title: "Verify Your Phone",
          intro: "We'll send a 6-digit code.",
          aside: {
            body: "A verified phone number helps us reach you and reduces the risk of account takeover.",
          },
          panel: {
            kind: "contact",
            field: {
              key: "phone",
              label: "Mobile number",
              kind: "tel",
              placeholder: "82 555 0142",
              required: true,
            },
            countryCode: {
              value: "+27 ZA",
              options: ["+27 ZA", "+234 NG", "+254 KE", "+233 GH", "+250 RW", "+20 EG", "+44 GB", "+1 US"],
            },
          },
          back: "selfie",
          next: { label: "Send Code", to: "phone-code" },
        },
        {
          slug: "phone-code",
          title: "Enter Phone Code",
          intro: "Check your messages for the 6-digit code.",
          panel: {
            kind: "otp",
            length: 6,
            // The frame's number. +27 82 555 xxxx sits in the 555 range that
            // exists precisely so a printed example cannot reach a real person.
            sentTo: "+27 82 555 0142",
            expiresIn: "10 minutes",
            resend: "Resend code",
          },
          back: "phone",
          next: { label: "Confirm", to: "email" },
        },
        {
          slug: "email",
          // Desktop-19: left explainer + "Why do we verify email?", "Send Code".
          title: "Verify Your Email",
          intro: "We'll send a 6-digit code to your inbox.",
          aside: {
            body: "We also verify your email to help confirm your identity and keep your account secure.",
            link: {
              label: "Why do we verify email?",
              tip: {
                title: "Why do we verify email?",
                kind: "paragraphs",
                body: [
                  "Confirming your email helps us make sure the person completing this verification is who they say they are, it's one more signal alongside your document and selfie. It also means we can reach you if anything needs your attention, like a request to redo a step. We only use it for this verification and account security, never for marketing.",
                ],
              },
            },
          },
          panel: {
            kind: "contact",
            field: {
              key: "email",
              label: "Email",
              kind: "email",
              placeholder: "Enter your email",
              required: true,
            },
          },
          back: "phone-code",
          next: { label: "Send Code", to: "email-code" },
        },
        {
          slug: "email-code",
          title: "Enter Email Code",
          intro: "Check your inbox for the 6-digit code.",
          panel: {
            kind: "otp",
            length: 6,
            // The frame writes a gmail.com address. Changed, and only this:
            // gmail.com is a live host, so a designed example there is an
            // address that resolves to somebody. RFC 2606 reserves example.com
            // for exactly this and nothing else about the screen moves.
            sentTo: "amara.okafor@example.com",
            expiresIn: "10 minutes",
            resend: "Resend code",
          },
          back: "email",
          next: { label: "Confirm", to: "checking" },
        },
        {
          // The loader between the codes and the report: every check runs here,
          // then the flow moves on to "findings" by itself.
          slug: "checking",
          title: "Validating Your Details",
          intro: "This only takes a few seconds.",
          aside: {
            body: "We confirm your phone and email, check your identity against global sanctions and watchlists as the law requires, and review the connection you are using. Nothing here needs any action from you.",
          },
          panel: { kind: "illustration", icon: "shield" },
          back: "email-code",
          next: { label: "Continue", to: "findings" },
        },
        {
          slug: "findings",
          // Desktop-21: the rich phone/email intelligence report. Demo analytics
          // (scores, technical metadata) — no PII. Metric values are pass-state
          // stand-ins consistent with the LOW/PASS decision.
          title: "Here's What We Found",
          intro: "A quick summary of your phone and email checks.",
          aside: {
            body: "We checked your phone and email against a few signals to help confirm it's really you. Nothing here requires action, just review and continue.",
          },
          panel: {
            kind: "findings",
            intro: "A quick summary of your phone and email checks.",
            signalIds: FINDINGS_SO_FAR,
            report: {
              scores: [
                { label: "Phone risk", value: "12/100" },
                { label: "Email risk", value: "8/100" },
                { label: "Identity score", value: "91/100" },
              ],
              riskLevel: "LOW",
              decision: "PASS",
              reasonCodes: [
                "PHONE_OTP_VERIFIED",
                "EMAIL_DELIVERABLE",
                "NO_RECENT_SIM_SWAP",
                "IDENTITY_CONSISTENT",
              ],
              channels: [
                {
                  title: "Phone",
                  otp: [
                    { label: "Result", value: "Verified" },
                    { label: "Method", value: "SMS" },
                    { label: "Timestamp", value: "2026-07-14 18:10" },
                    { label: "Attempts", value: "1" },
                  ],
                  metrics: [
                    { label: "Number validity", value: "Valid" },
                    { label: "Line intelligence", value: "Mobile" },
                    { label: "SIM risk", value: "No recent swap" },
                    { label: "Reputation", value: "Clean" },
                    { label: "Identity match", value: "Match" },
                  ],
                },
                {
                  title: "Email",
                  otp: [
                    { label: "Result", value: "Verified" },
                    { label: "Timestamp", value: "2026-07-14 18:10" },
                    { label: "Attempts", value: "1" },
                  ],
                  metrics: [
                    { label: "Deliverability", value: "Deliverable" },
                    { label: "Email type", value: "Personal" },
                    { label: "Reputation", value: "Clean" },
                    { label: "Digital footprint", value: "Established" },
                    { label: "Identity match", value: "Match" },
                  ],
                },
              ],
              consistency: {
                title: "Cross-channel consistency",
                pairs: [
                  { left: "Document", right: "Phone country" },
                  { left: "Document", right: "Email name" },
                  { left: "Phone", right: "IP country" },
                  { left: "Declared", right: "Doc country" },
                  { left: "Email", right: "IP region" },
                ],
              },
              velocity: {
                title: "Velocity & duplicates",
                rows: [
                  { label: "Same phone across accounts", value: "1" },
                  { label: "Same email across accounts", value: "1" },
                  { label: "Device fingerprint reuse", value: "0" },
                  { label: "OTP retries in last hour", value: "2" },
                  { label: "Sessions from this IP (24h)", value: "1" },
                ],
              },
              explain: {
                decision: "PASS",
                risk: "LOW risk",
                summary:
                  "Approved, phone and email both verified, no SIM-swap or duplicate signals detected.",
                codes: [
                  "PHONE OTP VERIFIED",
                  "EMAIL DELIVERABLE",
                  "NO RECENT SIM SWAP",
                  "IDENTITY CONSISTENT",
                ],
              },
            },
          },
          back: "email",
          next: { label: "Continue", to: "address-upload" },
        },
      ],
    },

    /* ---- 6 · Proof of Address ------------------------------------------- */
    {
      id: "address",
      title: "Proof of Address",
      caption: "Verify your address",
      optional: true,
      screens: [
        {
          slug: "address-upload",
          title: "Proof of Address",
          intro: "Upload a recent utility bill, or type your address.",
          panel: {
            kind: "upload",
            accept: ["PDF", "JPG", "PNG", "WEBP"],
            maxMb: 10,
            guidance:
              "We accept utility bills, bank statements or municipal letters issued in the last 3 months.",
            dropzone: { label: "Tap to upload" },
            manual: {
              label: "Or type your address",
              placeholder: "Or type : 12 Long Street, Cape Town",
            },
            samples: {
              trigger: "View Samples",
              title: "Proof of Address Sample Documents",
              close: "Close",
              // Drawn, not photographed. See the `Specimen` note in types.ts for
              // why the frame's placeholder scan is not reproduced.
              specimen: {
                watermark: "SPECIMEN",
                issuer: "Anytown Power & Water",
                issuerMeta: "PO Box 1 · Anytown · Customer care 0800 000 000",
                title: "Statement of account",
                fields: [
                  {
                    label: "Account holder",
                    value: "SPECIMEN SAMPLE",
                    highlight: "Your full name, spelled as on your ID.",
                  },
                  {
                    label: "Service address",
                    value: ["12 Long Street", "Anytown", "AT1 0AA"],
                    highlight: "The address you are verifying, in full.",
                  },
                  {
                    label: "Statement date",
                    value: "4 August 2026",
                    highlight: "Dated within the last three months.",
                  },
                  { label: "Account number", value: "•••• •••• 4821" },
                  { label: "Billing period", value: "1 Jul 2026, 31 Jul 2026" },
                  { label: "Amount due", value: "R 412.60" },
                ],
                footnote:
                  "A photograph of the page is fine. Make sure all four corners are visible and nothing is covered.",
              },
            },
          },
          back: "findings",
          next: { label: "Continue", to: "address-confirm" },
          skip: { label: "Skip this step", to: "result" },
        },
        {
          slug: "address-confirm",
          // Desktop-15: Street / City / Postal code / Country in a 2x2 grid,
          // left explainer. Values are the frame's specimen address (no person).
          title: "Confirm Your Address",
          intro: "Make sure this is where you live.",
          aside: {
            body: "Check the address below and correct anything that looks wrong.",
          },
          panel: {
            kind: "address",
            fields: [
              { key: "street", label: "Street", kind: "text", value: "12 Long Street", span: "half" },
              {
                key: "city",
                label: "City",
                kind: "select",
                value: "Cape Town",
                span: "half",
                options: [
                  { value: "Cape Town", label: "Cape Town" },
                  { value: "Johannesburg", label: "Johannesburg" },
                  { value: "Durban", label: "Durban" },
                  { value: "Pretoria", label: "Pretoria" },
                ],
              },
              { key: "postcode", label: "Postal code", kind: "text", value: "8001", span: "half" },
              {
                key: "country",
                label: "Country",
                kind: "country",
                value: "ZA",
                span: "half",
                options: [
                  { value: "ZA", label: "South Africa" },
                  { value: "NG", label: "Nigeria" },
                  { value: "KE", label: "Kenya" },
                  { value: "GH", label: "Ghana" },
                  { value: "RW", label: "Rwanda" },
                ],
              },
            ],
          },
          back: "address-upload",
          next: { label: "Continue", to: "result" },
        },
      ],
    },

    /* ---- 7 · Result ----------------------------------------------------- */
    {
      id: "result",
      title: "Result",
      caption: "Your verification outcome",
      screens: [
        {
          slug: "result",
          // Only a fallback for a metadata title — the rendered heading comes
          // from `outcomes` below, chosen by the verdict.
          title: "Your verification result",
          // The frame's subtitle for the verified case. The demo always
          // decides "Verified", so this is the line that renders.
          intro: "Here is the outcome of your verification.",
          // The operator note the frame runs down the left column — this flow
          // is being walked by the tenant who owns it, not the applicant.
          aside: {
            body: "{org} receives this result. You can close this window when you are done.",
          },
          panel: {
            kind: "result",
            // The frame draws the verified case. The other two are written here
            // rather than left to a fallback, because the screen an applicant
            // remembers is the one that turned them down, and "Declined" with
            // no explanation and no route forward is the worst screen a product
            // like this can ship. Each says what happened and what to do next.
            outcomes: {
              Verified: {
                title: "You're Verified",
                heading: "Everything checked out",
                body: "{org} has been notified and your account will be enabled shortly.",
                nextSteps: [
                  "{org} will enable your account, nothing else is needed from you.",
                  "You can close this window when you are done.",
                ],
              },
              "Needs review": {
                title: "We need a closer look",
                heading: "Almost there",
                body: "Most of your checks passed, but one needs a person to look at it. Someone at {org} will review it and come back to you.",
                nextSteps: [
                  "A reviewer usually looks within one working day.",
                  "{org} will contact you, you don't need to start again.",
                  "If anything else is needed, {org} will let you know.",
                ],
              },
              Declined: {
                title: "We couldn't verify you",
                heading: "This check didn't complete",
                body: "One or more checks didn't pass, so we can't confirm your identity from what was submitted. This isn't always final, a poor photograph is the most common cause.",
                nextSteps: [
                  "Contact {org} if you think this is wrong.",
                  "They can send you a fresh link to try again.",
                ],
              },
            },
            // The frame makes the Trust Seal the focus of this screen but
            // ships no artwork, so the view draws the product's own seal from
            // these fields. The reference is a specimen — never a real ID.
            seal: {
              title: "Verified by VeriSec",
              detail: "Trust Seal",
              issuer: "VeriSec Labs",
              reference: "VS-7F3A-2K9D",
              issued: "2026-07-14",
            },
          },
          back: "address-confirm",
          // The flow ends here: the Done button clears this device and asks the
          // browser to close the tab; a browser that refuses shows a short line
          // saying it is safe to close (see DoneButton).
          next: { label: "Done", to: null, close: true },
        },
      ],
    },
  ],
};
