/**
 * The demo dataset for Team — Figma Desktop-24, its Invite dialog and its three
 * confirm dialogs (Delete / Activate / Deactivate User).
 *
 * ALL OF IT IS ILLUSTRATIVE. The six people below do not exist.
 *
 * FIVE DEPARTURES FROM THE FRAMES. The first is a privacy rule; the other four
 * are copy the frames got wrong in ways that would reach a user:
 *
 *   · EMAILS ARE RFC 2606. The frames use `@acmefintech.co` — a registrable
 *     domain, so every address on the screen could belong to a real person. And
 *     the frames are inconsistent about it anyway: the topbar org is "Mark
 *     Fintech" while the team is at Acme. `example.com` is reserved and cannot
 *     route.
 *   · NO PHOTOGRAPHS. The frames fill the avatar column with stock faces.
 *     Attaching a real person's face to an invented employee is the same
 *     objection the dashboard's activity list already answers with initials on
 *     pine, so this does the same.
 *   · "ACTIVATE USER" IS REWRITTEN. Desktop's activate dialog reads "Request
 *     for leave approved!" — copy from a leave-management product that was
 *     pasted in and never replaced. Shipping it would confirm an action nobody
 *     took, in a product that has no leave requests.
 *   · "DEACTIVATE USER" NAMES THE MEMBER. The frame hard-codes "Jane Smith",
 *     who is not one of the six rows. A confirm dialog exists to say which
 *     record is about to change; naming the wrong person is worse than naming
 *     nobody. The copy carries `{name}` and the view substitutes the row.
 *   · THE INVITE DIALOG'S SECOND FIELD IS LABELLED "Role". The frame labels it
 *     "Environment" — pasted from the Add webhook endpoint dialog — while the
 *     control under it is plainly a role picker showing "Viewer".
 *
 * ONE MORE THING THE FRAME DRAWS THAT THE VIEW DOES NOT: the actions menu is
 * the same five items on every row, including "Deactivate" on a member who has
 * only been invited and "Activate" nowhere. The list is filtered per member —
 * see `actionsFor()` in the view.
 */

import type { TeamData, TeamMember } from "./types";

const MEMBERS: TeamMember[] = [
  {
    id: "m-naledi",
    name: "Naledi Mokoena",
    initials: "NM",
    email: "naledi@example.com",
    role: "Owner",
    status: "active",
    lastActive: "2 min ago",
  },
  {
    id: "m-ethan",
    name: "Ethan Park",
    initials: "EP",
    email: "ethan@example.com",
    role: "Admin",
    status: "active",
    lastActive: "18 min ago",
  },
  {
    id: "m-priya",
    name: "Priya Naidoo",
    initials: "PN",
    email: "priya@example.com",
    role: "Developer",
    status: "active",
    lastActive: "1 hr ago",
  },
  {
    id: "m-marcus",
    name: "Marcus Okonkwo",
    initials: "MO",
    email: "marcus@example.com",
    role: "Reviewer",
    status: "active",
    lastActive: "3 hr ago",
  },
  {
    id: "m-zola",
    name: "Zola Nkosi",
    initials: "ZN",
    email: "zola@example.com",
    role: "Billing",
    // Deactivated, where the frame draws active. The frame contradicts itself:
    // it puts "Activate" in every row's menu while showing nobody who could be
    // activated, so that dialog — and the "Deactivated" status chip — were
    // built but unreachable. One member in the state makes both reviewable, and
    // a team of four active / one deactivated / one invited is what a real one
    // looks like anyway.
    status: "deactivated",
    lastActive: "Yesterday",
  },
  {
    id: "m-david",
    name: "David Chen",
    initials: "DC",
    email: "david@example.com",
    role: "Viewer",
    status: "invited",
    lastActive: null,
  },
];

export const DEMO_TEAM: TeamData = {
  title: "Team",
  inviteLabel: "Invite Member",

  columns: [
    { key: "name", header: "Name", width: 235 },
    { key: "email", header: "Email", width: 240 },
    { key: "role", header: "Role", width: 150 },
    { key: "status", header: "Status", width: 120 },
    { key: "lastActive", header: "Last active", width: 150 },
    { key: "actions", header: "Actions", width: 90, align: "right" },
  ],

  members: MEMBERS,
  neverActiveLabel: "-",

  actionsLabel: "Actions",
  actions: [
    { id: "view", label: "View" },
    { id: "role", label: "Change Role" },
    { id: "permissions", label: "Edit permissions" },
    { id: "deactivate", label: "Deactivate" },
    { id: "activate", label: "Activate" },
    { id: "edit", label: "Edit" },
    { id: "delete", label: "Delete" },
    { id: "resend", label: "Resend invitation" },
    { id: "transfer", label: "Transfer ownership" },
  ],

  confirm: {
    delete: {
      title: "Delete User",
      body: "Are you sure you want to delete {name}? This action cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "destructive",
      illustration: { src: "/illustrations/confirm-delete.webp", width: 342, height: 400 },
    },
    activate: {
      title: "Activate User",
      // Rewritten — see the header. The frame's copy came from another product.
      body: "Reactivate {name}? They will be able to sign in and use the console again.",
      confirmLabel: "Activate",
      cancelLabel: "Cancel",
      tone: "affirm",
      illustration: { src: "/illustrations/confirm-activate.webp", width: 391, height: 400 },
    },
    deactivate: {
      title: "Deactivate User",
      body: "Are you sure you want to deactivate {name}? This will prevent them from accessing the system.",
      confirmLabel: "Deactivate",
      cancelLabel: "Cancel",
      tone: "warn",
      // the frame's own amber artwork (Figma "Deactivate User", exported 2026-10-09)
      illustration: { src: "/illustrations/confirm-deactivate.webp", width: 300, height: 307 },
    },
    transfer: {
      title: "Transfer ownership",
      body: "Make {name} the Owner of this organisation? You become an Admin. Only the Owner can hand ownership on or close the account.",
      confirmLabel: "Transfer",
      cancelLabel: "Cancel",
      tone: "warn",
    },
  },

  invite: {
    title: "Invite team member",
    emailLabel: "Email",
    emailPlaceholder: "Enter email",
    roleLabel: "Role",
    roles: ["Viewer", "Reviewer", "Developer", "Billing", "Admin"],
    submitLabel: "Add",
    closeLabel: "Close",
  },

  pagination: {
    rowsLabel: "10 rows",
    rowsOptions: ["10 rows", "25 rows", "50 rows"],
    pages: [1, 2, 3, null, 8, 9, 10],
    current: 1,
    previousLabel: "Previous",
    nextLabel: "Next",
  },
};
