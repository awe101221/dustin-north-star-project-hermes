#!/usr/bin/env python3
"""Sync reviewed North Star challenger tournaments into the Challenger Board.

The source of truth is a completed North Star PM Kanban handoff whose structured
metadata contains a reviewed ``challenger`` array. The destination is only each
matching active ``hermes_ideas.metadata.challenger`` object. The script never
changes 10+10 membership, pipeline stage, position size, or trades.
"""

import argparse
import copy
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

PROJECT_REF = "cwiaqczpifnxxcucqwvr"
ALLOWED_DISPOSITIONS = {
    "first alternate",
    "watch / price trigger",
    "owned-position review",
    "reject",
}
ACCEPTED_REVIEWS = {
    "pass",
    "passed",
    "pass_with_caveats",
    "passed_with_caveats",
}
EXACT_STRUCTURED_REVIEW_VERDICTS = {"PASS", "PASS WITH CAVEATS"}
REQUIRED_CANDIDATE_FIELDS = (
    "ticker",
    "expectedIrr",
    "requiredIrr",
    "currentPrice",
    "hurdlePrice",
    "evidenceGrade",
    "modelAsOf",
    "reviewStatus",
    "disposition",
    "basis",
)
TICKER_PATTERN = re.compile(r"^(?:[A-Z][A-Z0-9.-]{0,15}:)?[A-Z][A-Z0-9.-]{0,15}$")
MAX_SAFE_INTEGER = 9_007_199_254_740_991


def _text(value: Any) -> Optional[str]:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value and abs(value) != float("inf")


def _safe_number(value: Any) -> bool:
    return _finite(value) and abs(value) <= MAX_SAFE_INTEGER


def _bare_ticker(value: str) -> str:
    return value.strip().upper().split(":")[-1]


def _timestamp(value: Any, label: str = "timestamp", allow_date: bool = False) -> dt.datetime:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not _finite(value):
            raise ValueError("{} is invalid".format(label))
        return dt.datetime.fromtimestamp(value, dt.timezone.utc)
    if isinstance(value, str) and value.strip():
        raw = value.strip()
        is_date = re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw) is not None
        offset = re.search(r"[+-](\d{2}):(\d{2})$", raw)
        if is_date and not allow_date:
            raise ValueError("{} must be a timestamp with an explicit timezone".format(label))
        if not is_date and not (raw.endswith("Z") or offset):
            raise ValueError("{} must include an explicit timezone".format(label))
        if offset and (int(offset.group(1)) > 23 or int(offset.group(2)) > 59):
            raise ValueError("{} is invalid".format(label))
        try:
            parsed = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("{} is invalid".format(label)) from error
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    raise ValueError("{} is missing or invalid".format(label))


def _iso_timestamp(value: Any) -> str:
    return _timestamp(value, "Tournament completion time").isoformat().replace("+00:00", "Z")


def _candidate_date(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise ValueError(label + " must be an ISO date string")
    raw = value.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        try:
            dt.date.fromisoformat(raw)
        except ValueError as exc:
            raise ValueError(label + " is not a valid date") from exc
        return raw
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})", raw):
        raise ValueError(label + " must be an ISO timestamp with T and explicit timezone")
    return _timestamp(raw, label).isoformat().replace("+00:00", "Z")


def _valid_ticker(value: Any) -> Optional[str]:
    ticker = _text(value)
    if not ticker:
        return None
    normalized = ticker.upper()
    return normalized if TICKER_PATTERN.fullmatch(normalized) else None


def _normalize_disposition(value: Any) -> str:
    disposition = (_text(value) or "").lower().replace("watch-price trigger", "watch / price trigger")
    if disposition == "admit":
        raise ValueError("Automatic Challenger Board sync cannot publish an admit decision")
    if disposition not in ALLOWED_DISPOSITIONS:
        raise ValueError("Tournament contains an invalid challenger disposition")
    return disposition


def _review_verdict(value: Any) -> str:
    status = (_text(value) or "").lower().replace(" ", "_")
    if status not in ACCEPTED_REVIEWS:
        raise ValueError("Every tournament candidate must have accepted independent review")
    return "PASS WITH CAVEATS" if status.endswith("with_caveats") else "PASS"


def _incumbent_from_title(title: Any) -> Optional[str]:
    match = re.search(r"\b(?:synthesize\s+)?([A-Z][A-Z0-9.-]{0,11})\s+vs\b", _text(title) or "", re.IGNORECASE)
    return match.group(1).upper() if match else None


def _metadata_candidate(metadata: Any) -> Optional[str]:
    if not isinstance(metadata, dict):
        return None
    containers = [metadata]
    if isinstance(metadata.get("challenger"), dict):
        containers.append(metadata["challenger"])
    identities = []
    for container in containers:
        for field in ("candidateTicker", "candidate", "ticker"):
            if field not in container:
                continue
            value = _valid_ticker(container[field])
            if not value:
                raise ValueError("Structured review candidate ticker is invalid")
            identities.append(_bare_ticker(value))
    # ``security`` is a legacy fallback and may be a descriptive issuer name. A
    # syntactically valid ticker is still an identity and must agree with every
    # primary field; descriptive names are ignored only when a primary identity exists.
    for container in containers:
        if "security" not in container:
            continue
        value = _valid_ticker(container["security"])
        if value:
            identities.append(_bare_ticker(value))
        elif not identities:
            raise ValueError("Structured review candidate ticker is invalid")
    if len(set(identities)) > 1:
        raise ValueError("Structured review candidate identities disagree")
    return identities[0] if identities else None


def _task_candidate(body: Any, title: Any = None) -> Optional[str]:
    try:
        metadata = json.loads(body) if isinstance(body, str) else body
    except json.JSONDecodeError:
        metadata = None
    structured = _metadata_candidate(metadata)
    identities = [structured] if structured else []
    patterns = (
        r"\b(?:re-?review|review)(?:\s+second)?(?:\s+corrected)?\s+([A-Z][A-Z0-9.-]{0,11})\s+challenger\b",
        r"\b(?:parent|corrected)\s+([A-Z][A-Z0-9.-]{0,11})\s+challenger\b",
    )
    for value in (title, body):
        text = _text(value) or ""
        for pattern in patterns:
            identities.extend(match.group(1).upper() for match in re.finditer(pattern, text, re.IGNORECASE))
    if len(set(identities)) > 1:
        raise ValueError("Review candidate identities disagree")
    return identities[0] if identities else None


def _validate_packet(row: Dict[str, Any]) -> Dict[str, Any]:
    if row.get("assignee") != "north-star-pm" or row.get("run_profile") != "north-star-pm" \
            or row.get("task_status") != "done" or not isinstance(row.get("run_id"), int) \
            or isinstance(row.get("run_id"), bool) or not 0 < row["run_id"] <= MAX_SAFE_INTEGER:
        raise ValueError("Tournament source must be a completed terminal North Star PM run")
    metadata = row.get("metadata")
    if not isinstance(metadata, dict):
        raise ValueError("Tournament PM handoff metadata is unavailable")
    candidates = metadata.get("challenger")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("Tournament PM handoff has no challenger array")
    accepted = metadata.get("accepted_review_tasks")
    audit = metadata.get("audit_trail")
    review_records = row.get("review_records")
    if not isinstance(accepted, list) or not accepted or not isinstance(audit, list) or not isinstance(review_records, dict):
        raise ValueError("Tournament lacks an accepted independent-review audit trail")
    accepted_ids = [_text(value) for value in accepted]
    if any(value is None for value in accepted_ids) or len(set(accepted_ids)) != len(accepted_ids):
        raise ValueError("Tournament accepted independent-review task ids are invalid or duplicated")
    accepted_set = {value for value in accepted_ids if value is not None}

    audit_by_candidate: Dict[str, Dict[str, Any]] = {}
    audit_review_ids = set()
    for entry in audit:
        if not isinstance(entry, dict):
            raise ValueError("Tournament audit trail entry is invalid")
        candidate = _text(entry.get("candidate"))
        accepted_id = _text(entry.get("accepted"))
        if not candidate or not accepted_id:
            raise ValueError("Tournament audit trail entry is incomplete")
        candidate = candidate.upper()
        if candidate in audit_by_candidate or accepted_id in audit_review_ids:
            raise ValueError("Tournament audit trail contains duplicate candidate or review entries")
        audit_by_candidate[candidate] = entry
        audit_review_ids.add(accepted_id)
    if audit_review_ids != accepted_set:
        raise ValueError("Tournament audit trail does not exactly match accepted independent reviews")

    normalized = []
    seen = set()
    for rank, raw in enumerate(candidates, start=1):
        if not isinstance(raw, dict):
            raise ValueError("Tournament candidate metadata must be an object")
        missing = [field for field in REQUIRED_CANDIDATE_FIELDS if field not in raw or raw[field] is None or raw[field] == ""]
        if missing:
            raise ValueError("Tournament candidate is missing required fields: " + ", ".join(missing))
        ticker = _valid_ticker(raw.get("ticker"))
        if not ticker:
            raise ValueError("Tournament candidate ticker is invalid")
        bare = _bare_ticker(ticker)
        candidate_identity = _metadata_candidate(raw)
        if candidate_identity != bare:
            raise ValueError("Tournament candidate identity does not match ticker identity")
        if bare in seen:
            raise ValueError("Tournament contains duplicate candidate tickers")
        seen.add(bare)
        if "rank" in raw and (not isinstance(raw["rank"], int) or isinstance(raw["rank"], bool) or raw["rank"] != rank):
            raise ValueError("Tournament candidate supplied rank contradicts packet order")
        for field in ("expectedIrr", "requiredIrr"):
            if not _finite(raw.get(field)):
                raise ValueError("Tournament candidate has a non-finite numerical field")
            if not _safe_number(raw[field]):
                raise ValueError("Tournament candidate numerical field is outside the cross-runtime safe numeric domain")
        for field in ("currentPrice", "hurdlePrice"):
            if not _finite(raw.get(field)) or raw[field] <= 0:
                raise ValueError("Tournament candidate price fields must be positive")
            if not _safe_number(raw[field]):
                raise ValueError("Tournament candidate price field is outside the cross-runtime safe numeric domain")
        for field in ("priceOnlyExpectedIrr", "fiveYearExpectedIrr", "fiveYearHurdlePrice", "hurdlePriceExpectedTerminalValueConvention"):
            if raw.get(field) is not None and not _finite(raw.get(field)):
                raise ValueError("Tournament candidate optional numerical field is invalid")
            if raw.get(field) is not None and not _safe_number(raw[field]):
                raise ValueError("Tournament candidate optional field is outside the cross-runtime safe numeric domain")
        for field in ("fiveYearHurdlePrice", "hurdlePriceExpectedTerminalValueConvention"):
            if raw.get(field) is not None and raw[field] <= 0:
                raise ValueError("Tournament candidate optional price field must be positive")
        optional_text = {}
        for field in ("portfolioFit", "nextEventStatus", "nextEvidenceTrigger"):
            value = raw.get(field)
            if value is not None and not _text(value):
                raise ValueError("Tournament candidate optional text field is invalid")
            optional_text[field] = _text(value)
        next_event_estimated = raw.get("nextEventEstimated")
        if next_event_estimated is not None and not isinstance(next_event_estimated, bool):
            raise ValueError("Tournament candidate next-event estimate flag is invalid")
        if raw["requiredIrr"] < 0.12:
            raise ValueError("Tournament candidate required IRR is below the 12% admission door")
        if not _text(raw.get("basis")):
            raise ValueError("Tournament candidate basis is unavailable")
        model_as_of = _candidate_date(raw.get("modelAsOf"), "Tournament candidate model date")
        if "nextEventAt" not in raw:
            raise ValueError("Tournament candidate next-event date must be an ISO date or explicit null")
        next_event_at = None
        if raw["nextEventAt"] is not None:
            next_event_at = _candidate_date(raw["nextEventAt"], "Tournament candidate next-event date")

        audit_entry = audit_by_candidate.get(bare)
        if not audit_entry:
            raise ValueError("Every tournament candidate must map to an accepted independent review")
        accepted_id = _text(audit_entry.get("accepted"))
        review = review_records.get(accepted_id) if accepted_id else None
        if not isinstance(review, dict) or review.get("task_id") != accepted_id \
                or review.get("assignee") != "evidence-risk-reviewer" \
                or review.get("run_profile") != "evidence-risk-reviewer" \
                or review.get("task_status") != "done" or review.get("run_status") != "done" \
                or review.get("outcome") != "completed" or not isinstance(review.get("run_id"), int) \
                or isinstance(review.get("run_id"), bool) or not 0 < review["run_id"] <= MAX_SAFE_INTEGER:
            raise ValueError("Every tournament candidate must map to a resolved completed independent review")
        if review.get("task_candidate_ticker") != bare or review.get("run_candidate_ticker") != bare:
            raise ValueError("Independent review task/run candidate identity does not match tournament candidate identity")
        audit_verdict = _review_verdict(audit_entry.get("reviewStatus"))
        candidate_verdict = _review_verdict(raw.get("reviewStatus"))
        review_verdict = _review_verdict(review.get("verdict"))
        if len({audit_verdict, candidate_verdict, review_verdict}) != 1:
            raise ValueError("Tournament candidate and independent review verdicts disagree")
        raw_grade = (_text(raw.get("evidenceGrade")) or "").upper()
        grade = {
            "A": "A", "B": "B", "B-": "B", "C": "C", "D": "D",
            "B- SOURCE PACK; QUALITATIVE NO-ADMISSION WATCH USE": "B",
            "B; QUALITATIVE NO-ADMISSION/QQQ-DEFAULT USE": "B",
            "B- REVIEWED NEGATIVE SCREEN": "B",
        }.get(raw_grade)
        if grade is None:
            raise ValueError("Tournament candidate evidence grade is invalid")
        item = copy.deepcopy(raw)
        item.update({
            "rank": rank,
            "ticker": ticker,
            "bareTicker": bare,
            "disposition": _normalize_disposition(raw.get("disposition")),
            "evidenceGradeLetter": grade,
            "modelAsOf": model_as_of,
            "nextEventAt": next_event_at,
            "portfolioFit": optional_text["portfolioFit"],
            "nextEventStatus": optional_text["nextEventStatus"],
            "nextEventEstimated": next_event_estimated,
            "nextEvidenceTrigger": optional_text["nextEvidenceTrigger"],
            "reviewVerdict": candidate_verdict,
            "acceptedReviewTaskId": accepted_id,
            "acceptedReviewRunId": review["run_id"],
        })
        normalized.append(item)

    candidate_set = {candidate["bareTicker"] for candidate in normalized}
    if candidate_set != set(audit_by_candidate) or len(normalized) != len(audit_by_candidate) \
            or len(normalized) != len(accepted_set):
        raise ValueError("Tournament candidates, audit trail, and accepted reviews must exactly match")

    comparators = metadata.get("comparators")
    as_of = comparators.get("frozenAsOf") if isinstance(comparators, dict) else None
    if not _text(as_of):
        raise ValueError("Tournament comparison as-of time is unavailable")
    _timestamp(as_of, "Tournament comparison as-of time")
    source_task_id = _text(row.get("task_id"))
    if not source_task_id:
        raise ValueError("Tournament source task id is unavailable")
    incumbent = _incumbent_from_title(row.get("title"))
    if not incumbent:
        raise ValueError("Tournament incumbent identity is unavailable")
    source_comment_id = metadata.get("packetCommentId")
    if not isinstance(source_comment_id, int) or isinstance(source_comment_id, bool) \
            or not 0 < source_comment_id <= MAX_SAFE_INTEGER:
        raise ValueError("Tournament source comment id is unavailable")
    terminal_label = (_text(metadata.get("terminalPmLabel")) or "").lower()
    summary = _text(metadata.get("decision")) or _text(row.get("summary"))
    if not terminal_label or not summary:
        raise ValueError("Tournament terminal PM decision is unavailable")
    return {
        "task_id": source_task_id,
        "sourceRunId": row["run_id"],
        "title": _text(row.get("title")),
        "asOf": _text(as_of),
        "completedAt": _iso_timestamp(row.get("ended_at")),
        "incumbentTicker": incumbent,
        "terminalLabel": terminal_label,
        "summary": summary,
        "sourceCommentId": source_comment_id,
        "acceptedReviewTasks": sorted(accepted_set),
        "candidates": normalized,
    }


def select_latest_tournament(rows: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    tournament_rows = []
    for row in rows:
        metadata = row.get("metadata")
        if isinstance(metadata, dict) and isinstance(metadata.get("challenger"), list) and metadata.get("challenger"):
            tournament_rows.append(row)
    if not tournament_rows:
        raise LookupError("No completed PM challenger tournament was found")
    latest = max(tournament_rows, key=lambda row: (
        _timestamp(row.get("ended_at"), "Tournament completion time"),
        str(row.get("kanban_db") or ""),
        str(row.get("task_id") or ""),
        int(row.get("run_id") or 0),
    ))
    return _validate_packet(latest)


def _configured_kanban_db(home: Path) -> Optional[Path]:
    config = home / "config.yaml"
    if not config.exists():
        return None
    in_kanban = False
    for raw in config.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip())
        if indent == 0:
            in_kanban = raw.strip() == "kanban:"
            continue
        if in_kanban:
            match = re.match(r"\s+db_path:\s*(.+?)\s*$", raw)
            if match:
                value = match.group(1).split(" #", 1)[0].strip().strip("\"'")
                if value:
                    return Path(value).expanduser()
    return None


def discover_kanban_databases(home: Path) -> List[Path]:
    candidates: List[Path] = []
    explicit = _text(os.environ.get("HERMES_KANBAN_DB"))
    if explicit:
        candidates.append(Path(explicit).expanduser())
    configured = _configured_kanban_db(home)
    if configured:
        candidates.append(configured)
    candidates.append(home / "kanban.db")
    current = home / "kanban" / "current"
    if current.exists():
        slug = current.read_text(encoding="utf-8").strip()
        if re.fullmatch(r"[A-Za-z0-9_.-]+", slug):
            candidates.append(home / "kanban" / "boards" / slug / "kanban.db")
    candidates.extend((home / "kanban" / "boards").glob("*/kanban.db"))
    return sorted({path.resolve() for path in candidates if path.is_file()})


def _stored_verdict(task_result: Any, run_summary: Any, run_metadata: Any) -> Optional[str]:
    del task_result, run_summary
    if not isinstance(run_metadata, dict):
        return None
    verdict = run_metadata.get("verdict")
    return verdict if isinstance(verdict, str) and verdict in EXACT_STRUCTURED_REVIEW_VERDICTS else None


def load_completed_pm_rows(paths: Iterable[Path]) -> List[Dict[str, Any]]:
    rows = []
    for path in paths:
        uri = "file:" + str(path.resolve()) + "?mode=ro"
        connection = sqlite3.connect(uri, uri=True)
        connection.row_factory = sqlite3.Row
        try:
            tables = {row[0] for row in connection.execute("select name from sqlite_master where type='table'")}
            if not {"tasks", "task_runs"}.issubset(tables):
                continue
            query = """
                select r.id as run_id, r.task_id, r.profile as run_profile,
                       t.title, t.assignee, t.status as task_status,
                       r.ended_at, r.summary, r.metadata
                from task_runs r
                join tasks t on t.id = r.task_id
                where r.status = 'done' and r.outcome = 'completed' and r.metadata is not null
            """
            for row in connection.execute(query):
                try:
                    metadata = json.loads(row["metadata"])
                except (TypeError, json.JSONDecodeError):
                    continue
                if not isinstance(metadata, dict):
                    continue
                if not isinstance(metadata.get("challenger"), list) or not metadata.get("challenger"):
                    continue
                pm_ended_at = _timestamp(row["ended_at"], "Tournament completion time")
                review_records: Dict[str, Dict[str, Any]] = {}
                accepted = metadata.get("accepted_review_tasks")
                if isinstance(accepted, list):
                    for value in accepted:
                        review_id = _text(value)
                        if not review_id:
                            continue
                        review_rows = connection.execute("""
                            select t.id as task_id, t.title, t.body, t.assignee, t.status as task_status, t.result,
                                   r.id as run_id, r.profile as run_profile, r.status as run_status,
                                   r.outcome, r.ended_at, r.summary, r.metadata
                            from tasks t
                            join task_runs r on r.task_id = t.id
                            where t.id = ? and r.status = 'done' and r.outcome = 'completed'
                        """, (review_id,)).fetchall()
                        eligible_review_rows = []
                        for review_row in review_rows:
                            review_ended_at = _timestamp(
                                review_row["ended_at"], "Independent review completion time"
                            )
                            if review_ended_at <= pm_ended_at:
                                eligible_review_rows.append((review_ended_at, review_row["run_id"], review_row))
                        if not eligible_review_rows:
                            continue
                        _, _, review_row = max(eligible_review_rows, key=lambda item: (item[0], item[1]))
                        try:
                            review_metadata = json.loads(review_row["metadata"]) if review_row["metadata"] else {}
                        except (TypeError, json.JSONDecodeError):
                            review_metadata = None
                        task_candidate = _task_candidate(review_row["body"], review_row["title"])
                        metadata_candidate = _metadata_candidate(review_metadata)
                        review_records[review_id] = {
                            "task_id": review_row["task_id"],
                            "title": review_row["title"],
                            "assignee": review_row["assignee"],
                            "task_status": review_row["task_status"],
                            "run_id": review_row["run_id"],
                            "run_profile": review_row["run_profile"],
                            "run_status": review_row["run_status"],
                            "outcome": review_row["outcome"],
                            "verdict": _stored_verdict(review_row["result"], review_row["summary"], review_metadata),
                            "task_candidate_ticker": task_candidate,
                            # The completed run is joined to this exact task id. Prefer an
                            # explicit run-metadata ticker, otherwise inherit the task's
                            # independently parsed title/body identity through that FK.
                            "run_candidate_ticker": metadata_candidate or task_candidate,
                        }
                rows.append({
                    "task_id": row["task_id"],
                    "title": row["title"],
                    "assignee": row["assignee"],
                    "task_status": row["task_status"],
                    "run_id": row["run_id"],
                    "run_profile": row["run_profile"],
                    "ended_at": row["ended_at"],
                    "summary": row["summary"],
                    "metadata": metadata,
                    "review_records": review_records,
                    "kanban_db": str(path.resolve()),
                })
        finally:
            connection.close()
    return rows


def _canonical_json(value: Any) -> str:
    if value is None:
        return '["null"]'
    if isinstance(value, bool):
        return '["boolean",{}]'.format("true" if value else "false")
    if isinstance(value, str):
        return '["string",{}]'.format(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    if isinstance(value, (int, float)):
        try:
            number = float(value)
        except (OverflowError, ValueError) as error:
            raise ValueError("Publication hash contains an invalid number") from error
        if not _finite(number):
            raise ValueError("Publication hash contains a non-finite number")
        if not _safe_number(value):
            raise ValueError("Publication hash number is outside the cross-runtime safe numeric domain")
        if number == 0:
            number = 0.0
        return '["number","{}"]'.format(struct.pack(">d", number).hex())
    if isinstance(value, list):
        return '["array",[{}]]'.format(",".join(_canonical_json(item) for item in value))
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise ValueError("Publication hash object keys must be strings")
        keys = sorted(value, key=lambda key: key.encode("utf-16-be", "surrogatepass"))
        entries = (
            '[{},{}]'.format(
                json.dumps(key, ensure_ascii=False, separators=(",", ":")),
                _canonical_json(value[key]),
            )
            for key in keys
        )
        return '["object",[{}]]'.format(",".join(entries))
    raise ValueError("Publication hash contains an unsupported value")


def _json_hash(value: Any) -> str:
    encoded = _canonical_json(value).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _candidate_frozen_fields(candidate: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "acceptedReviewTaskId": candidate["acceptedReviewTaskId"],
        "acceptedReviewRunId": candidate["acceptedReviewRunId"],
        "reviewVerdict": candidate["reviewVerdict"],
        "rank": candidate["rank"],
        "disposition": candidate["disposition"],
        "expectedIrr": candidate["expectedIrr"],
        "requiredIrr": candidate["requiredIrr"],
        "currentPrice": candidate["currentPrice"],
        "hurdlePrice": candidate["hurdlePrice"],
        "evidenceGrade": candidate["evidenceGradeLetter"],
        "modelAsOf": candidate["modelAsOf"],
        "nextEventAt": candidate.get("nextEventAt"),
        "basis": candidate["basis"],
        "portfolioFitAssessment": candidate.get("portfolioFit"),
        "priceOnlyExpectedIrr": candidate.get("priceOnlyExpectedIrr"),
        "fiveYearExpectedIrr": candidate.get("fiveYearExpectedIrr"),
        "fiveYearHurdlePrice": candidate.get("fiveYearHurdlePrice"),
        "hurdlePriceExpectedTerminalValueConvention": candidate.get("hurdlePriceExpectedTerminalValueConvention"),
        "nextEventStatus": candidate.get("nextEventStatus"),
        "nextEventEstimated": candidate.get("nextEventEstimated"),
        "nextEvidenceTrigger": candidate.get("nextEvidenceTrigger"),
    }


def _reviewed_content(tournament: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "asOf": tournament["asOf"],
        "candidates": [
            {"candidateIdentity": candidate["bareTicker"], **_candidate_frozen_fields(candidate)}
            for candidate in tournament["candidates"]
        ],
        "completedAt": tournament["completedAt"],
        "incumbentTicker": tournament["incumbentTicker"],
        "sourceCommentId": tournament["sourceCommentId"],
        "summary": tournament["summary"],
        "terminalLabel": tournament["terminalLabel"],
    }


def _publication_manifest(tournament: Dict[str, Any]) -> Dict[str, Any]:
    identities = [candidate["bareTicker"] for candidate in tournament["candidates"]]
    candidate_hash = _json_hash(identities)
    manifest = {
        "candidateSetHash": candidate_hash,
        "expectedCandidateCount": len(identities),
        "orderedCandidateIdentities": identities,
        "reviewedContentHash": _json_hash(_reviewed_content(tournament)),
        "sourceRunId": tournament["sourceRunId"],
        "sourceTaskId": tournament["task_id"],
    }
    return {**manifest, "manifestHash": _json_hash(manifest)}


_TEMPORAL_FROZEN_FIELDS = {"asOf", "completedAt", "modelAsOf", "nextEventAt"}
_INTEGER_FROZEN_FIELDS = {
    "sourceRunId", "sourceCommentId", "expectedCandidateCount", "rank", "acceptedReviewRunId",
}


def _same_frozen_value(field: str, existing: Any, proposed: Any) -> bool:
    if field not in _TEMPORAL_FROZEN_FIELDS:
        if _safe_number(existing) and _safe_number(proposed):
            if field in _INTEGER_FROZEN_FIELDS:
                return float(existing).is_integer() and float(proposed).is_integer() \
                    and int(existing) == int(proposed)
            existing_number = 0.0 if float(existing) == 0 else float(existing)
            proposed_number = 0.0 if float(proposed) == 0 else float(proposed)
            return struct.pack(">d", existing_number) == struct.pack(">d", proposed_number)
        return existing == proposed and type(existing) is type(proposed)
    if existing is None or proposed is None:
        return existing is proposed
    if not isinstance(existing, str) or not isinstance(proposed, str):
        return False
    existing_is_date = re.fullmatch(r"\d{4}-\d{2}-\d{2}", existing.strip()) is not None
    proposed_is_date = re.fullmatch(r"\d{4}-\d{2}-\d{2}", proposed.strip()) is not None
    if existing_is_date or proposed_is_date:
        if not (existing_is_date and proposed_is_date):
            return False
        try:
            return dt.date.fromisoformat(existing.strip()) == dt.date.fromisoformat(proposed.strip())
        except ValueError:
            return False
    try:
        return _timestamp(existing, "Existing legacy tournament " + field) == _timestamp(
            proposed, "Proposed tournament " + field
        )
    except ValueError:
        return False


def _validate_existing_frozen_fields(
        existing: Dict[str, Any], proposed: Dict[str, Any], *, require_all: bool, legacy: bool) -> None:
    for field, proposed_value in proposed.items():
        if field not in existing:
            if require_all:
                raise ValueError("Existing sealed tournament is missing immutable field: " + field)
            continue
        # A retry may encounter an exactly staged row; false is the only allowed
        # pre-completion representation of the final true publication marker.
        if not legacy and field == "publicationComplete" and existing[field] is False and proposed_value is True:
            continue
        if not _same_frozen_value(field, existing[field], proposed_value):
            kind = "legacy" if legacy else "sealed"
            raise ValueError("Existing {} tournament immutable field differs: {}".format(kind, field))


def build_idea_updates(tournament: Dict[str, Any], ideas: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_ticker: Dict[str, List[Dict[str, Any]]] = {}
    for idea in ideas:
        if not isinstance(idea, dict):
            raise ValueError("Every active idea must be an object")
        ticker = _text(idea.get("ticker"))
        if ticker:
            by_ticker.setdefault(_bare_ticker(ticker), []).append(idea)
    updates = []
    incumbent = tournament.get("incumbentTicker")
    lane = "{}-challenger-tournament".format((incumbent or "reviewed").lower())
    publication = _publication_manifest(tournament)
    for candidate in tournament["candidates"]:
        matches = by_ticker.get(candidate["bareTicker"], [])
        if len(matches) != 1:
            raise ValueError("Each tournament candidate must match exactly one active idea: {}".format(candidate["ticker"]))
        idea = matches[0]
        if not isinstance(idea.get("metadata"), dict):
            raise ValueError("Active idea metadata must be an object")
        metadata: Dict[str, Any] = copy.deepcopy(idea["metadata"])
        raw_existing_challenger = metadata.get("challenger")
        if raw_existing_challenger is not None and not isinstance(raw_existing_challenger, dict):
            raise ValueError("Active idea metadata.challenger must be an object")
        existing_challenger: Dict[str, Any] = copy.deepcopy(raw_existing_challenger) if raw_existing_challenger is not None else {}
        raw_existing_tournament = existing_challenger.get("tournament")
        if raw_existing_tournament is not None and not isinstance(raw_existing_tournament, dict):
            raise ValueError("Active idea metadata.challenger.tournament must be an object")
        existing_tournament: Dict[str, Any] = copy.deepcopy(raw_existing_tournament) if raw_existing_tournament is not None else {}
        proposed_tournament = {
            "id": tournament["task_id"],
            "asOf": tournament["asOf"],
            "completedAt": tournament["completedAt"],
            "incumbentTicker": incumbent,
            "terminalLabel": tournament.get("terminalLabel"),
            "summary": tournament.get("summary"),
            "sourceTaskId": tournament["task_id"],
            "sourceRunId": tournament["sourceRunId"],
            "sourceCommentId": tournament.get("sourceCommentId"),
            "expectedCandidateCount": publication["expectedCandidateCount"],
            "orderedCandidateIdentities": publication["orderedCandidateIdentities"],
            "candidateSetHash": publication["candidateSetHash"],
            "reviewedContentHash": publication["reviewedContentHash"],
            "manifestHash": publication["manifestHash"],
            "publicationComplete": True,
            **_candidate_frozen_fields(candidate),
        }
        if existing_tournament.get("id") == tournament["task_id"]:
            has_run = "sourceRunId" in existing_tournament
            has_hash = "manifestHash" in existing_tournament
            if has_run != has_hash:
                raise ValueError("Existing tournament has incomplete immutable run/hash provenance")
            legacy = not has_run and not has_hash
            if not legacy:
                if existing_tournament["sourceRunId"] != tournament["sourceRunId"]:
                    raise ValueError("Existing tournament source run is immutable")
                if existing_tournament["manifestHash"] != publication["manifestHash"]:
                    raise ValueError("Existing tournament manifest is immutable")
            _validate_existing_frozen_fields(
                existing_tournament, proposed_tournament, require_all=not legacy, legacy=legacy
            )
        challenger = {
            **existing_challenger,
            "discoveryLane": lane,
            "expectedIrr": candidate["expectedIrr"],
            "requiredIrr": candidate["requiredIrr"],
            "hurdlePrice": candidate["hurdlePrice"],
            "currentPrice": candidate["currentPrice"],
            "evidenceGrade": candidate["evidenceGradeLetter"],
            "modelAsOf": candidate["modelAsOf"],
            "nextEventAt": candidate.get("nextEventAt"),
            "reviewStatus": "reviewed",
            "admissionDecision": candidate["disposition"],
            "tournament": {**existing_tournament, **proposed_tournament},
        }
        portfolio_fit = candidate.get("portfolioFit")
        if _finite(portfolio_fit) and 0 <= portfolio_fit <= 1:
            challenger["portfolioFit"] = portfolio_fit
        metadata["challenger"] = challenger
        idea_id = _text(idea.get("id"))
        updated_at = _text(idea.get("updated_at"))
        if not idea_id or not updated_at:
            raise ValueError("Active idea identity or concurrency version is unavailable")
        _timestamp(updated_at, "Active idea update timestamp")
        updates.append({"id": idea_id, "ticker": idea.get("ticker"), "expected_updated_at": updated_at, "metadata": metadata})
    return updates


def _read_env(path: Path) -> Dict[str, str]:
    values = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


def _request_json(url: str, key: str, method: str = "GET", payload: Optional[Dict[str, Any]] = None) -> Any:
    headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Accept": "application/json",
        "User-Agent": "north-star-challenger-sync/1.0",
    }
    body = None
    if payload is not None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    opener = urllib.request.build_opener(_NoRedirect())
    try:
        with opener.open(request, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if 300 <= error.code < 400:
            raise RuntimeError("Supabase request refused HTTP redirect {}".format(error.code)) from error
        detail = error.read().decode("utf-8", "replace")[:1000]
        raise RuntimeError("Supabase request failed with HTTP {}: {}".format(error.code, detail)) from error


def require_canonical_supabase_url(raw_url: str) -> str:
    canonical = "https://{}.supabase.co".format(PROJECT_REF)
    try:
        parsed = urllib.parse.urlsplit(raw_url)
        port = parsed.port
    except (TypeError, ValueError) as error:
        raise ValueError("Canonical Supabase URL must be the exact HTTPS origin") from error
    if raw_url not in {canonical, canonical + "/"} or parsed.scheme != "https" \
            or parsed.hostname != "{}.supabase.co".format(PROJECT_REF) or port is not None \
            or parsed.username is not None or parsed.password is not None \
            or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("Canonical Supabase URL must be the exact HTTPS origin")
    return canonical


def sync_to_supabase(tournament: Dict[str, Any], env: Dict[str, str], apply: bool) -> Dict[str, Any]:
    url = require_canonical_supabase_url(env.get("SUPABASE_URL") or "")
    key = env.get("SUPABASE_SECRET_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not key:
        raise ValueError("Canonical INVESTING-BRAIN-AG Supabase configuration is unavailable")
    ideas_url = url + "/rest/v1/hermes_ideas?select=id,ticker,updated_at,metadata&stage=neq.archive&limit=2000"
    ideas = _request_json(ideas_url, key)
    if not isinstance(ideas, list):
        raise RuntimeError("Supabase active-idea response is invalid")
    updates = build_idea_updates(tournament, ideas)
    current_by_id = {idea.get("id"): idea for idea in ideas if isinstance(idea, dict)}
    changed = [update for update in updates if current_by_id.get(update["id"], {}).get("metadata") != update["metadata"]]

    def staged_metadata(update: Dict[str, Any]) -> Dict[str, Any]:
        metadata = copy.deepcopy(update["metadata"])
        metadata["challenger"]["tournament"]["publicationComplete"] = False
        return metadata

    def patch_metadata(update: Dict[str, Any], expected_version: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        encoded_id = urllib.parse.quote(str(update["id"]), safe="")
        encoded_version = urllib.parse.quote(expected_version, safe="")
        target = url + "/rest/v1/hermes_ideas?id=eq." + encoded_id + "&updated_at=eq." + encoded_version
        rows = _request_json(target, key, method="PATCH", payload={"metadata": metadata})
        if not isinstance(rows, list) or len(rows) == 0:
            raise RuntimeError("Supabase metadata conflict: active idea changed during challenger sync")
        if len(rows) != 1 or not isinstance(rows[0], dict) or rows[0].get("id") != update["id"]:
            raise RuntimeError("Supabase did not return exactly one updated challenger idea")
        if rows[0].get("metadata") != metadata:
            raise RuntimeError("Challenger metadata PATCH representation mismatch: " + update["id"])
        version = _text(rows[0].get("updated_at"))
        if not version:
            raise RuntimeError("Supabase did not return the challenger concurrency version")
        _timestamp(version, "Active idea update timestamp")
        return rows[0]

    def read_candidate(update: Dict[str, Any]) -> Dict[str, Any]:
        encoded_id = urllib.parse.quote(str(update["id"]), safe="")
        verify_url = url + "/rest/v1/hermes_ideas?select=id,ticker,updated_at,metadata&id=eq." + encoded_id + "&limit=2"
        rows = _request_json(verify_url, key)
        if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict) or rows[0].get("id") != update["id"]:
            raise RuntimeError("Challenger metadata exact readback failed: " + update["id"])
        version = _text(rows[0].get("updated_at"))
        if not version:
            raise RuntimeError("Challenger readback concurrency version is unavailable")
        _timestamp(version, "Active idea update timestamp")
        return rows[0]

    if apply:
        # Phase one publishes the immutable manifest with completion false. Rows that
        # already contain either exact staged or exact final data are retry-safe.
        for update in updates:
            current = current_by_id[update["id"]]
            staged = staged_metadata(update)
            if current.get("metadata") not in (staged, update["metadata"]):
                patch_metadata(update, update["expected_updated_at"], staged)

        # Re-read all rows after staging. No completion marker is advanced until the
        # complete candidate set and immutable manifest have exact storage readback.
        verified: Dict[str, Dict[str, Any]] = {}
        for update in updates:
            row = read_candidate(update)
            if row.get("metadata") not in (staged_metadata(update), update["metadata"]):
                raise RuntimeError("Challenger staged publication readback mismatch: " + update["id"])
            verified[update["id"]] = row

        # Completion is sequential but invisible to the UI until every row is true;
        # its model verifies count, ordered identities, and both hashes as one group.
        for update in updates:
            row = verified[update["id"]]
            if row.get("metadata") == update["metadata"]:
                continue
            patch_metadata(update, row["updated_at"], update["metadata"])

        for update in updates:
            row = read_candidate(update)
            if row.get("metadata") != update["metadata"]:
                raise RuntimeError("Challenger completed publication readback mismatch: " + update["id"])
    return {
        "task_id": tournament["task_id"],
        "source_run_id": tournament["sourceRunId"],
        "as_of": tournament["asOf"],
        "candidate_count": len(updates),
        "changed_count": len(changed),
        "applied": apply,
        "tickers": [update["ticker"] for update in updates],
    }


def _write_status(path: Path, status: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(status)
    payload["checked_at"] = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)
    os.chmod(path, 0o600)


@contextmanager
def _exclusive_lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+", encoding="utf-8")
    os.chmod(path, 0o600)
    try:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Challenger Board sync is already running")
        yield
    finally:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()


def lock_path(home: Path) -> Path:
    return home.expanduser().resolve() / "state" / "challenger-board-sync.lock"


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write and verify production metadata; default is dry-run")
    parser.add_argument("--hermes-home", default=os.environ.get("HERMES_HOME", str(Path.home() / ".hermes")))
    parser.add_argument("--env-file", default=None)
    parser.add_argument("--status-file", default=None)
    args = parser.parse_args(argv)
    home = Path(args.hermes_home).expanduser().resolve()
    env_file = Path(args.env_file).expanduser().resolve() if args.env_file else home / ".env"
    status_file = Path(args.status_file).expanduser().resolve() if args.status_file else home / "state" / "challenger-board-sync.json"
    with _exclusive_lock(lock_path(home)):
        rows = load_completed_pm_rows(discover_kanban_databases(home))
        tournament = select_latest_tournament(rows)
        status = sync_to_supabase(tournament, _read_env(env_file), args.apply)
        _write_status(status_file, status)
        if args.apply and status["changed_count"]:
            print("Challenger Board synced {} reviewed candidates from {}".format(status["candidate_count"], status["task_id"]))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # Cron must surface a concise non-zero failure.
        print("Challenger Board sync failed: {}".format(error), file=sys.stderr)
        sys.exit(1)
