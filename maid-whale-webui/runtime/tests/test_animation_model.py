import json
import unittest
from pathlib import Path

from runtime.animation_model import ANIMATION_TICK_MS, AnimationModel, crossfade_duration, repaint_scope


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT / "assets" / "pet-manifest.json").read_text(encoding="utf-8"))


class AnimationModelTests(unittest.TestCase):
    def test_working_activity_selects_a_persistent_loop(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("WORKING", "searching")
        self.assertEqual(model.active_clip_name, "working_search")
        for tick in range(12):
            model.advance(150, tick * 150)
        self.assertEqual(model.active_clip_name, "working_search")

    def test_interaction_returns_to_latest_agent_state(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("THINKING")
        model.play_overlay("head_pat")
        model.apply_state("WAITING")
        # Advance past the longest interaction pose (~2s) to see it retire.
        for tick in range(15):
            model.advance(200, tick * 200)
        self.assertEqual(model.active_clip_name, "waiting")
        self.assertEqual(model.base_state, "WAITING")

    def test_pulse_expires_to_current_base_state(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("WORKING", "editing")
        model.apply_pulse("SUCCESS", 1000, 100, "IDLE")
        self.assertEqual(model.active_clip_name, "success")
        model.advance(100, 1200)
        self.assertEqual(model.active_clip_name, "idle")

    def test_idle_micro_does_not_interrupt_agent_work(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("THINKING")
        self.assertFalse(model.play_idle_micro())
        self.assertEqual(model.active_clip_name, "thinking")

    def test_drag_overlay_returns_to_latest_agent_state(self) -> None:
        model = AnimationModel(MANIFEST)
        model.apply_state("THINKING")
        self.assertTrue(model.play_overlay("dragging"))
        model.apply_state("WAITING")
        model.clear_overlay()
        self.assertEqual(model.active_clip_name, "waiting")
        self.assertEqual(model.base_state, "WAITING")

    def test_drag_transitions_never_crossfade(self) -> None:
        self.assertIsNone(crossfade_duration("idle", "dragging"))
        self.assertIsNone(crossfade_duration("dragging", "thinking"))
        self.assertIsNone(crossfade_duration("blink", "idle"))
        self.assertEqual(crossfade_duration("thinking", "working"), 0.10)
        self.assertEqual(crossfade_duration("working_search", "working_search"), 0.045)

    def test_animation_refresh_is_capped_at_about_thirty_frames_per_second(self) -> None:
        self.assertEqual(ANIMATION_TICK_MS, 33)

    def test_refresh_scope_skips_unchanged_static_frames(self) -> None:
        self.assertEqual(
            repaint_scope(
                previous_frame="idle.png",
                current_frame="idle.png",
                motion=None,
                clip_name="idle",
                reduced_motion=False,
                fade_active=False,
                surface_changed=False,
            ),
            "none",
        )
        self.assertEqual(
            repaint_scope(
                previous_frame="idle.png",
                current_frame="idle.png",
                motion="breathe",
                clip_name="idle",
                reduced_motion=True,
                fade_active=False,
                surface_changed=False,
            ),
            "none",
        )

    def test_refresh_scope_limits_animation_to_pet_and_surface_changes_to_full_window(self) -> None:
        common = {
            "previous_frame": "idle.png",
            "current_frame": "idle.png",
            "clip_name": "idle",
            "reduced_motion": False,
            "fade_active": False,
        }
        self.assertEqual(repaint_scope(**common, motion="breathe", surface_changed=False), "pet")
        self.assertEqual(repaint_scope(**common, motion=None, surface_changed=True), "full")


if __name__ == "__main__":
    unittest.main()
