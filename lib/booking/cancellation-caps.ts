// Single source of truth for the makeup-credit cap numbers — shared by
// the server-side enforcement in cancel-session.ts and the client-side
// "here's what's remaining" preview shown in both cancel confirmation
// dialogs (student's own, and admin's "regular cancel"). Split into its
// own file (rather than exported from cancel-session.ts directly)
// because that file imports the server-only Supabase client, which
// can't be pulled into a "use client" component's bundle.
export const MONTHLY_CAP = 1;
export const YEARLY_CAP = 6;
