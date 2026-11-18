"""Checks for the bridge's pure parts. Runs anywhere: python3 -m unittest test_bridge"""
import unittest

from bridge import HOLD, OneButton, to_axis


class AxisTest(unittest.TestCase):
    def test_centre_and_dead_zone_read_zero(self):
        self.assertEqual(to_axis(515, 515, False), 0.0)
        self.assertEqual(to_axis(540, 515, False), 0.0)

    def test_full_travel_reaches_one_both_ways(self):
        self.assertEqual(to_axis(1023, 515, False), 1.0)
        self.assertEqual(to_axis(0, 515, False), -1.0)
        self.assertEqual(to_axis(0, 515, True), 1.0)

    def test_halfway_is_about_half(self):
        self.assertAlmostEqual(to_axis(769, 515, False), 0.46, places=2)


class ButtonTest(unittest.TestCase):
    def test_tap_accepts(self):
        b = OneButton()
        self.assertEqual(b.update(True, 0.0), [])
        self.assertEqual(b.update(False, 0.2), [('accept', True), ('accept', False)])

    def test_hold_declines_then_holds_cancel_until_release(self):
        b = OneButton()
        b.update(True, 0.0)
        self.assertEqual(b.update(True, HOLD - 0.01), [])
        self.assertEqual(b.update(True, HOLD), [('decline', True), ('decline', False), ('cancel', True)])
        self.assertEqual(b.update(True, HOLD + 1), [])
        self.assertEqual(b.update(False, HOLD + 2), [('cancel', False)])
        self.assertEqual(b.update(True, 10.0), [], 'next press starts fresh')
        self.assertEqual(b.update(False, 10.1), [('accept', True), ('accept', False)])


if __name__ == '__main__':
    unittest.main()
