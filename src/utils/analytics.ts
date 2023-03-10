import { createCipheriv, createHash } from "crypto";
import { APIResponse, DeviceLeaderboard, DiagData } from "../types/api";
import { DeviceInformation } from "../types/api";

export const API_URL = typeof location != 'undefined' && ['localhost', 'dev.puff.social'].includes(location.hostname) ? (location.hostname == 'dev.puff.social' ? 'https://kief.puff.social' : 'http://127.0.0.1:8000') : 'https://hash.puff.social';

function signRequest<T>(body: T): [string, string] {
  const signature = createHash('sha256').update(JSON.stringify(body)).digest('base64');
  const key = Buffer.from(process.env.NEXT_PUBLIC_METRICS_KEY);
  const iv = Buffer.alloc(16, 0);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let enc = cipher.update(JSON.stringify(body), 'utf-8', 'base64');
  enc += cipher.final('base64');

  return [signature, enc];
}

export async function sendFeedback(content: string) {
  const [signature, body] = signRequest({ message: content });
  await fetch(`${API_URL}/v1/feedback`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-signature': signature }, body });
}

export async function getLeaderboard() {
  return await fetch(`${API_URL}/v1/leaderboard`).then(r => r.json()) as APIResponse<{ leaderboards: DeviceLeaderboard[] }>;
}

export async function trackDevice(device: Partial<DeviceInformation>, name: string) {
  const [signature, body] = signRequest({ device, name });
  fetch(`${API_URL}/v1/track`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-signature': signature }, body });
}

export async function trackDiags(data: DiagData) {
  const [signature, body] = signRequest(data);
  fetch(`${API_URL}/v1/diag`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-signature': signature }, body });
}