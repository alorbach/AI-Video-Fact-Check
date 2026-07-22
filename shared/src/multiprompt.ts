import { getMasterPrompt } from "./masterPrompt.js";
import {
  getMessageCharLimit,
  shrinkMessageCharLimit,
} from "./messageLimits.js";
import type { ChatTargetId, Locale, PastePackage } from "./types.js";
import { CHAT_TARGETS } from "./types.js";

function transcriptUnavailable(locale: Locale): string {
  return locale === "de"
    ? "nicht verfügbar – bitte nur anhand der URL prüfen"
    : "not available – please check using the URL only";
}

function transcriptLabel(pkg: PastePackage): string {
  if (pkg.locale === "de") {
    if (pkg.transcriptSource === "post") {
      return "Beitragstext / Untertitel (falls vorhanden):";
    }
    if (pkg.transcriptSource === "external") {
      return "Transkript / Untertitel (Hilfsdienst):";
    }
    return "Transkript / Untertitel (falls vorhanden):";
  }
  if (pkg.transcriptSource === "post") {
    return "Post text / captions (if available):";
  }
  if (pkg.transcriptSource === "external") {
    return "Transcript / captions (helper service):";
  }
  return "Transcript / captions (if available):";
}

function shortAsk(locale: Locale): string {
  return locale === "de"
    ? [
        "Bitte führe einen verständlichen Faktencheck durch (Bewertung 1–10,",
        "kurze Zusammenfassung, wichtige Behauptungen, Quellen, Unsicherheiten).",
      ].join("\n")
    : [
        "Please run a clear fact-check (score 1–10, short summary,",
        "important claims, sources, uncertainties).",
      ].join("\n");
}

function ackOnly(locale: Locale, part: number, total: number): string {
  return locale === "de"
    ? [
        `Dies ist Teil ${part} von ${total} des Videomaterials.`,
        "Bitte bestätige kurz den Empfang. Analysiere noch nicht — warte auf den letzten Teil.",
      ].join("\n")
    : [
        `This is part ${part} of ${total} of the video material.`,
        "Please briefly acknowledge receipt. Do not analyze yet — wait for the final part.",
      ].join("\n");
}

function finalAnalyzeAfterParts(locale: Locale, total: number): string {
  return locale === "de"
    ? [
        `Dies ist der letzte Teil (${total} von ${total}).`,
        "Analysiere jetzt das gesamte Material aus allen vorherigen Teilen zusammen mit diesem.",
      ].join("\n")
    : [
        `This is the final part (${total} of ${total}).`,
        "Now analyze all material from the previous parts together with this one.",
      ].join("\n");
}

function urlBlock(pkg: PastePackage): string {
  return pkg.locale === "de"
    ? `Video-URL:\n${pkg.videoUrl}`
    : `Video URL:\n${pkg.videoUrl}`;
}

function materialHeader(pkg: PastePackage, includeUrl: boolean): string[] {
  const lines: string[] = [];
  if (includeUrl) {
    lines.push(urlBlock(pkg), "");
  }
  lines.push(transcriptLabel(pkg));
  return lines;
}

/** Split a long string into chunks that fit under `limit` (prefer paragraph/newline breaks). */
export function chunkText(text: string, limit: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= limit) return [trimmed];

  const chunks: string[] = [];
  let rest = trimmed;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < Math.floor(limit * 0.4)) {
      cut = rest.lastIndexOf(" ", limit);
    }
    if (cut < Math.floor(limit * 0.4)) {
      cut = limit;
    }
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export interface SplitHandoffOptions {
  /** Override char budget (e.g. after a runtime too-long rejection). */
  charLimit?: number;
}

function buildSingleMessage(
  pkg: PastePackage,
  needsMaster: boolean,
  transcriptBody: string,
): string {
  const material = [...materialHeader(pkg, true), transcriptBody];
  if (needsMaster) {
    return [getMasterPrompt(pkg.locale), "", "---", "", ...material].join("\n");
  }
  return [...material, "", shortAsk(pkg.locale)].join("\n");
}

function buildMessagesForChunks(
  pkg: PastePackage,
  needsMaster: boolean,
  master: string,
  ask: string,
  bodyChunks: string[],
  limit: number,
): string[] {
  const total = Math.max(1, bodyChunks.length);
  const messages: string[] = [];

  for (let i = 0; i < total; i++) {
    const part = i + 1;
    const isLast = part === total;
    const includeUrl = i === 0;
    const header = materialHeader(pkg, includeUrl);
    const chunk = bodyChunks[i] ?? transcriptUnavailable(pkg.locale);

    if (!isLast) {
      let msg = [...header, chunk, "", ackOnly(pkg.locale, part, total)].join(
        "\n",
      );
      if (msg.length > limit) {
        const room = Math.max(200, limit - 160);
        msg = [
          chunk.slice(0, room),
          "",
          ackOnly(pkg.locale, part, total),
        ].join("\n");
      }
      messages.push(msg);
      continue;
    }

    if (needsMaster) {
      const withMaster = [
        master,
        "",
        "---",
        "",
        finalAnalyzeAfterParts(pkg.locale, total),
        "",
        ...header,
        chunk,
      ].join("\n");
      if (withMaster.length <= limit) {
        messages.push(withMaster);
      } else {
        // Keep as much of the last transcript chunk as fits — never drop it.
        const frame = [
          master,
          "",
          "---",
          "",
          finalAnalyzeAfterParts(pkg.locale, total),
          "",
        ].join("\n");
        messages.push(fitMaterialIntoLimit(frame, header, chunk, limit));
      }
    } else {
      const withAsk = [
        ...header,
        chunk,
        "",
        finalAnalyzeAfterParts(pkg.locale, total),
        "",
        ask,
      ].join("\n");
      if (withAsk.length <= limit) {
        messages.push(withAsk);
      } else {
        const frame = [
          finalAnalyzeAfterParts(pkg.locale, total),
          "",
          ask,
          "",
        ].join("\n");
        messages.push(fitMaterialIntoLimit(frame, header, chunk, limit));
      }
    }
  }

  return messages;
}

/** Prefix + header + as much of chunk as fits under `limit` (never omit chunk entirely). */
function fitMaterialIntoLimit(
  frame: string,
  header: string[],
  chunk: string,
  limit: number,
): string {
  const headerBlock = header.length ? header.join("\n") + "\n" : "";
  const full = [frame, headerBlock + chunk].join("\n");
  if (full.length <= limit) return full;

  const room = Math.max(80, limit - frame.length - headerBlock.length - 1);
  const clipped = chunk.slice(0, room);
  const withClip = [frame, headerBlock + clipped].join("\n");
  if (withClip.length <= limit) return withClip;

  // Extremely tight budget: prefer truncated chunk over frame-only.
  return (frame + "\n" + chunk).slice(0, limit);
}

/**
 * Build one or more composer messages for handoff.
 * Single message when the full paste package fits; otherwise multiprompt:
 * intermediate parts acknowledge only; last part starts analysis.
 */
export function splitIntoHandoffMessages(
  pkg: PastePackage,
  target: ChatTargetId,
  opts?: SplitHandoffOptions,
): string[] {
  const limit = opts?.charLimit ?? getMessageCharLimit(target);
  const needsMaster = CHAT_TARGETS[target]?.needsEmbeddedMasterPrompt ?? false;
  const transcriptBody =
    pkg.transcript?.trim() || transcriptUnavailable(pkg.locale);
  const master = needsMaster ? getMasterPrompt(pkg.locale) : "";
  const ask = needsMaster ? "" : shortAsk(pkg.locale);

  const single = buildSingleMessage(pkg, needsMaster, transcriptBody);
  if (single.length <= limit) return [single];

  const frameReserve = needsMaster
    ? Math.min(master.length + 400, Math.floor(limit * 0.55))
    : ask.length + 350;
  let chunkLimit = Math.max(600, limit - frameReserve);

  for (let attempt = 0; attempt < 4; attempt++) {
    const bodyChunks = chunkText(transcriptBody, chunkLimit);
    const messages = buildMessagesForChunks(
      pkg,
      needsMaster,
      master,
      ask,
      bodyChunks.length > 0 ? bodyChunks : [transcriptBody],
      limit,
    );
    if (messages.every((m) => m.length <= limit)) {
      return messages;
    }
    chunkLimit = Math.max(400, Math.floor(chunkLimit * 0.7));
  }

  // Last resort: hard-slice the transcript.
  const hardChunks = chunkText(transcriptBody, Math.max(400, Math.floor(limit * 0.45)));
  return buildMessagesForChunks(
    pkg,
    needsMaster,
    master,
    ask,
    hardChunks.length > 0 ? hardChunks : [transcriptBody.slice(0, 400)],
    limit,
  );
}

/** Re-split with a smaller budget after the chat UI rejects a message as too long. */
export function resplitAfterTooLong(
  pkg: PastePackage,
  target: ChatTargetId,
  previousLimit: number,
): { messages: string[]; charLimit: number } {
  const charLimit = shrinkMessageCharLimit(previousLimit);
  return {
    messages: splitIntoHandoffMessages(pkg, target, { charLimit }),
    charLimit,
  };
}
