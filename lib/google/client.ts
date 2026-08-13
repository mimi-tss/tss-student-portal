import { google } from "googleapis";

// Authenticates as the single Workspace admin account (info@tarasimonstudios.com)
// via a service account with domain-wide delegation, impersonating the admin
// to read/write Calendar events and Drive files/folders.
// See TSS_App_Spec_1.md section 1 (Google Workspace setup).
export function getGoogleAuth(scopes: string[]) {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes,
    subject: process.env.GOOGLE_ADMIN_EMAIL, // info@tarasimonstudios.com
  });
}

export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"];
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];
