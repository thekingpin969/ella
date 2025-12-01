import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { OAuth2Client, Credentials } from "google-auth-library";

const TOKEN_PATH = "../../../token.json";

export const oauth2Client: OAuth2Client = new google.auth.OAuth2(
  process.env.DRIVE_API_KEY,
  process.env.DRIVE_API_SRT,
  "http://localhost:3000/oauth2callback",
);

// Initialize auth
export async function getAuth(token: any = null): Promise<OAuth2Client> {
  if (token || existsSync(TOKEN_PATH)) {
    const driveToken = token ? token : JSON.parse(readFileSync(TOKEN_PATH, "utf-8")) as Credentials;
    oauth2Client.setCredentials(driveToken);
    return oauth2Client;
  }
  throw new Error("Run authorize() first");
}

// One-time authorization
export async function authorize(): Promise<OAuth2Client> {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive"],
  });

  console.log("Visit this URL:", authUrl);

  return new Promise((resolve, reject) => {
    const server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        if (req.url?.startsWith("/oauth2callback")) {
          const code = new URL(
            req.url,
            "http://localhost:3000",
          ).searchParams.get("code");
          if (code) {
            try {
              const { tokens } = await oauth2Client.getToken(code);
              oauth2Client.setCredentials(tokens);
              writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

              res.end("Authorization successful! You can close this window.");
              server.close();
              resolve(oauth2Client);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error("No authorization code received."));
          }
        }
      },
    ).listen(3000);
  });
}
