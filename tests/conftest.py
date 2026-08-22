"""Shared pytest fixtures for the GlanceApp 93 test suite."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import explainer
from app.audit import audit_logger
from app.main import app
from app.scoring import scoring_engine
from app.store import store
from simulator import event_generator


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    """Start every test from an empty store with Gen AI disabled.

    The LLM is disabled by default so the suite is fast, offline and
    deterministic; the tests that exercise the Gen AI path patch
    `explainer._call_hf_api` explicitly instead of hitting the network.
    """
    monkeypatch.setattr(explainer, "HF_API_TOKEN", "")
    store.clear()
    audit_logger.clear()
    explainer.clear_cache()
    scoring_engine.reset_weights()
    event_generator.reset_hotspot()
    yield
    store.clear()
    audit_logger.clear()
    explainer.clear_cache()
    scoring_engine.reset_weights()


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
