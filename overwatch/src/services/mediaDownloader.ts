import { Message } from 'discord.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'];
const MAX_MEDIA_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export interface MediaItem {
  mimeType: string;
  base64: string;
}

export interface MediaMetadata {
  title?: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface ProcessedMediaResults {
  mediaItems: MediaItem[];
  metadata: { title?: string; description?: string }[];
}

/**
 * Runs a command with a timeout.
 */
async function runCommandWithTimeout(command: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const cp = exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });

    const timer = setTimeout(() => {
      cp.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    cp.on('exit', () => {
      clearTimeout(timer);
    });
  });
}

/**
 * Cleans up temporary files generated during processing.
 */
async function cleanUpTempFiles(tempId: string): Promise<void> {
  try {
    const files = await fs.readdir('/tmp');
    for (const file of files) {
      if (file.startsWith(`overwatch_media_${tempId}`) || file.startsWith(`overwatch_frame_${tempId}`)) {
        const filePath = path.join('/tmp', file);
        await fs.unlink(filePath).catch(() => {});
      }
    }
  } catch (err) {
    // Silent catch
  }
}

/**
 * Checks if the downloaded local file is HTML, XML, or JSON text.
 */
async function isLocalFileHtmlOrText(filePath: string): Promise<boolean> {
  try {
    const handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buffer, 0, 1024, 0);
    await handle.close();

    if (bytesRead === 0) return true;

    const content = buffer.toString('utf8', 0, bytesRead).trim();
    const isHtml =
      content.startsWith('<!') ||
      content.toLowerCase().startsWith('<html') ||
      content.startsWith('{') ||
      content.startsWith('[') ||
      content.toLowerCase().startsWith('<?xml') ||
      content.toLowerCase().includes('<body') ||
      content.toLowerCase().includes('<head');

    return isHtml;
  } catch (err) {
    return true; // Treat as invalid on error
  }
}

/**
 * Downloads media with yt-dlp.
 */
async function downloadWithYtDlp(url: string, tempId: string): Promise<string> {
  const outtmpl = path.join('/tmp', `overwatch_media_${tempId}.%(ext)s`);
  const command = `yt-dlp --max-filesize 15M -f "worst[height<=360]/worst" -o "${outtmpl}" "${url}"`;

  console.log(`[MediaDownloader] [${tempId}] Running yt-dlp for: ${url}`);
  await runCommandWithTimeout(command, 25000);
  const files = await fs.readdir('/tmp');
  const downloadedFile = files.find((file) => file.startsWith(`overwatch_media_${tempId}`));
  if (!downloadedFile) {
    throw new Error('Downloaded file not found on disk');
  }

  const filePath = path.join('/tmp', downloadedFile);
  const stat = await fs.stat(filePath);
  console.log(`[MediaDownloader] [${tempId}] yt-dlp download finished: ${filePath} (${stat.size} bytes)`);

  if (stat.size < 1000) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error(`Downloaded file too small (${stat.size} bytes)`);
  }

  return filePath;
}

/**
 * Fallback to download media directly via fetch.
 */
async function downloadDirectly(url: string, tempId: string): Promise<string> {
  console.log(`[MediaDownloader] [${tempId}] Running direct fetch fallback for: ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    throw new Error(`Direct download failed with HTTP status ${response.status}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  // Ensure it's not a webpage
  const isHtml =
    contentType.includes('html') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('text/plain');

  if (isHtml) {
    throw new Error(`Direct download returned non-media content type: ${contentType}`);
  }

  // Determine file extension
  let ext = 'mp4';
  if (contentType.includes('image/gif')) ext = 'gif';
  else if (contentType.includes('image/png')) ext = 'png';
  else if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) ext = 'jpg';
  else if (contentType.includes('image/webp')) ext = 'webp';

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(
    `[MediaDownloader] [${tempId}] Direct fetch download finished: ${buffer.length} bytes, content-type: ${contentType}`,
  );

  if (buffer.length > MAX_MEDIA_SIZE_BYTES) {
    throw new Error(`Direct download exceeded maximum file size limit (15MB)`);
  }
  if (buffer.length < 1000) {
    throw new Error(`Direct download file size too small (${buffer.length} bytes)`);
  }

  const filePath = path.join('/tmp', `overwatch_media_${tempId}.${ext}`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Fetches the duration of a video using ffprobe.
 */
async function getVideoDuration(videoPath: string, tempId: string): Promise<number | null> {
  const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
  try {
    const { stdout } = await runCommandWithTimeout(command, 5000);
    const duration = parseFloat(stdout.trim());
    console.log(`[MediaDownloader] [${tempId}] ffprobe duration result: ${duration} seconds`);
    return isNaN(duration) || duration <= 0 ? null : duration;
  } catch (err) {
    console.log(
      `[MediaDownloader] [${tempId}] ffprobe duration check failed: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

/**
 * Extracts frames from a video/gif using ffmpeg.
 */
async function extractFramesFromVideo(videoPath: string, tempId: string): Promise<MediaItem[]> {
  const framePattern = path.join('/tmp', `overwatch_frame_${tempId}_%03d.jpg`);

  // Get video duration to space frames evenly
  const duration = await getVideoDuration(videoPath, tempId);
  const fpsVal = duration ? 6 / duration : 0.5;

  // Extract up to 6 frames scaled to 480px width, spaced evenly
  const command = `ffmpeg -i "${videoPath}" -vf "fps=${fpsVal},scale=480:-1" -vframes 6 "${framePattern}" 2>/dev/null`;

  console.log(`[MediaDownloader] [${tempId}] Extracting frames from ${videoPath} using fps=${fpsVal}`);
  try {
    await runCommandWithTimeout(command, 15000);
    console.log(`[MediaDownloader] [${tempId}] FFmpeg command completed successfully`);
  } catch (err) {
    console.warn(
      `[MediaDownloader] [${tempId}] Initial FFmpeg command failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  const files = await fs.readdir('/tmp');
  let frameFiles = files.filter((file) => file.startsWith(`overwatch_frame_${tempId}_`)).sort();
  console.log(
    `[MediaDownloader] [${tempId}] Initial frame files found on disk: ${frameFiles.length} (${frameFiles.join(', ')})`,
  );

  // If we got too few frames (e.g. because the video was truncated due to max-filesize and the duration-based fps was too small),
  // fall back to extracting 6 frames from the first 60 seconds of the clip (fps = 6 / 60 = 0.1)
  if (frameFiles.length < 5) {
    console.log(
      `[MediaDownloader] [${tempId}] Extracted only ${frameFiles.length} frames. Falling back to extracting 6 frames from the first 60 seconds.`,
    );

    // Clean up current frames
    for (const frame of frameFiles) {
      await fs.unlink(path.join('/tmp', frame)).catch(() => {});
    }

    const fallbackCmd = `ffmpeg -i "${videoPath}" -vf "fps=0.1,scale=480:-1" -vframes 6 "${framePattern}" 2>/dev/null`;
    try {
      await runCommandWithTimeout(fallbackCmd, 15000);
      const updatedFiles = await fs.readdir('/tmp');
      frameFiles = updatedFiles.filter((file) => file.startsWith(`overwatch_frame_${tempId}_`)).sort();
      console.log(
        `[MediaDownloader] [${tempId}] Fallback frame files found on disk: ${frameFiles.length} (${frameFiles.join(', ')})`,
      );
    } catch (fallbackErr) {
      console.warn(`[MediaDownloader] [${tempId}] 60-second fallback frames extraction failed: ${fallbackErr}`);
    }
  }

  // Final fallback: If still no frames, try extracting at least the very first frame
  if (frameFiles.length === 0) {
    try {
      const firstFramePath = path.join('/tmp', `overwatch_frame_${tempId}_001.jpg`);
      const singleFrameCommand = `ffmpeg -i "${videoPath}" -vf "scale=480:-1" -vframes 1 "${firstFramePath}" 2>/dev/null`;
      await runCommandWithTimeout(singleFrameCommand, 10000);
      const updatedFiles = await fs.readdir('/tmp');
      frameFiles = updatedFiles.filter((file) => file.startsWith(`overwatch_frame_${tempId}_`)).sort();
    } catch (fallbackErr) {
      throw new Error(`FFmpeg failed to parse or extract frames from media file`);
    }
  }

  const result: MediaItem[] = [];
  for (const frameFile of frameFiles) {
    const filePath = path.join('/tmp', frameFile);
    try {
      const buffer = await fs.readFile(filePath);
      result.push({
        mimeType: 'image/jpeg',
        base64: buffer.toString('base64'),
      });
    } catch (readErr) {
      throw new Error(`Failed to read frame file: ${readErr instanceof Error ? readErr.message : readErr}`);
    }
  }

  return result;
}

/**
 * Processes a URL using yt-dlp first, and falls back to direct fetch on failure.
 */
async function processMediaUrl(url: string, tempId: string): Promise<MediaItem[]> {
  try {
    let filePath: string | null = null;
    let downloadErr: Error | null = null;

    // 1. Try yt-dlp first
    try {
      const pathResult = await downloadWithYtDlp(url, tempId);
      const isHtml = await isLocalFileHtmlOrText(pathResult);
      if (isHtml) {
        await fs.unlink(pathResult).catch(() => {});
        throw new Error('yt-dlp downloaded webpage HTML instead of binary media');
      }
      filePath = pathResult;
    } catch (err) {
      downloadErr = err instanceof Error ? err : new Error(String(err));
      console.log(`[MediaDownloader] [${tempId}] yt-dlp attempt failed: ${downloadErr.message}`);
    }

    // 2. Fallback to direct download if yt-dlp failed or outputted HTML
    if (!filePath) {
      try {
        filePath = await downloadDirectly(url, tempId);
      } catch (directErr) {
        const errMsg = downloadErr
          ? `yt-dlp error: ${downloadErr.message} | direct fetch error: ${directErr instanceof Error ? directErr.message : directErr}`
          : String(directErr);
        throw new Error(errMsg);
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    console.log(`[MediaDownloader] [${tempId}] File extension resolved to: ${ext}`);

    // If it's a static image, read directly
    if (IMAGE_EXTENSIONS.includes(ext)) {
      console.log(`[MediaDownloader] [${tempId}] Reading image file directly`);
      const buffer = await fs.readFile(filePath);
      let mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      return [
        {
          mimeType,
          base64: buffer.toString('base64'),
        },
      ];
    } else {
      // If it's a video or gif/animated format, extract frames
      return await extractFramesFromVideo(filePath, tempId);
    }
  } catch (err) {
    throw err;
  }
}

/**
 * Fetches media metadata from yt-dlp.
 */
async function fetchMetadataWithYtDlp(url: string): Promise<MediaMetadata | null> {
  const command = `yt-dlp --dump-json --no-playlist --playlist-items 1 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.google.com/" "${url}"`;
  try {
    const { stdout } = await runCommandWithTimeout(command, 15000);
    const data = JSON.parse(stdout);
    return {
      title: data.title || undefined,
      description: data.description || undefined,
      thumbnailUrl: data.thumbnail || undefined,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Resolves media metadata either from Discord embeds or yt-dlp metadata.
 */
async function fetchMetadata(url: string, message: Message): Promise<MediaMetadata | null> {
  // Check Discord Embeds first
  const embed = message.embeds.find((e) => e.url === url || e.video?.url === url || e.image?.url === url);
  if (embed && (embed.title || embed.description || embed.thumbnail?.url)) {
    return {
      title: embed.title || undefined,
      description: embed.description || undefined,
      thumbnailUrl: embed.thumbnail?.url || undefined,
    };
  }

  // Fallback to yt-dlp
  return await fetchMetadataWithYtDlp(url);
}

/**
 * Extracts and downloads all media and metadata from a message (attachments, embeds, text URLs).
 */
export async function collectMediaFromMessage(message: Message): Promise<ProcessedMediaResults> {
  const mediaItems: MediaItem[] = [];
  const metadataList: { title?: string; description?: string }[] = [];
  const processedUrls = new Set<string>();
  const logResults: { url: string; success: boolean; error?: string }[] = [];

  // Helper to process a URL and track its success/error
  const handleUrl = async (url: string, isThumbnail: boolean = false) => {
    const tempId = Math.random().toString(36).substring(2, 15);
    try {
      const result = await processMediaUrl(url, tempId);
      if (result && result.length > 0) {
        mediaItems.push(...result);
        logResults.push({ url: `${url}${isThumbnail ? ' (Thumbnail)' : ''}`, success: true });
      } else {
        logResults.push({
          url: `${url}${isThumbnail ? ' (Thumbnail)' : ''}`,
          success: false,
          error: 'No media items extracted',
        });
      }

      // If this is a main media link (not a thumbnail itself), fetch metadata
      if (!isThumbnail) {
        const meta = await fetchMetadata(url, message);
        if (meta) {
          if (meta.title || meta.description) {
            metadataList.push({ title: meta.title, description: meta.description });
          }
          // If metadata includes a thumbnail, queue and process it as a separate media element
          if (meta.thumbnailUrl && !processedUrls.has(meta.thumbnailUrl)) {
            processedUrls.add(meta.thumbnailUrl);
            await handleUrl(meta.thumbnailUrl, true);
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logResults.push({ url: `${url}${isThumbnail ? ' (Thumbnail)' : ''}`, success: false, error: errMsg });
    } finally {
      await cleanUpTempFiles(tempId);
    }
  };

  // 1. Gather from Attachments
  for (const [_, attachment] of message.attachments) {
    const url = attachment.url;
    if (processedUrls.has(url)) continue;
    processedUrls.add(url);

    // Ignore text files
    if (attachment.name?.toLowerCase().endsWith('.txt')) continue;

    await handleUrl(url);
  }

  // 2. Gather from Embeds
  for (const embed of message.embeds) {
    if (embed.video?.url) {
      const url = embed.video.url;
      if (!processedUrls.has(url)) {
        processedUrls.add(url);
        await handleUrl(url);
      }
    }
    if (embed.image?.url) {
      const url = embed.image.url;
      if (!processedUrls.has(url)) {
        processedUrls.add(url);
        await handleUrl(url);
      }
    }
  }

  // 3. Extract URLs from message content text
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urlsInText = message.content.match(urlRegex) || [];
  for (const url of urlsInText) {
    // Basic clean up of trailing punctuation
    const cleanUrl = url.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]$/, '');

    if (processedUrls.has(cleanUrl)) continue;
    processedUrls.add(cleanUrl);

    await handleUrl(cleanUrl);
  }

  // Print summary box for this message
  if (logResults.length > 0) {
    console.log(`\x1b[2m--------------------------------------------------\x1b[0m`);
    console.log(`Media Processing Summary for ${message.author.username} (Message ID: ${message.id}):`);
    for (const res of logResults) {
      if (res.success) {
        console.log(`  \x1b[32m[✔] ${res.url} (SUCCESS)\x1b[0m`);
      } else {
        console.log(`  \x1b[31m[✘] ${res.url} (FAILED: ${res.error})\x1b[0m`);
      }
    }
    console.log(`\x1b[2m--------------------------------------------------\x1b[0m`);
  }

  return { mediaItems, metadata: metadataList };
}
