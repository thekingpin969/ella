import { google } from "googleapis";
import { oauth2Client } from "./auth";

export const drive = google.drive({ version: "v3", auth: oauth2Client });
