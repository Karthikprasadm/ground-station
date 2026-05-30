# Copyright (c) 2026 Efstratios Goudelis

import base64
from pathlib import Path

import pytest

from common.pathguard import resolve_sigmf_meta_path
from server.snapshots import save_waterfall_snapshot


def _data_url(payload: bytes) -> str:
    encoded = base64.b64encode(payload).decode()
    return f"data:image/png;base64,{encoded}"


def test_save_waterfall_snapshot_rejects_absolute_snapshot_name(tmp_path):
    result = save_waterfall_snapshot(
        _data_url(b"snapshot-test"),
        snapshot_name="/tmp/evil",
        snapshots_root=tmp_path,
    )

    assert result["success"] is False
    assert "Invalid snapshot name" in result["error"]


def test_save_waterfall_snapshot_rejects_traversal_snapshot_name(tmp_path):
    result = save_waterfall_snapshot(
        _data_url(b"snapshot-test"),
        snapshot_name="../../outside",
        snapshots_root=tmp_path,
    )

    assert result["success"] is False
    assert "Invalid snapshot name" in result["error"]


def test_save_waterfall_snapshot_writes_within_snapshots_root(tmp_path):
    result = save_waterfall_snapshot(
        _data_url(b"snapshot-test"),
        snapshot_name="safe_snapshot",
        snapshots_root=tmp_path,
    )

    assert result["success"] is True
    saved_path = Path(result["snapshot_path"]).resolve()
    assert saved_path.exists()
    assert saved_path.suffix == ".png"
    assert saved_path.is_relative_to(tmp_path.resolve())


def test_resolve_sigmf_meta_path_rejects_outside_default_root(tmp_path):
    recordings_root = tmp_path / "recordings"
    recordings_root.mkdir()
    outside_path = tmp_path / "outside" / "secret.sigmf-meta"
    outside_path.parent.mkdir()
    outside_path.write_text("{}")

    with pytest.raises(ValueError, match="outside allowed directories"):
        resolve_sigmf_meta_path(
            str(outside_path),
            recordings_root=recordings_root,
            allowed_roots=[recordings_root],
        )


def test_resolve_sigmf_meta_path_allows_explicit_trusted_root(tmp_path):
    recordings_root = tmp_path / "recordings"
    recordings_root.mkdir()
    trusted_root = tmp_path / "trusted"
    trusted_root.mkdir()
    trusted_meta = trusted_root / "mirror.sigmf-meta"
    trusted_meta.write_text("{}")

    resolved = resolve_sigmf_meta_path(
        str(trusted_meta),
        recordings_root=recordings_root,
        allowed_roots=[recordings_root, trusted_root],
    )

    assert resolved == trusted_meta.resolve()
