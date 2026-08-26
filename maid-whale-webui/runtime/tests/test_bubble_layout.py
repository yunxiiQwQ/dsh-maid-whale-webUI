import unittest

from runtime import helper


class BubbleLayoutTests(unittest.TestCase):
    def test_compact_bubble_metrics_keep_text_readable_and_pet_close(self) -> None:
        self.assertTrue(hasattr(helper, "bubble_metrics"))

        single = helper.bubble_metrics(0.78, 1)
        multi = helper.bubble_metrics(0.78, 2)

        self.assertEqual(single["cardWidth"], 275)
        self.assertEqual(single["cardHeight"], 56)
        self.assertAlmostEqual(single["titlePoints"], 10.14)
        self.assertAlmostEqual(single["detailPoints"], 8.97)
        self.assertEqual(multi["cardHeight"], 69)
        self.assertEqual(helper.BUBBLE_WINDOW_EXTRA - helper.PET_BOTTOM_MARGIN - helper.BUBBLE_CARD_TOP, -20)


if __name__ == "__main__":
    unittest.main()
