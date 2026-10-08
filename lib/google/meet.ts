import { getGoogleAuth } from "./client";

const MEET_SCOPES = ["https://www.googleapis.com/auth/meetings.space.readonly"];
const MAX_CONFERENCE_PAGES = 5;

async function meetGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://meet.googleapis.com/v2/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Meet API ${res.status} on ${path.split("?")[0]}`);
  return (await res.json()) as T;
}

interface ConferenceRecord {
  name: string;
}
interface MeetRecording {
  state?: string;
  startTime?: string;
  endTime?: string;
  driveDestination?: { file?: string };
}

export interface MeetRecordingTimes {
  fileId: string;
  start: string;
  end: string;
}

// Every finished recording (with its real start/end) for meetings that
// started on/after `cutoffIso`, as seen by `subject`. Shared by the id
// listing below and the recording-time sync used for matching.
async function listMeetApiRecordings(subject: string, cutoffIso: string): Promise<MeetRecordingTimes[]> {
  const auth = getGoogleAuth(MEET_SCOPES, subject);
  const token = (await auth.getAccessToken()).token;
  if (!token) throw new Error("Meet API: no access token");

  const filter = encodeURIComponent(`start_time>="${cutoffIso}"`);
  const conferences: ConferenceRecord[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_CONFERENCE_PAGES; page++) {
    const res = await meetGet<{ conferenceRecords?: ConferenceRecord[]; nextPageToken?: string }>(
      token,
      `conferenceRecords?pageSize=100&filter=${filter}${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    conferences.push(...(res.conferenceRecords ?? []));
    if (!res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }

  const perConference = await Promise.all(
    conferences.map((c) => meetGet<{ recordings?: MeetRecording[] }>(token, `${c.name}/recordings`)),
  );

  const out: MeetRecordingTimes[] = [];
  for (const { recordings } of perConference) {
    for (const rec of recordings ?? []) {
      const file = rec.driveDestination?.file;
      if (rec.state === "FILE_GENERATED" && file && rec.startTime && rec.endTime) {
        out.push({ fileId: file.replace(/^files\//, ""), start: rec.startTime, end: rec.endTime });
      }
    }
  }
  return out;
}

// Real recording start/end by Drive file id, merged across identities.
export async function getMeetRecordingTimes(subjects: string[], cutoffIso: string): Promise<Map<string, MeetRecordingTimes>> {
  const byFile = new Map<string, MeetRecordingTimes>();
  const results = await Promise.allSettled(subjects.map((s) => listMeetApiRecordings(s, cutoffIso)));
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const t of r.value) byFile.set(t.fileId, t);
  }
  return byFile;
}

// Drive file ids of every Meet recording that has finished generating
// for a meeting that started on/after `cutoffIso`, as seen by `subject`.
// Meet itself reports each recording the moment its file exists, with
// the Drive file id attached — so this finds a recording without
// crawling Drive folders (which Google has restructured three times
// since 2026-09-10, silently breaking the folder scan each time).
// Needs the meetings.space.readonly scope on the service account's
// domain-wide delegation (Workspace admin console).
export async function listMeetApiRecordingFileIds(subject: string, cutoffIso: string): Promise<string[]> {
  return [...new Set((await listMeetApiRecordings(subject, cutoffIso)).map((r) => r.fileId))];
}
