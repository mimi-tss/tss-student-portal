import { google } from "googleapis";

// Authenticates as a Workspace admin account via a service account with
// domain-wide delegation, impersonating that admin to read/write
// Calendar events and Drive files/folders. Defaults to GOOGLE_ADMIN_EMAIL
// (the account this app impersonates everywhere else); `subject` lets a
// caller impersonate a DIFFERENT Workspace user instead — see
// listMeetRecordingsInbox in ./drive, which also scans as
// GOOGLE_RECORDINGS_SCAN_EXTRA_EMAILS. Confirmed live that Google Meet's
// own newly-created recording folders are owned by whichever account
// organized that meeting, which isn't always the one GOOGLE_ADMIN_EMAIL
// impersonates — that account only sees a folder once someone shares it
// with it by hand, which is exactly the kind of one-off manual step this
// app tries not to depend on. See TSS_App_Spec_1.md section 1 (Google
// Workspace setup).
export function getGoogleAuth(scopes: string[], subject: string = process.env.GOOGLE_ADMIN_EMAIL!) {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes,
    subject,
  });
}

export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"];
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];
