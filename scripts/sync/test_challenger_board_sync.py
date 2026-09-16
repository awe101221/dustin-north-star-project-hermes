import copy
import json
import os
import sqlite3
import tempfile
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import scripts.sync.challenger_board_sync as sync
from scripts.sync.challenger_board_sync import (
    build_idea_updates,
    discover_kanban_databases,
    load_completed_pm_rows,
    require_canonical_supabase_url,
    select_latest_tournament,
    sync_to_supabase,
)


class ChallengerBoardSyncTests(unittest.TestCase):
    def packet(self, *, task_id="t_pm", ended_at: object = 100, reviewed=True, run_id=1, kanban_db="/boards/default/kanban.db"):
        review_status = "passed_with_caveats" if reviewed else "changes_required"
        metadata = {
            "terminalPmLabel": "no change",
            "decision": "Retain ACN; QQQ remains the practical default for new capital.",
            "packetCommentId": 56,
            "comparators": {
                "frozenAsOf": "2026-09-15T04:39:07.420Z",
                "newAdmissionHurdle": 0.15,
                "qqqPassWatchLine": 0.12,
            },
            "accepted_review_tasks": ["t_review_kspi", "t_review_gpn"],
            "audit_trail": [
                {"candidate": "KSPI", "accepted": "t_review_kspi", "reviewStatus": review_status},
                {"candidate": "GPN", "accepted": "t_review_gpn", "reviewStatus": review_status},
            ],
            "challenger": [
                {
                    "candidate": "KSPI",
                    "ticker": "NAS:KSPI",
                    "expectedIrr": 0.1380627054,
                    "priceOnlyExpectedIrr": 0.0876468856,
                    "requiredIrr": 0.15,
                    "currentPrice": 98.75,
                    "hurdlePrice": 90.76082621,
                    "evidenceGrade": "B",
                    "modelAsOf": "2026-09-15T21:08:47-04:00",
                    "nextEventAt": "2026-11-10T00:00:00-05:00",
                    "reviewStatus": review_status,
                    "disposition": "first alternate",
                    "basis": "Dividend-inclusive bank return model.",
                    "portfolioFit": "Only challenger above ACN and QQQ with dividends; live overlap unverified.",
                },
                {
                    "candidate": "GPN",
                    "ticker": "NYSE:GPN",
                    "expectedIrr": 0.1161686759,
                    "requiredIrr": 0.15,
                    "currentPrice": 88.98,
                    "hurdlePrice": 66.01039038,
                    "evidenceGrade": "B",
                    "modelAsOf": "2026-09-15T00:00:00Z",
                    "nextEventAt": "2026-11-04T00:00:00Z",
                    "reviewStatus": review_status,
                    "disposition": "watch-price trigger",
                    "basis": "Continuing owner-FCF model.",
                    "portfolioFit": "Zero-weight qualitative research watch.",
                },
            ],
        }
        review_records = {}
        for index, (review_id, ticker) in enumerate((("t_review_kspi", "KSPI"), ("t_review_gpn", "GPN")), start=10):
            review_records[review_id] = {
                "task_id": review_id,
                "title": f"Review {ticker} challenger underwriting",
                "assignee": "evidence-risk-reviewer",
                "task_status": "done",
                "run_id": index,
                "run_profile": "evidence-risk-reviewer",
                "run_status": "done",
                "outcome": "completed",
                "verdict": "PASS WITH CAVEATS" if reviewed else "CHANGES REQUIRED",
                "task_candidate_ticker": ticker,
                "run_candidate_ticker": ticker,
            }
        return {
            "task_id": task_id,
            "title": "PM synthesize ACN vs reviewed challengers",
            "assignee": "north-star-pm",
            "task_status": "done",
            "run_id": run_id,
            "run_profile": "north-star-pm",
            "ended_at": ended_at,
            "summary": "Reviewed PM closeout.",
            "metadata": metadata,
            "review_records": review_records,
            "kanban_db": kanban_db,
        }

    def active_ideas(self):
        return [
            {"id": "idea-kspi", "ticker": "NAS:KSPI", "updated_at": "2026-09-10T00:00:00Z", "metadata": {"keep": 1}},
            {"id": "idea-gpn", "ticker": "NYSE:GPN", "updated_at": "2026-09-10T00:00:00Z", "metadata": {}},
        ]

    def test_selects_latest_fully_reviewed_pm_packet(self):
        selected = select_latest_tournament([
            self.packet(task_id="older", ended_at=100),
            self.packet(task_id="newer", ended_at=200),
        ])
        self.assertEqual(selected["task_id"], "newer")
        self.assertEqual(selected["sourceRunId"], 1)
        self.assertEqual(selected["incumbentTicker"], "ACN")
        self.assertEqual(selected["completedAt"], "1970-01-01T00:03:20Z")

    def test_selects_latest_by_real_timestamp_and_deterministic_tiebreaker(self):
        fractional = self.packet(task_id="fractional", ended_at="2026-09-16T01:13:27.100Z", run_id=1, kanban_db="/b/kanban.db")
        whole = self.packet(task_id="whole", ended_at="2026-09-16T01:13:27Z", run_id=99, kanban_db="/z/kanban.db")
        self.assertEqual(select_latest_tournament([fractional, whole])["task_id"], "fractional")
        tied_a = self.packet(task_id="a", ended_at=100, run_id=1, kanban_db="/same/kanban.db")
        tied_b = self.packet(task_id="b", ended_at=100, run_id=2, kanban_db="/same/kanban.db")
        self.assertEqual(select_latest_tournament([tied_a, tied_b])["task_id"], "b")
        self.assertEqual(select_latest_tournament([tied_b, tied_a])["task_id"], "b")

    def test_fails_closed_when_latest_tournament_has_unaccepted_review(self):
        with self.assertRaisesRegex(ValueError, "accepted independent review"):
            select_latest_tournament([
                self.packet(task_id="older", ended_at=100),
                self.packet(task_id="newer", ended_at=200, reviewed=False),
            ])

    def test_accepts_only_exact_structured_run_metadata_verdicts(self):
        for verdict in ("PASS", "PASS WITH CAVEATS"):
            self.assertEqual(sync._stored_verdict("NOT PASS", "CHANGES REQUIRED", {"verdict": verdict}), verdict)
        for verdict in (
            None,
            "pass",
            " PASSED ",
            "NOT PASS",
            "PASS BUT CHANGES REQUIRED",
            "PASS WITH CAVEATS / CHANGES REQUIRED",
            "PASS WITH CAVEATS\nreview notes",
            ["PASS"],
            {"value": "PASS"},
        ):
            metadata = {} if verdict is None else {"verdict": verdict}
            with self.subTest(verdict=verdict):
                self.assertIsNone(sync._stored_verdict("PASS WITH CAVEATS", "PASS", metadata))

    def test_rejects_free_text_review_verdict_fallback_when_structured_verdict_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "kanban.db"
            self._create_board(path, self.packet())
            connection = sqlite3.connect(path)
            connection.execute(
                "update task_runs set metadata = ?, summary = ? where task_id = 't_review_kspi'",
                (json.dumps({"candidateTicker": "KSPI"}), "PASS WITH CAVEATS"),
            )
            connection.execute(
                "update task_runs set metadata = ?, summary = ? where task_id = 't_review_gpn'",
                (json.dumps({"candidateTicker": "GPN"}), "PASS WITH CAVEATS"),
            )
            connection.execute(
                "update tasks set result = 'PASS WITH CAVEATS' where assignee = 'evidence-risk-reviewer'",
            )
            connection.commit()
            connection.close()
            rows = load_completed_pm_rows([path])
            with self.assertRaisesRegex(ValueError, "accepted independent review"):
                select_latest_tournament(rows)

    def test_requires_terminal_north_star_pm_and_real_completed_review_runs(self):
        non_pm = self.packet(); non_pm["assignee"] = "investment-underwriter"
        with self.assertRaisesRegex(ValueError, "North Star PM"):
            select_latest_tournament([non_pm])
        fake_review = self.packet(); fake_review["review_records"].pop("t_review_kspi")
        with self.assertRaisesRegex(ValueError, "resolved completed independent review"):
            select_latest_tournament([fake_review])

    def test_extracts_candidate_identity_from_real_review_task_prose(self):
        self.assertEqual(
            sync._task_candidate(
                "Independent Evidence & Risk review of the parent KSPI Challenger underwriting.",
                "Review KSPI challenger underwriting",
            ),
            "KSPI",
        )
        self.assertEqual(
            sync._task_candidate(
                "Independently re-review the corrected WIX challenger model produced by parent t_4e53fcd2.",
                "Re-review corrected WIX challenger model",
            ),
            "WIX",
        )

    def test_rejects_conflicting_review_candidate_identities_across_all_sources(self):
        cases = (
            (
                json.dumps({"candidateTicker": "KSPI"}),
                "Review GPN challenger underwriting",
            ),
            (
                "Independent review of the parent GPN challenger underwriting.",
                "Review KSPI challenger underwriting",
            ),
            (
                "Review KSPI challenger underwriting, then review the corrected GPN challenger model.",
                None,
            ),
        )
        for body, title in cases:
            with self.subTest(body=body, title=title), self.assertRaisesRegex(ValueError, "candidate identities disagree"):
                sync._task_candidate(body, title)

    def test_rejects_conflicting_valid_security_ticker_even_with_primary_identity(self):
        with self.assertRaisesRegex(ValueError, "Structured review candidate identities disagree"):
            sync._metadata_candidate({"candidateTicker": "KSPI", "security": "GPN"})

        self.assertEqual(
            sync._metadata_candidate({"candidateTicker": "KSPI", "security": "Kaspi.kz JSC"}),
            "KSPI",
        )

    def test_binds_each_review_task_and_run_metadata_to_exact_candidate(self):
        for field in ("task_candidate_ticker", "run_candidate_ticker"):
            packet = self.packet()
            packet["review_records"]["t_review_kspi"][field] = "GPN"
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "candidate identity"):
                select_latest_tournament([packet])

    def test_rejects_malformed_explicit_review_candidate_tickers_without_fallback(self):
        for source in ("task", "run"):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "kanban.db"
                self._create_board(path, self.packet())
                connection = sqlite3.connect(path)
                if source == "task":
                    connection.execute(
                        "update tasks set body = ? where id = 't_review_kspi'",
                        (json.dumps({"candidateTicker": "not a ticker"}),),
                    )
                else:
                    connection.execute(
                        "update task_runs set metadata = ? where task_id = 't_review_kspi'",
                        (json.dumps({"verdict": "PASS WITH CAVEATS", "candidateTicker": "not a ticker"}),),
                    )
                connection.commit()
                connection.close()
                with self.assertRaisesRegex(ValueError, "candidate ticker is invalid"):
                    load_completed_pm_rows([path])
        for metadata in (
            {"candidateTicker": "KSPI", "ticker": "GPN"},
            {"candidateTicker": "KSPI", "ticker": []},
            {"candidateTicker": "KSPI", "challenger": {"ticker": "GPN"}},
        ):
            with self.subTest(metadata=metadata), self.assertRaisesRegex(ValueError, "candidate ticker.*invalid|candidate identities disagree"):
                sync._metadata_candidate(metadata)
        self.assertEqual(
            sync._metadata_candidate({"challenger": {
                "ticker": "NYSE:TME", "security": "Tencent Music Entertainment Group ADS; 2 ordinary shares per ADS",
            }}),
            "TME",
        )

    def test_requires_accepted_audit_and_candidate_sets_to_match_exactly(self):
        extra_audit = self.packet()
        extra_audit["metadata"]["accepted_review_tasks"].append("t_review_extra")
        extra_audit["metadata"]["audit_trail"].append({"candidate": "EXTRA", "accepted": "t_review_extra", "reviewStatus": "pass"})
        extra_audit["review_records"]["t_review_extra"] = {
            **extra_audit["review_records"]["t_review_kspi"], "task_id": "t_review_extra",
            "task_candidate_ticker": "EXTRA", "run_candidate_ticker": "EXTRA",
        }
        missing_candidate = self.packet()
        missing_candidate["metadata"]["challenger"].pop()
        duplicate_audit = self.packet()
        duplicate_audit["metadata"]["audit_trail"][1]["candidate"] = "KSPI"
        for packet in (extra_audit, missing_candidate, duplicate_audit):
            with self.subTest(audit=packet["metadata"]["audit_trail"]), self.assertRaisesRegex(ValueError, "exactly match|duplicate"):
                select_latest_tournament([packet])

    def test_normalizes_exact_reviewed_b_minus_grade_but_rejects_arbitrary_decorations(self):
        for accepted_source_grade in (
            "B-",
            "B- source pack; qualitative no-admission watch use",
            "B; qualitative no-admission/QQQ-default use",
            "B- reviewed negative screen",
        ):
            packet = self.packet()
            packet["metadata"]["challenger"][0]["evidenceGrade"] = accepted_source_grade
            selected = select_latest_tournament([packet])
            self.assertEqual(selected["candidates"][0]["evidenceGradeLetter"], "B")
        packet["metadata"]["challenger"][0]["evidenceGrade"] = "B provisional"
        with self.assertRaisesRegex(ValueError, "evidence grade"):
            select_latest_tournament([packet])

    def test_rejects_timezone_less_timestamps_decorated_grades_contradictory_ranks_and_bool_ids(self):
        cases = []
        timezone_less = self.packet(); timezone_less["metadata"]["challenger"][0]["modelAsOf"] = "2026-09-15T21:08:47"; cases.append((timezone_less, "timezone"))
        timezone_less_space = self.packet(); timezone_less_space["metadata"]["challenger"][0]["modelAsOf"] = "2026-09-15 21:08:47"; cases.append((timezone_less_space, "timezone"))
        space_with_offset = self.packet(); space_with_offset["metadata"]["challenger"][0]["modelAsOf"] = "2026-09-15 21:08:47+00:00"; cases.append((space_with_offset, "timestamp"))
        numeric_model_date = self.packet(); numeric_model_date["metadata"]["challenger"][0]["modelAsOf"] = 1789533207; cases.append((numeric_model_date, "date"))
        numeric_event_date = self.packet(); numeric_event_date["metadata"]["challenger"][0]["nextEventAt"] = 1789533207; cases.append((numeric_event_date, "date"))
        decorated_grade = self.packet(); decorated_grade["metadata"]["challenger"][0]["evidenceGrade"] = "B- source pack"; cases.append((decorated_grade, "grade"))
        a_minus_grade = self.packet(); a_minus_grade["metadata"]["challenger"][0]["evidenceGrade"] = "A-"; cases.append((a_minus_grade, "grade"))
        c_minus_grade = self.packet(); c_minus_grade["metadata"]["challenger"][0]["evidenceGrade"] = "C-"; cases.append((c_minus_grade, "grade"))
        contradictory_rank = self.packet(); contradictory_rank["metadata"]["challenger"][0]["rank"] = 2; cases.append((contradictory_rank, "rank"))
        bool_pm_run = self.packet(); bool_pm_run["run_id"] = True; cases.append((bool_pm_run, "run"))
        bool_review_run = self.packet(); bool_review_run["review_records"]["t_review_kspi"]["run_id"] = True; cases.append((bool_review_run, "review"))
        for packet, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                select_latest_tournament([packet])

    def test_rejects_out_of_range_explicit_timezone_offsets(self):
        for value in (
            "2026-09-15T21:08:47+24:00",
            "2026-09-15T21:08:47-24:00",
            "2026-09-15T21:08:47+01:60",
            "2026-09-15T21:08:47-01:60",
        ):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "invalid"):
                sync._timestamp(value, "Regression timestamp")
        self.assertEqual(
            sync._timestamp("2026-09-15T21:08:47+23:59").isoformat(),
            "2026-09-14T21:09:47+00:00",
        )

    def test_rejects_malformed_or_mismatched_identity_dates_prices_and_admit(self):
        cases = []
        malformed = self.packet(); malformed["metadata"]["challenger"][0]["ticker"] = "NAS:"; cases.append((malformed, "ticker"))
        mismatched = self.packet(); mismatched["metadata"]["challenger"][0]["candidate"] = "GPN"; cases.append((mismatched, "identit"))
        conflicting_candidate_ticker = self.packet(); conflicting_candidate_ticker["metadata"]["challenger"][0]["candidateTicker"] = "GPN"; cases.append((conflicting_candidate_ticker, "identit"))
        malformed_explicit = self.packet(); malformed_explicit["metadata"]["challenger"][0]["candidateTicker"] = []; cases.append((malformed_explicit, "ticker"))
        negative = self.packet(); negative["metadata"]["challenger"][0]["currentPrice"] = -1; cases.append((negative, "positive"))
        invalid_date = self.packet(); invalid_date["metadata"]["challenger"][0]["modelAsOf"] = "2026-02-30T00:00:00Z"; cases.append((invalid_date, "date"))
        admit = self.packet(); admit["metadata"]["challenger"][0]["disposition"] = "admit"; cases.append((admit, "cannot publish an admit"))
        for packet, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                select_latest_tournament([packet])

    def test_requires_an_explicit_next_event_date_or_null(self):
        packet = self.packet()
        packet["metadata"]["challenger"][0].pop("nextEventAt")
        with self.assertRaisesRegex(ValueError, "next-event date"):
            select_latest_tournament([packet])

        packet = self.packet()
        packet["metadata"]["challenger"][0]["nextEventAt"] = None
        selected = select_latest_tournament([packet])
        self.assertIsNone(selected["candidates"][0]["nextEventAt"])

    def test_rejects_invalid_optional_frozen_fields(self):
        cases = {
            "portfolioFit": {"unexpected": "object"},
            "nextEventStatus": 7,
            "nextEventEstimated": "not-a-boolean",
            "nextEvidenceTrigger": [],
            "fiveYearHurdlePrice": -1,
            "hurdlePriceExpectedTerminalValueConvention": 0,
        }
        for field, value in cases.items():
            packet = self.packet()
            packet["metadata"]["challenger"][0][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "optional|portfolio|event"):
                select_latest_tournament([packet])

    def test_requires_nonempty_incumbent_terminal_label_and_summary(self):
        no_incumbent = self.packet(); no_incumbent["title"] = "PM synthesize reviewed challengers"
        no_label = self.packet(); no_label["metadata"]["terminalPmLabel"] = " "
        no_summary = self.packet(); no_summary["metadata"]["decision"] = " "; no_summary["summary"] = " "
        for packet, message in ((no_incumbent, "incumbent"), (no_label, "terminal"), (no_summary, "terminal")):
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                select_latest_tournament([packet])

    def test_builds_exact_ranked_frozen_metadata_without_changing_other_idea_fields(self):
        tournament = select_latest_tournament([self.packet()])
        ideas = self.active_ideas()
        ideas[0]["metadata"] = {"keep": {"value": 1}, "challenger": {"customField": {"preserve": True}, "expectedIrr": 999}}
        updates = build_idea_updates(tournament, ideas)
        self.assertEqual([row["id"] for row in updates], ["idea-kspi", "idea-gpn"])
        kspi = updates[0]["metadata"]
        self.assertEqual(kspi["keep"], {"value": 1})
        self.assertEqual(kspi["challenger"]["customField"], {"preserve": True})
        self.assertEqual(kspi["challenger"]["expectedIrr"], 0.1380627054)
        self.assertEqual(kspi["challenger"]["admissionDecision"], "first alternate")
        frozen = kspi["challenger"]["tournament"]
        self.assertEqual(frozen["rank"], 1)
        self.assertEqual(frozen["reviewVerdict"], "PASS WITH CAVEATS")
        self.assertEqual(frozen["sourceRunId"], 1)
        self.assertEqual(frozen["expectedCandidateCount"], 2)
        self.assertEqual(frozen["orderedCandidateIdentities"], ["KSPI", "GPN"])
        self.assertRegex(frozen["candidateSetHash"], r"^[0-9a-f]{64}$")
        self.assertRegex(frozen["manifestHash"], r"^[0-9a-f]{64}$")
        self.assertIs(frozen["publicationComplete"], True)
        self.assertEqual(updates[0]["expected_updated_at"], "2026-09-10T00:00:00Z")
        self.assertNotIn("portfolioFit", kspi["challenger"])

    def test_publication_hashes_use_the_cross_runtime_canonical_contract(self):
        tournament = {
            "task_id": "t_cross_language",
            "sourceRunId": 47,
            "asOf": "2026-09-15T04:39:07.420Z",
            "completedAt": "2026-09-16T01:13:27Z",
            "incumbentTicker": "ACN",
            "terminalLabel": "no change",
            "summary": "Mañana 市場",
            "sourceCommentId": 56,
            "candidates": [{
                "bareTicker": "XLG", "acceptedReviewRunId": 101,
                "acceptedReviewTaskId": "t_review_xlg", "reviewVerdict": "PASS",
                "rank": 1, "disposition": "watch / price trigger", "expectedIrr": 0.000001,
                "requiredIrr": 0.15, "currentPrice": 100.0, "hurdlePrice": 70.0,
                "evidenceGradeLetter": "B", "modelAsOf": "2026-09-15", "nextEventAt": None,
                "basis": "Café basis", "portfolioFit": None, "priceOnlyExpectedIrr": -0.0,
                "fiveYearExpectedIrr": None, "fiveYearHurdlePrice": None,
                "hurdlePriceExpectedTerminalValueConvention": None, "nextEventStatus": None,
                "nextEventEstimated": None, "nextEvidenceTrigger": None,
            }],
        }
        self.assertEqual(sync._publication_manifest(tournament), {
            "candidateSetHash": "8ff27cee95f777c1f7d12b2f2edea78d5c40151a3ab1850eab88cab3b5630e2a",
            "expectedCandidateCount": 1,
            "orderedCandidateIdentities": ["XLG"],
            "reviewedContentHash": "a166d6eecfab6bec946d25ee703d7ff5daf2b1bbd996fb98d0061a2b47068807",
            "sourceRunId": 47,
            "sourceTaskId": "t_cross_language",
            "manifestHash": "228e8587a9120e7b8543c54adebbe7b2e21124e6f337f32a7069a692064a16a2",
        })
        self.assertEqual(
            sync._json_hash({"\U0001f600": 1, "\ue000": 2}),
            "21d5a6489c4a797c52c02f2fedb72f97669b2dc501a47117885aa67d49c29734",
        )
        self.assertNotEqual(sync._json_hash(1.0), sync._json_hash("~number:3ff0000000000000"))
        self.assertEqual(sync._json_hash(-0.0), sync._json_hash(0.0))

    def test_rejects_missing_or_ambiguous_active_idea_matches(self):
        tournament = select_latest_tournament([self.packet()])
        with self.assertRaisesRegex(ValueError, "exactly one active idea"):
            build_idea_updates(tournament, [self.active_ideas()[0]])
        with self.assertRaisesRegex(ValueError, "exactly one active idea"):
            build_idea_updates(tournament, [self.active_ideas()[0], {**self.active_ideas()[0], "id": "duplicate"}, self.active_ideas()[1]])

    def test_fails_closed_on_malformed_destination_metadata_containers(self):
        tournament = select_latest_tournament([self.packet()])
        for field in ("metadata", "challenger", "tournament"):
            ideas = self.active_ideas()
            if field == "metadata": ideas[0]["metadata"] = []
            elif field == "challenger": ideas[0]["metadata"]["challenger"] = []
            else: ideas[0]["metadata"]["challenger"] = {"tournament": []}
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "object"):
                build_idea_updates(tournament, ideas)

    def test_rejects_reviewed_content_mutation_under_existing_manifest(self):
        tournament = select_latest_tournament([self.packet()])
        ideas = self.active_ideas()
        published = build_idea_updates(tournament, ideas)
        published_by_id = {row["id"]: row for row in published}
        for idea in ideas:
            idea["metadata"] = copy.deepcopy(published_by_id[idea["id"]]["metadata"])
        mutated = copy.deepcopy(tournament)
        mutated["candidates"][0]["expectedIrr"] = 0.999
        with self.assertRaisesRegex(ValueError, "immutable"):
            build_idea_updates(mutated, ideas)

    def test_rejects_mutation_of_an_existing_immutable_tournament_manifest(self):
        tournament = select_latest_tournament([self.packet()])
        ideas = self.active_ideas()
        ideas[0]["metadata"] = {"challenger": {"tournament": {"id": "t_pm", "sourceRunId": 1, "manifestHash": "0" * 64}}}
        with self.assertRaisesRegex(ValueError, "immutable"):
            build_idea_updates(tournament, ideas)

    def test_adopts_matching_legacy_tournament_without_run_or_hash_and_preserves_custom_fields(self):
        tournament = select_latest_tournament([self.packet()])
        ideas = self.active_ideas()
        proposed = build_idea_updates(tournament, ideas)
        for idea, update in zip(ideas, proposed):
            legacy = copy.deepcopy(update["metadata"])
            frozen = legacy["challenger"]["tournament"]
            for field in (
                "sourceRunId", "expectedCandidateCount", "orderedCandidateIdentities",
                "candidateSetHash", "reviewedContentHash", "manifestHash", "publicationComplete",
            ):
                frozen.pop(field)
            frozen["asOf"] = "2026-09-14T23:39:07.420-05:00"
            frozen["completedAt"] = "1969-12-31T19:01:40-05:00"
            if "T" in frozen["modelAsOf"]:
                frozen["modelAsOf"] = sync._timestamp(frozen["modelAsOf"]).astimezone(
                    sync.dt.timezone(sync.dt.timedelta(hours=-5))
                ).isoformat()
            frozen["customLegacyField"] = {"preserve": True}
            legacy["challenger"]["customChallengerField"] = "preserve"
            idea["metadata"] = legacy

        adopted = build_idea_updates(tournament, ideas)
        for update in adopted:
            challenger = update["metadata"]["challenger"]
            self.assertEqual(challenger["customChallengerField"], "preserve")
            self.assertEqual(challenger["tournament"]["customLegacyField"], {"preserve": True})
            self.assertEqual(challenger["tournament"]["sourceRunId"], 1)
            self.assertRegex(challenger["tournament"]["reviewedContentHash"], r"^[0-9a-f]{64}$")

    def test_rejects_every_mutated_legacy_frozen_controlled_field_before_sealing(self):
        tournament = select_latest_tournament([self.packet()])
        proposed = build_idea_updates(tournament, self.active_ideas())
        mutations = {
            "asOf": "2026-09-15T04:39:08.420Z",
            "completedAt": "1970-01-01T00:01:41Z",
            "incumbentTicker": "QQQ",
            "terminalLabel": "changed",
            "summary": "Mutated summary",
            "sourceTaskId": "different-task",
            "sourceCommentId": 999,
            "expectedCandidateCount": 3,
            "orderedCandidateIdentities": ["GPN", "KSPI"],
            "candidateSetHash": "0" * 64,
            "reviewedContentHash": "1" * 64,
            "publicationComplete": False,
            "rank": 2,
            "disposition": "reject",
            "expectedIrr": 0.99,
            "requiredIrr": 0.16,
            "currentPrice": 1.0,
            "hurdlePrice": 2.0,
            "modelAsOf": "2026-09-17T01:08:47Z",
            "nextEventAt": "2026-11-11T05:00:00Z",
            "basis": "Mutated basis",
            "acceptedReviewTaskId": "different-review",
            "acceptedReviewRunId": 999,
            "reviewVerdict": "PASS",
            "evidenceGrade": "A",
            "portfolioFitAssessment": "Mutated fit",
            "priceOnlyExpectedIrr": 0.5,
            "fiveYearExpectedIrr": 0.5,
            "fiveYearHurdlePrice": 3.0,
            "hurdlePriceExpectedTerminalValueConvention": 4.0,
            "nextEventStatus": "Mutated status",
            "nextEventEstimated": True,
            "nextEvidenceTrigger": "Mutated trigger",
        }
        for field, value in mutations.items():
            ideas = self.active_ideas()
            for idea, update in zip(ideas, proposed):
                idea["metadata"] = copy.deepcopy(update["metadata"])
                frozen = idea["metadata"]["challenger"]["tournament"]
                frozen.pop("sourceRunId")
                frozen.pop("manifestHash")
            ideas[0]["metadata"]["challenger"]["tournament"][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "legacy.*immutable|immutable.*legacy"):
                build_idea_updates(tournament, ideas)

    def test_legacy_timestamp_equivalence_requires_the_same_instant_or_date(self):
        tournament = select_latest_tournament([self.packet()])
        ideas = self.active_ideas()
        proposed = build_idea_updates(tournament, ideas)
        for idea, update in zip(ideas, proposed):
            idea["metadata"] = copy.deepcopy(update["metadata"])
            frozen = idea["metadata"]["challenger"]["tournament"]
            frozen.pop("sourceRunId")
            frozen.pop("manifestHash")
        frozen = ideas[0]["metadata"]["challenger"]["tournament"]
        frozen["asOf"] = "2026-09-14T23:39:07.420-05:00"
        frozen["modelAsOf"] = "2026-09-15T20:08:47-05:00"
        build_idea_updates(tournament, ideas)
        frozen["modelAsOf"] = "2026-09-15T20:08:48-05:00"
        with self.assertRaisesRegex(ValueError, "legacy.*immutable|immutable.*legacy"):
            build_idea_updates(tournament, ideas)

        date_packet = self.packet()
        date_packet["metadata"]["challenger"][0]["modelAsOf"] = "2026-09-15"
        date_tournament = select_latest_tournament([date_packet])
        date_ideas = self.active_ideas()
        date_proposed = build_idea_updates(date_tournament, date_ideas)
        for idea, update in zip(date_ideas, date_proposed):
            idea["metadata"] = copy.deepcopy(update["metadata"])
            date_frozen = idea["metadata"]["challenger"]["tournament"]
            date_frozen.pop("sourceRunId")
            date_frozen.pop("manifestHash")
        date_frozen = date_ideas[0]["metadata"]["challenger"]["tournament"]
        date_frozen["modelAsOf"] = " 2026-09-15 "
        build_idea_updates(date_tournament, date_ideas)
        date_frozen["modelAsOf"] = "2026-09-15T00:00:00Z"
        with self.assertRaisesRegex(ValueError, "legacy.*immutable|immutable.*legacy"):
            build_idea_updates(date_tournament, date_ideas)

    def test_legacy_adoption_accepts_jsonb_equivalent_numeric_representations(self):
        packet = self.packet()
        packet["metadata"]["challenger"][0]["currentPrice"] = 100.0
        tournament = select_latest_tournament([packet])
        ideas = self.active_ideas()
        proposed = build_idea_updates(tournament, ideas)
        for idea, update in zip(ideas, proposed):
            idea["metadata"] = copy.deepcopy(update["metadata"])
            frozen = idea["metadata"]["challenger"]["tournament"]
            frozen.pop("sourceRunId")
            frozen.pop("manifestHash")
            frozen["expectedCandidateCount"] = float(frozen["expectedCandidateCount"])
            frozen["sourceCommentId"] = float(frozen["sourceCommentId"])
            frozen["rank"] = float(frozen["rank"])
            frozen["acceptedReviewRunId"] = float(frozen["acceptedReviewRunId"])
        ideas[0]["metadata"]["challenger"]["tournament"]["currentPrice"] = 100
        adopted = build_idea_updates(tournament, ideas)
        self.assertEqual(adopted[0]["metadata"]["challenger"]["tournament"]["currentPrice"], 100.0)

    def test_rejects_numbers_outside_the_cross_runtime_safe_domain(self):
        self.assertFalse(sync._same_frozen_value("currentPrice", 9007199254740992, 9007199254740993))
        packet = self.packet()
        packet["metadata"]["challenger"][0]["currentPrice"] = 9007199254740992
        with self.assertRaisesRegex(ValueError, "safe numeric domain"):
            select_latest_tournament([packet])

    def test_ci_runs_the_sync_regression_suite(self):
        workflow = (Path(__file__).resolve().parents[2] / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        self.assertIn("- run: npm run test:sync", workflow)

    def test_canonical_supabase_url_requires_exact_https_origin(self):
        self.assertEqual(require_canonical_supabase_url("https://cwiaqczpifnxxcucqwvr.supabase.co/"), "https://cwiaqczpifnxxcucqwvr.supabase.co")
        for value in (
            "http://cwiaqczpifnxxcucqwvr.supabase.co",
            "https://cwiaqczpifnxxcucqwvr.supabase.co.evil.example",
            "https://user@cwiaqczpifnxxcucqwvr.supabase.co",
            "https://cwiaqczpifnxxcucqwvr.supabase.co:443",
            "https://cwiaqczpifnxxcucqwvr.supabase.co/rest",
            "https://example.com/cwiaqczpifnxxcucqwvr.supabase.co",
        ):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "exact HTTPS origin"):
                require_canonical_supabase_url(value)

    def test_request_json_never_follows_redirects_with_credentials(self):
        received = []

        class Sink(BaseHTTPRequestHandler):
            def do_GET(self):
                received.append(self.headers.get("Authorization"))
                self.send_response(200); self.end_headers(); self.wfile.write(b"{}")
            def log_message(self, *_args): pass

        sink = ThreadingHTTPServer(("127.0.0.1", 0), Sink)

        class Redirect(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302); self.send_header("Location", f"http://127.0.0.1:{sink.server_port}/sink"); self.end_headers()
            def log_message(self, *_args): pass

        redirect = ThreadingHTTPServer(("127.0.0.1", 0), Redirect)
        threads = [threading.Thread(target=server.serve_forever, daemon=True) for server in (sink, redirect)]
        for thread in threads: thread.start()
        try:
            with self.assertRaisesRegex(RuntimeError, "redirect"):
                sync._request_json(f"http://127.0.0.1:{redirect.server_port}/start", "credential")
            self.assertEqual(received, [])
        finally:
            redirect.shutdown(); sink.shutdown(); redirect.server_close(); sink.server_close()

    def test_lock_path_is_fixed_under_resolved_hermes_home(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory) / "home"; home.mkdir()
            self.assertEqual(sync.lock_path(home / ".." / "home"), home.resolve() / "state" / "challenger-board-sync.lock")

    def test_discovers_explicit_custom_and_current_board_databases(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            explicit = home / "explicit.db"; explicit.touch()
            custom = home / "custom.db"; custom.touch()
            current_db = home / "kanban" / "boards" / "alpha" / "kanban.db"; current_db.parent.mkdir(parents=True); current_db.touch()
            (home / "kanban" / "current").write_text("alpha\n", encoding="utf-8")
            (home / "config.yaml").write_text(f"kanban:\n  db_path: {custom}\n", encoding="utf-8")
            with patch.dict(os.environ, {"HERMES_KANBAN_DB": str(explicit)}, clear=False):
                found = discover_kanban_databases(home)
            self.assertEqual(set(found), {explicit.resolve(), custom.resolve(), current_db.resolve()})

    def _create_board(self, path: Path, packet):
        connection = sqlite3.connect(path)
        connection.executescript("""
            create table tasks (id text primary key, title text, body text, assignee text, status text, result text);
            create table task_runs (
                id integer primary key, task_id text, profile text, ended_at integer, summary text, metadata text,
                status text, outcome text
            );
        """)
        connection.execute("insert into tasks values (?, ?, '', ?, 'done', null)", (packet["task_id"], packet["title"], "north-star-pm"))
        connection.execute(
            "insert into task_runs values (?, ?, 'north-star-pm', ?, ?, ?, 'done', 'completed')",
            (packet["run_id"], packet["task_id"], packet["ended_at"], packet["summary"], json.dumps(packet["metadata"])),
        )
        for review in packet["review_records"].values():
            task_body = json.dumps({"candidateTicker": review["task_candidate_ticker"]})
            run_metadata = {"verdict": review["verdict"], "candidateTicker": review["run_candidate_ticker"]}
            connection.execute("insert into tasks values (?, ?, ?, ?, 'done', ?)", (review["task_id"], review["title"], task_body, review["assignee"], review["verdict"]))
            connection.execute(
                "insert into task_runs values (?, ?, ?, ?, ?, ?, 'done', 'completed')",
                (review["run_id"], review["task_id"], review["run_profile"], packet["ended_at"] - 1, review["verdict"], json.dumps(run_metadata)),
            )
        connection.commit(); connection.close()

    def test_reads_and_resolves_completed_pm_and_review_runs_from_absolute_sqlite_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "kanban.db"
            self._create_board(path, self.packet())
            rows = load_completed_pm_rows([path])
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["task_id"], "t_pm")
            self.assertEqual(set(rows[0]["review_records"]), {"t_review_kspi", "t_review_gpn"})
            self.assertEqual(rows[0]["review_records"]["t_review_kspi"]["task_candidate_ticker"], "KSPI")
            self.assertEqual(rows[0]["review_records"]["t_review_kspi"]["run_candidate_ticker"], "KSPI")
            self.assertEqual(select_latest_tournament(rows)["task_id"], "t_pm")

    def test_review_lookup_uses_latest_completed_run_not_after_pm_closeout(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "kanban.db"
            self._create_board(path, self.packet(ended_at=100))
            connection = sqlite3.connect(path)
            run_metadata = json.dumps({"verdict": "PASS WITH CAVEATS", "candidateTicker": "KSPI"})
            connection.execute(
                "insert into task_runs values (?, ?, ?, ?, ?, ?, 'done', 'completed')",
                (35, "t_review_kspi", "evidence-risk-reviewer", 100, "accepted before closeout", run_metadata),
            )
            connection.execute(
                "insert into task_runs values (?, ?, ?, ?, ?, ?, 'done', 'completed')",
                (37, "t_review_kspi", "evidence-risk-reviewer", 101, "completed after closeout", run_metadata),
            )
            connection.commit()
            connection.close()

            tournament = select_latest_tournament(load_completed_pm_rows([path]))
            self.assertEqual(tournament["candidates"][0]["acceptedReviewRunId"], 35)
            updates = build_idea_updates(tournament, self.active_ideas())
            self.assertEqual(
                updates[0]["metadata"]["challenger"]["tournament"]["acceptedReviewRunId"],
                35,
            )

    def test_review_lookup_fails_closed_on_missing_or_invalid_run_timestamps(self):
        for ended_at in (None, "not-a-timestamp"):
            with self.subTest(ended_at=ended_at), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "kanban.db"
                self._create_board(path, self.packet(ended_at=100))
                connection = sqlite3.connect(path)
                connection.execute(
                    "update task_runs set ended_at = ? where task_id = 't_review_kspi'",
                    (ended_at,),
                )
                connection.commit()
                connection.close()
                with self.assertRaisesRegex(ValueError, "completion time"):
                    load_completed_pm_rows([path])

    def test_sync_hides_partial_publication_until_every_row_is_complete_and_verified(self):
        tournament = select_latest_tournament([self.packet()])
        state = {row["id"]: copy.deepcopy(row) for row in self.active_ideas()}
        calls = []
        completed_counts = []

        def fake_request(url, key, method="GET", payload=None):
            calls.append((method, url, copy.deepcopy(payload)))
            if method == "GET" and "id=eq." not in url:
                return list(copy.deepcopy(state).values())
            if method == "GET":
                idea_id = urllib.parse.unquote(url.split("id=eq.", 1)[1].split("&", 1)[0])
                return [copy.deepcopy(state[idea_id])]
            idea_id = urllib.parse.unquote(url.split("id=eq.", 1)[1].split("&", 1)[0])
            expected_version = urllib.parse.unquote(url.split("updated_at=eq.", 1)[1].split("&", 1)[0])
            row = state[idea_id]
            if row["updated_at"] != expected_version:
                return []
            row["metadata"] = copy.deepcopy(payload["metadata"])
            row["updated_at"] = f"2026-09-10T00:00:{len(calls):02d}Z"
            completed_counts.append(sum(candidate["metadata"].get("challenger", {}).get("tournament", {}).get("publicationComplete") is True for candidate in state.values()))
            return [{"id": idea_id, "updated_at": row["updated_at"], "metadata": copy.deepcopy(row["metadata"])}]

        with patch.object(sync, "_request_json", side_effect=fake_request):
            result = sync_to_supabase(tournament, {"SUPABASE_URL": "https://cwiaqczpifnxxcucqwvr.supabase.co", "SUPABASE_SECRET_KEY": "test"}, True)
        self.assertEqual(result["changed_count"], 2)
        self.assertEqual(completed_counts[-2:], [1, 2])
        for row in state.values():
            self.assertIs(row["metadata"]["challenger"]["tournament"]["publicationComplete"], True)

    def test_sync_retry_is_idempotent_after_partial_completion_and_cas_conflicts_fail_closed(self):
        tournament = select_latest_tournament([self.packet()])
        ideas = self.active_ideas()
        updates = build_idea_updates(tournament, ideas)
        partial = copy.deepcopy(ideas)
        partial[0]["metadata"] = updates[0]["metadata"]
        partial[1]["metadata"] = copy.deepcopy(updates[1]["metadata"])
        partial[1]["metadata"]["challenger"]["tournament"]["publicationComplete"] = False
        calls = []

        def conflict(url, key, method="GET", payload=None):
            calls.append(method)
            if len(calls) == 1: return partial
            if method == "GET":
                idea_id = urllib.parse.unquote(url.split("id=eq.", 1)[1].split("&", 1)[0])
                return [copy.deepcopy(next(row for row in partial if row["id"] == idea_id))]
            return []

        with patch.object(sync, "_request_json", side_effect=conflict):
            with self.assertRaisesRegex(RuntimeError, "conflict"):
                sync_to_supabase(tournament, {"SUPABASE_URL": "https://cwiaqczpifnxxcucqwvr.supabase.co", "SUPABASE_SECRET_KEY": "test"}, True)
        self.assertEqual(calls.count("PATCH"), 1)


if __name__ == "__main__":
    unittest.main()
