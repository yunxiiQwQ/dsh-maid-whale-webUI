import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from runtime.layout_store import (
    DeferredLayoutSaver,
    DEFAULT_LAYOUT,
    default_layout_path,
    load_layout,
    normalise_layout,
    save_layout,
)


class FakeTimer:
    def __init__(self, delay, callback):
        self.delay = delay
        self.callback = callback
        self.cancelled = False
        self.daemon = False

    def start(self):
        return None

    def cancel(self):
        self.cancelled = True


class LayoutStoreTests(unittest.TestCase):
    def test_deferred_saver_coalesces_and_flushes_latest_value(self) -> None:
        timers = []
        writes = []
        factory = lambda delay, callback: timers.append(FakeTimer(delay, callback)) or timers[-1]
        saver = DeferredLayoutSaver(
            Path("layout.json"),
            save=lambda _path, value: writes.append(value),
            timer_factory=factory,
        )
        saver.schedule({"scale": 0.7})
        saver.schedule({"scale": 1.0})
        self.assertTrue(timers[0].cancelled)
        self.assertEqual(writes, [])
        timers[0].callback()
        self.assertEqual(writes, [])
        saver.flush()
        self.assertEqual(writes[-1]["scale"], 1.0)
        self.assertTrue(timers[1].cancelled)

    def test_deferred_saver_timer_and_flush_write_once(self) -> None:
        timers = []
        writes = []
        factory = lambda delay, callback: timers.append(FakeTimer(delay, callback)) or timers[-1]
        saver = DeferredLayoutSaver(
            Path("layout.json"),
            save=lambda _path, value: writes.append(value),
            timer_factory=factory,
        )
        saver.schedule({"scale": 0.9})
        timers[0].callback()
        saver.flush()
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0]["scale"], 0.9)

    def test_pet_and_bubble_defaults_match_requested_size(self) -> None:
        self.assertEqual(DEFAULT_LAYOUT["scale"], 0.6552)
        self.assertEqual(DEFAULT_LAYOUT["bubbleScale"], 0.78)

    def test_default_layout_path_uses_each_supported_location_in_priority_order(self) -> None:
        with patch.dict(os.environ, {"DSH_DAFEIYU_LAYOUT_PATH": "D:/custom/layout.json"}, clear=True):
            self.assertEqual(default_layout_path(), Path("D:/custom/layout.json"))
        with patch.dict(os.environ, {"DSH_HOME": "D:/dsh"}, clear=True):
            self.assertEqual(default_layout_path(), Path("D:/dsh/dsh-dafeiyu/layout.json"))
        with patch.dict(os.environ, {"LOCALAPPDATA": "D:/local"}, clear=True):
            self.assertEqual(default_layout_path(), Path("D:/local/DSH/dsh-dafeiyu/layout.json"))
        with patch.dict(os.environ, {}, clear=True), patch(
            "runtime.layout_store.Path.home", return_value=Path("D:/home")
        ):
            self.assertEqual(default_layout_path(), Path("D:/home/.dsh/dsh-dafeiyu/layout.json"))

    def test_non_mapping_layout_uses_defaults(self) -> None:
        self.assertEqual(normalise_layout(None), DEFAULT_LAYOUT)

    def test_compact_scales_are_preserved_and_lower_values_are_clamped(self) -> None:
        self.assertEqual(normalise_layout({"scale": 0.42, "bubbleScale": 0.6})["scale"], 0.42)
        self.assertEqual(normalise_layout({"scale": 0.42, "bubbleScale": 0.6})["bubbleScale"], 0.6)
        self.assertEqual(normalise_layout({"scale": 0.1, "bubbleScale": 0.1})["scale"], 0.4)
        self.assertEqual(normalise_layout({"scale": 0.1, "bubbleScale": 0.1})["bubbleScale"], 0.6)

    def test_corrupt_layout_falls_back_safely(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "layout.json"
            path.write_text("not json", encoding="utf-8")
            self.assertEqual(load_layout(path), DEFAULT_LAYOUT)

    def test_layout_is_clamped_and_saved_atomically(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nested" / "layout.json"
            save_layout(path, {"x": 120, "y": -20, "scale": 5, "reducedMotion": True})
            self.assertEqual(load_layout(path), {
                "version": 1,
                "x": 120,
                "y": -20,
                "petX": None,
                "petY": None,
                "scale": 1.4,
                "bubbleScale": 0.78,
                "reducedMotion": True,
                "bubbleMode": "always",
                "bubbleStates": ["SUCCESS", "ERROR", "WAITING"],
            })
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["scale"], 1.4)
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

    def test_boolean_is_not_accepted_as_a_coordinate_or_scale(self) -> None:
        self.assertEqual(normalise_layout({"x": True, "petX": False, "scale": False, "bubbleScale": False}), DEFAULT_LAYOUT)

    def test_bubble_mode_and_states_are_normalised(self) -> None:
        self.assertEqual(normalise_layout({"bubbleMode": "hidden"})["bubbleMode"], "hidden")
        self.assertEqual(normalise_layout({"bubbleMode": "invalid"})["bubbleMode"], "always")
        self.assertEqual(normalise_layout({"bubbleStates": ["SUCCESS", "ERROR"]})["bubbleStates"], ["SUCCESS", "ERROR"])
        self.assertEqual(normalise_layout({"bubbleStates": "bad"})["bubbleStates"], ["SUCCESS", "ERROR", "WAITING"])

    def test_bubble_scale_is_clamped(self) -> None:
        self.assertEqual(normalise_layout({"bubbleScale": 9})["bubbleScale"], 1.2)
        self.assertEqual(normalise_layout({"bubbleScale": 0.1})["bubbleScale"], 0.6)
        self.assertEqual(normalise_layout({})["bubbleScale"], 0.78)


if __name__ == "__main__":
    unittest.main()
