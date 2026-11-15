/**
 * Sign in / create account content, from the Figma "Welcome" frames.
 *
 * The right-panel testimonial cards use the frames' personas (Sarah Chen,
 * Marcus Johnson) but are drawn with INITIALS avatars, not the frames' stock
 * photos of real people — a fabricated quote should not be pinned to a real
 * face. The personas are fictional, matching the landing page's testimonials.
 */

export const authPanel = {
  cards: [
    {
      id: "sarah",
      name: "Sarah Chen",
      handle: "@sarahdigital",
      initials: "SC",
      quote:
        "Amazing platform! The user experience is seamless and the features are exactly what I needed.",
    },
    {
      id: "marcus",
      name: "Marcus Johnson",
      handle: "@marcustech",
      initials: "MJ",
      quote:
        "This service has transformed how I work. Clean design, powerful features, and excellent support.",
    },
  ],
} as const;

export const signIn = {
  title: "Welcome",
  subtitle: "Access your account and continue your journey with us",
  fields: {
    email: { label: "Email Address", placeholder: "Enter your email address" },
    password: { label: "Password", placeholder: "Enter your password" },
  },
  remember: "Keep me signed in",
  reset: { label: "Reset password", href: "/reset-password" },
  submit: "Sign In",
  dividerLabel: "Or continue with",
  google: "Continue with Google",
  alt: { prefix: "New to our platform?", label: "Create Account", href: "/signup" },
  /** Where a successful sign-in lands: onboarding the first time, then straight on to the account's portal. */
  next: "/onboarding",
} as const;

export const resetPassword = {
  title: "Reset password",
  subtitle: "Enter the email for your account and we'll send you a code to set a new password.",
  fields: {
    email: { label: "Email Address", placeholder: "Enter your email address" },
  },
  submit: "Send reset code",
  /** Where the request lands once the code is sent. */
  next: "/set-new-password",
  back: { prefix: "Remembered it?", label: "Back to sign in", href: "/login" },
} as const;

export const setPassword = {
  title: "Set a new password",
  subtitle: "Enter the code we emailed you, then choose a new password.",
  fields: {
    code: { label: "Reset code", placeholder: "6-character code" },
    password: { label: "New password", placeholder: "Create a new password" },
    confirm: { label: "Confirm password", placeholder: "Re-enter your new password" },
  },
  submit: "Update password",
  resend: { prefix: "Didn't get a code?", label: "Resend it", href: "/reset-password" },
  /** A successful reset returns to sign in. */
  next: "/login",
  back: { label: "Back to sign in", href: "/login" },
} as const;

/** Accept a team invitation: the emailed link carries who was invited and a one-time code. */
export const acceptInvite = {
  title: "Join your team",
  loading: "Please wait…",
  subtitle: (orgName: string) => `You were invited to ${orgName} on VeriSec. Choose a password to finish.`,
  fields: {
    email: { label: "Email Address" },
    name: { label: "Full name", placeholder: "Enter your full name" },
    password: { label: "Password", placeholder: "Create a password" },
    confirm: { label: "Confirm password", placeholder: "Re-enter your password" },
  },
  role: "Your role",
  submit: "Join the team",
  invalid: {
    title: "This invitation can't be used",
    incomplete: "This invitation link is not complete. Open it from the email again.",
  },
  signIn: { prefix: "Already joined?", label: "Sign in", href: "/login" },
} as const;

export const mfaChallenge = {
  title: "Two-step verification",
  subtitle: "Enter the 6-digit code from your authenticator app to finish signing in.",
  field: { label: "Authentication code", placeholder: "000000" },
  submit: "Verify",
  back: { prefix: "Not you?", label: "Back to sign in", href: "/login" },
  next: "/onboarding",
} as const;

export const verifyEmail = {
  title: "Verify your email",
  subtitle: "Enter the code we sent you to confirm your email address.",
  field: { label: "Verification code", placeholder: "6-character code" },
  submit: "Verify email",
  resend: { prefix: "Didn't get it?", label: "Resend code" },
  next: "/login",
} as const;

export const signUp = {
  title: "Welcome",
  subtitle: "Access your account and continue your journey with us",
  fields: {
    first: { label: "First name", placeholder: "Your first name" },
    last: { label: "Last name", placeholder: "Your last name" },
    email: { label: "Work email", placeholder: "Enter your email address" },
    business: { label: "Business name", placeholder: "Enter your business name" },
    password: { label: "Password", placeholder: "Enter your password" },
    confirm: { label: "Confirm password", placeholder: "Type your password again" },
  },
  submit: "Create Account",
  alt: { prefix: "Have an account?", label: "Log In", href: "/login" },
  /** A new account lands on the workspace-ready screen, not the dashboard. */
  next: "/welcome",
} as const;
