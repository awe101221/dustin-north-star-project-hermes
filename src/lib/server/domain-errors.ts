import { NextResponse } from "next/server";
import { DbError } from "@/lib/db/query";

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  P0002: 404,
  "23505": 409,
  "55000": 409,
  "22007": 422,
  "22023": 422,
  "23503": 422,
  "23514": 422,
};

export type DomainDbErrorMessages = {
  notFound?: string;
  conflict?: string;
  invalid?: string;
};

export function domainDbErrorResponse(
  error: unknown,
  operation: string,
  messages: DomainDbErrorMessages = {},
) {
  if (!(error instanceof DbError) || !error.code) return null;
  const status = STATUS_BY_CODE[error.code];
  if (!status) return null;
  const message = status === 404
    ? messages.notFound ?? `${operation} target was not found.`
    : status === 409
      ? messages.conflict ?? `${operation} conflicts with existing state.`
      : messages.invalid ?? `${operation} was rejected.`;
  return NextResponse.json({ error: message, detail: error.code }, { status });
}
