import type { Env } from "./types";

export interface VersionInfo {
  ok: true;
  version: string;
  buildSha: string;
  shortSha: string;
}

const UNKNOWN = "unknown";
const SHORT_SHA_LENGTH = 7;
const DIRTY_SUFFIX = "-dirty";

export function getVersionInfo(env: Pick<Env, "APP_VERSION" | "BUILD_SHA">): VersionInfo {
  const version = normalizeValue(env.APP_VERSION);
  const buildSha = normalizeValue(env.BUILD_SHA);

  return {
    ok: true,
    version,
    buildSha,
    shortSha: getShortSha(buildSha)
  };
}

function normalizeValue(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || UNKNOWN;
}

function getShortSha(buildSha: string): string {
  if (buildSha === UNKNOWN) {
    return UNKNOWN;
  }

  const isDirty = buildSha.endsWith(DIRTY_SUFFIX);
  const sha = isDirty ? buildSha.slice(0, -DIRTY_SUFFIX.length) : buildSha;
  const shortSha = sha.slice(0, SHORT_SHA_LENGTH);

  return shortSha ? `${shortSha}${isDirty ? DIRTY_SUFFIX : ""}` : UNKNOWN;
}
