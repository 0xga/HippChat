// Mock S3 implementation for demo purposes
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutBucketPolicyCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface S3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function makeS3Client(config: S3Config): any {

  return new S3Client({
    region: "auto",
    endpoint: config.endpoint, // Hippius S3/S4 URL
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });  
}

// S4 append is handled via metadata inside appendInboxLine; no client toggle needed

export interface UserProfile {
  v: number;
  address: string;
  pk: string;
  displayName: string;
  avatarKey?: string;
  avatarUrl?: string;
  about?: string;
  updatedAt: string;
}

export interface Message {
  v: number;
  msg_id: string;
  ts: string;
  from: string;
  to: string;
  nonce: string;
  ciphertext: string;
  media?: string | null;
  meta: {
    t: string; // message type: 'text', 'image', etc.
  };
}

async function setBucketPublicRead(
  s3: S3Client,
  bucket: string,
): Promise<void> {
  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  } as const;

  try {
    await s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(policy) }));
    console.log(`\u2713 Bucket policy applied - '${bucket}' is now public`);
  } catch (err) {
    console.warn(`Failed to apply public-read policy to bucket ${bucket}:`, err);
  }
}

/**
 * Ensure user storage exists in S3
 */
export async function ensureUserStorage(
  s3: S3Client,
  bucket: string,
): Promise<void> {
  const safeBucket = (bucket || '').trim();
  console.log(`Ensuring user storage exists for ${safeBucket}`);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: safeBucket }));
    console.log(`Bucket already exists: ${safeBucket}`);
    return;
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    const code = err?.name || err?.Code;
    const notFound = status === 404 || code === 'NotFound' || code === 'NoSuchBucket';
    const isNetworkOrCors = (err?.name === 'TypeError') || (typeof err?.message === 'string' && err.message.includes('Failed to fetch'));
    if (!notFound && !isNetworkOrCors) {
      console.error(`Unexpected error checking bucket existence ${safeBucket}: ${err}`);
      throw err;
    }
  }

  try {
    await s3.send(new CreateBucketCommand({ Bucket: safeBucket }));
    console.log(`Bucket created: ${safeBucket}`);
    await setBucketPublicRead(s3, safeBucket);
  } catch (createErr: any) {
    const createCode = createErr?.name || createErr?.Code;
    if (createCode === 'BucketAlreadyOwnedByYou' || createCode === 'BucketAlreadyExists') {
      console.log(`Bucket already exists: ${safeBucket}`);
      return;
    }
    console.error(`Unexpected error creating bucket ${safeBucket}: ${createErr}`);
    throw createErr;
  }
}

/**
 * Get user profile from S3
 */
export async function getUserProfile(
  s3: S3Client,
  bucket: string,
): Promise<UserProfile | null> {
  console.log('Getting user profile from', bucket);
  const safeBucket = (bucket || '').trim();
  // List profile objects and pick the most recent one
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: safeBucket,
    Prefix: 'profile-'
  }));

  const contents = list.Contents || [];
  if (contents.length === 0) {
    return null;
  }

  const latest = contents
    .filter(o => !!o.Key)
    .sort((a, b) => {
      const at = a.LastModified ? new Date(a.LastModified).getTime() : 0;
      const bt = b.LastModified ? new Date(b.LastModified).getTime() : 0;
      return bt - at;
    })[0];

  if (!latest?.Key) {
    return null;
  }

  const obj = await s3.send(new GetObjectCommand({ Bucket: safeBucket, Key: latest.Key }));
  const body: any = obj.Body as any;
  let text: string;
  if (typeof body?.transformToString === 'function') {
    text = await body.transformToString();
  } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
    text = await body.text();
  } else {
    text = await new Response(body as ReadableStream).text();
  }

  // console.log('Latest:', latest, "text:", text);

  return JSON.parse(text) as UserProfile;
}

/**
 * Update user profile in S3
 */
export async function putUserProfile(
  s3: S3Client,
  bucket: string,
  profile: UserProfile
): Promise<void> {
  const safeBucket = (bucket || '').trim();
  const timestamp = (profile.updatedAt && new Date(profile.updatedAt).toISOString()) || new Date().toISOString();
  const key = `profile-${timestamp}.json`;
  const profileToSave: UserProfile = {
    ...profile,
    updatedAt: timestamp,
  };

  const body = JSON.stringify(profileToSave);

  await s3.send(new PutObjectCommand({
    Bucket: safeBucket,
    Key: key,
    Body: body,
    ContentType: 'application/json; charset=utf-8',
  }));
}

/**
 * Upload user avatar to S3
 */
export async function putUserAvatar(
  s3: S3Client,
  bucket: string,
  avatarBlob: Blob | Uint8Array,
  contentType: string = 'image/jpeg'
): Promise<void> {
  // Mock implementation
  console.log('Mock: Uploading avatar for', bucket);
  return Promise.resolve();
}

/**
 * Append message to inbox log (with optimistic locking fallback)
 */
export async function appendInboxLine(
  s3: S3Client,
  bucket: string,
  line: string
): Promise<void> {
  const safeBucket = (bucket || '').trim();
  const body = line.endsWith('\n') ? line : `${line}\n`;

  // Hippius S4 append to an hourly-segmented log file using optimistic version metadata
  const key = segmentKeyFor(new Date());
  let appendVersion = '0';
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: safeBucket, Key: key }));
    const md = (head.Metadata || {}) as Record<string, string>;
    appendVersion = md['append-version']
      || (head as any)?.$metadata?.httpHeaders?.['x-amz-meta-append-version']
      || '0';
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    const code = err?.name || err?.Code;
    const notFound = status === 404 || code === 'NotFound' || code === 'NoSuchKey' || code === 'NoSuchObject';
    if (!notFound) {
      throw err;
    }
    // Create empty segment object prior to first append
    await s3.send(new PutObjectCommand({
      Bucket: safeBucket,
      Key: key,
      Body: '',
      ContentType: 'application/octet-stream',
    }));
    appendVersion = '0';
  }

  const appendId = generateUuidV4();
  await s3.send(new PutObjectCommand({
    Bucket: safeBucket,
    Key: key,
    Body: body,
    ContentType: 'application/octet-stream',
    Metadata: {
      append: 'true',
      'append-if-version': String(appendVersion),
      'append-id': appendId,
    },
  }));
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function formatHourSegmentUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const h = pad2(date.getUTCHours());
  return `${y}${m}${d}${h}`; // YYYYMMDDHH
}
function segmentKeyFor(date: Date): string { return `inbox-${formatHourSegmentUTC(date)}.log`; }
function extractSegmentFromKey(key: string): string | null {
  const m = key.match(/^inbox\-(\d{10})\.log$/);
  return m ? m[1] : null;
}

function generateUuidV4(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const hex = Array.from(bytes, toHex).join('');
  return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`;
}

// Transient-error retry helpers for S3 operations
async function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
function isTransientError(err: any): boolean {
  const status = err?.$metadata?.httpStatusCode;
  const name = err?.name || err?.Code;
  const message: string = typeof err?.message === 'string' ? err.message : '';
  return (status && status >= 500) || name === 'TypeError' || message.includes('Failed to fetch') || message.includes('Service Unavailable');
}
async function withRetries<T>(fn: () => Promise<T>, label: string, maxAttempts: number = 3): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (!isTransientError(e) || attempt === maxAttempts - 1) {
        console.error(`[s3-retry] fail ${label} attempt ${attempt + 1}/${maxAttempts}:`, e);
        throw e;
      }
      const backoff = 300 * Math.pow(2, attempt);
      console.warn(`[s3-retry] transient ${label} attempt ${attempt + 1}/${maxAttempts}, backing off`, backoff, 'ms');
      await delay(backoff);
      attempt++;
    }
  }
  throw lastErr;
}

/**
 * Poll inbox for new messages
 */
export async function pollInboxTail(
  s3: S3Client,
  bucket: string,
  fromOffset: number
): Promise<{ lines: string[]; newOffset: number }> {
  const safeBucket = (bucket || '').trim();
  const since = Number.isFinite(fromOffset) ? Number(fromOffset) : 0;

  // Determine segments from since..now (inclusive)
  const start = new Date(since || 0);
  const now = new Date();
  const segments: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), start.getUTCHours(), 0, 0, 0));
  while (cursor <= now) {
    segments.push(segmentKeyFor(cursor));
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }

  // List available objects and intersect with desired segments
  const list = await withRetries(
    () => s3.send(new ListObjectsV2Command({ Bucket: safeBucket, Prefix: 'inbox-' })),
    'ListObjectsV2 inbox-'
  );
  const contents = (list.Contents || []).filter(o => !!o.Key);
  const byKey = new Map(contents.map(o => [o.Key!, o]));
  let keysToFetch = segments.filter(k => {
    const obj = byKey.get(k);
    if (!obj) return false;
    const lm = obj.LastModified ? new Date(obj.LastModified as Date).getTime() : 0;
    return lm > since; // only fetch segments modified after fromOffset
  });

  // Always attempt to fetch the current hour segment even if not listed or not newer
  const currentKey = segmentKeyFor(now);
  if (!keysToFetch.includes(currentKey)) {
    keysToFetch.push(currentKey);
  }

  // console.log('[pollInboxTail] since:', since, 'segments:', segments.length, 'listed:', contents.length, 'toFetch:', keysToFetch);

  const lines: string[] = [];
  let newOffset = since;

  for (const key of keysToFetch) {
    try {
      const res = await withRetries(
        () => s3.send(new GetObjectCommand({ Bucket: safeBucket, Key: key })),
        `GetObject ${key}`
      );
      const body: any = res.Body as any;
      let text: string;
      if (typeof body?.transformToString === 'function') {
        text = await body.transformToString();
      } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
        text = await body.text();
      } else {
        text = await new Response(body as ReadableStream).text();
      }

      for (const l of text.split('\n')) {
        const trimmed = l.trim();
        if (trimmed.length > 0) {
          lines.push(trimmed);
        }
      }

      // Prefer LastModified from GET response; fallback to listing
      const lmFromGet = (res as any)?.LastModified ? new Date((res as any).LastModified as Date).getTime() : 0;
      const obj = byKey.get(key);
      const lmFromList = obj?.LastModified ? new Date(obj.LastModified as Date).getTime() : 0;
      const lm = Math.max(lmFromGet, lmFromList, since);
      if (lm > newOffset) newOffset = lm;
      // console.log('[pollInboxTail] fetched key:', key, 'lines:', lines.length, 'newOffset:', newOffset);
    } catch (e: any) {
      const code = e?.name || e?.Code;
      const status = e?.$metadata?.httpStatusCode;
      if (code === 'NoSuchKey' || code === 'NotFound' || status === 404) {
        // Current segment might not exist yet; skip
        console.log('[pollInboxTail] key not found (ok):', key);
        continue;
      }
      console.error('[pollInboxTail] failed fetching key:', key, e);
      throw e;
    }
  }

  return { lines, newOffset };
}

/**
 * Fetch recent inbox lines up to a maximum count across hourly segments.
 * Returns lines in chronological order and an offset suitable for tail polling.
 */
export async function getInboxRecentLines(
  s3: S3Client,
  bucket: string,
  maxLines: number
): Promise<{ lines: string[]; newOffset: number }> {
  const safeBucket = (bucket || '').trim();
  // console.log('[getInboxRecentLines] bucket:', safeBucket, 'maxLines:', maxLines);
  const list = await withRetries(
    () => s3.send(new ListObjectsV2Command({ Bucket: safeBucket, Prefix: 'inbox-' })),
    'ListObjectsV2 inbox-'
  );
  const contents = (list.Contents || []).filter(o => !!o.Key);
  // console.log('[getInboxRecentLines] listed objects:', contents.length);
  if (contents.length > 0) {
    const sample = contents
      .slice(0, Math.min(10, contents.length))
      .map(o => ({ key: o.Key, lm: o.LastModified ? new Date(o.LastModified as Date).toISOString() : '0' }));
    // console.log('[getInboxRecentLines] sample keys:', sample);
  }
  if (contents.length === 0) {
    return { lines: [], newOffset: 0 };
  }

  // Sort by LastModified descending (newest first)
  const sortedDesc = contents.sort((a, b) => {
    const at = a.LastModified ? new Date(a.LastModified as Date).getTime() : 0;
    const bt = b.LastModified ? new Date(b.LastModified as Date).getTime() : 0;
    return bt - at;
  });
  // console.log('[getInboxRecentLines] sorted first key:', sortedDesc[0]?.Key, 'last key:', sortedDesc[sortedDesc.length - 1]?.Key);

  type FileChunk = { key: string; lines: string[]; lastModified: number };
  const fetched: FileChunk[] = [];
  let total = 0;
  let maxOffset = 0;

  for (const obj of sortedDesc) {
    const key = obj.Key!;
    const lm = obj.LastModified ? new Date(obj.LastModified as Date).getTime() : 0;
    // console.log('[getInboxRecentLines] fetching key:', key, 'lm:', lm ? new Date(lm).toISOString() : lm);
    let res: any;
    try {
      res = await withRetries(
        () => s3.send(new GetObjectCommand({ Bucket: safeBucket, Key: key })),
        `GetObject ${key}`
      );
    } catch (e) {
      console.error('[getInboxRecentLines] failed to fetch key (skip):', key, e);
      continue;
    }
    const body: any = res.Body as any;
    let text: string;
    if (typeof body?.transformToString === 'function') {
      text = await body.transformToString();
    } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
      text = await body.text();
    } else {
      text = await new Response(body as ReadableStream).text();
    }
    // console.log('[getInboxRecentLines] key:', key, 'text.len:', text?.length || 0);

    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    fetched.push({ key, lines, lastModified: lm });
    total += lines.length;
    if (lm > maxOffset) maxOffset = lm;
    // console.log('[getInboxRecentLines] key:', key, 'lines:', lines.length, 'runningTotal:', total);
    if (total >= maxLines) break;
  }

  if (fetched.length === 0) {
    return { lines: [], newOffset: 0 };
  }

  // Reassemble in chronological order across fetched files
  // console.log('[getInboxRecentLines] fetched files:', fetched.length, 'maxOffset:', maxOffset ? new Date(maxOffset).toISOString() : maxOffset);
  const chronological: string[] = [];
  for (let i = fetched.length - 1; i >= 0; i--) {
    chronological.push(...fetched[i].lines);
  }

  const trimmed = chronological.length > maxLines
    ? chronological.slice(chronological.length - maxLines)
    : chronological;
  // console.log('[getInboxRecentLines] chronological:', chronological.length, 'trimmed:', trimmed.length, 'returnOffset:', maxOffset ? new Date(maxOffset).toISOString() : maxOffset);
  return { lines: trimmed, newOffset: maxOffset };
}