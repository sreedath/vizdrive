"""Hand-authored control points for the "City Grand Prix" loop.

Coordinates are (x, z) in meters on the ground plane, counter-clockwise.
The lap is roughly 1.2 km. Features, in driving order starting at the
start/finish line on the long south straight heading +x:

  - long start straight
  - sweeping left onto the east side
  - hairpin at the north-east
  - chicane across the top
  - S-curves down the west side
  - final 90-degree right back onto the straight
"""

# (x, z) control points, closed loop (do not repeat the first point).
CONTROL_POINTS = [
    # --- start straight (heading +x along z = 0) ---
    (-90.0, 0.0),
    (0.0, 0.0),
    (90.0, 0.0),
    # --- sweeping left up the east side ---
    (160.0, 20.0),
    (205.0, 70.0),
    (220.0, 135.0),
    # --- hairpin at north-east ---
    (210.0, 190.0),
    (170.0, 220.0),
    (133.0, 203.0),
    (122.0, 152.0),
    # --- inward kink, then chicane across the top ---
    (85.0, 118.0),
    (30.0, 140.0),
    (-15.0, 195.0),
    (-85.0, 225.0),
    (-145.0, 205.0),
    # --- S-curves down the west side ---
    (-160.0, 150.0),
    (-128.0, 98.0),
    (-150.0, 55.0),
    # --- final 90 right onto the straight ---
    (-145.0, 10.0),
]

# Start/finish is placed at the resampled point nearest this control point,
# on the straight, heading +x.
START_HINT = (-60.0, 0.0)


# --- Additional circuits (harder, curvier). Same coordinate scale. ---

# NOTE on curvature: the Catmull-Rom smoothing means an ess of amplitude A
# and half-wavelength L has a minimum corner radius of roughly L^2/(A*pi^2).
# The validator requires radius > 15.4 m, so keep L^2/A comfortably > 160.

# Serpent: almost no straights; esses up the east side, a wavy top section,
# and more esses down the west side.
SERPENT = [
    (-160.0, 0.0),
    (-60.0, 0.0),
    (40.0, 0.0),
    (120.0, 10.0),
    (180.0, 40.0),
    (155.0, 105.0),
    (185.0, 170.0),
    (176.0, 220.0),
    (136.0, 248.0),
    (88.0, 208.0),
    (15.0, 247.0),
    (-60.0, 208.0),
    (-135.0, 247.0),
    (-195.0, 228.0),
    (-222.0, 172.0),
    (-188.0, 120.0),
    (-218.0, 62.0),
    (-190.0, 15.0),
]

# Switchback: two wide hairpin fingers across the north side plus a fast
# east sweep; three full direction reversals per lap.
SWITCHBACK = [
    (-210.0, 0.0),
    (-100.0, 0.0),
    (10.0, 0.0),
    (120.0, 0.0),
    (205.0, 8.0),
    (243.0, 55.0),
    (247.0, 125.0),
    (228.0, 180.0),
    (180.0, 214.0),
    (135.0, 185.0),
    (114.0, 120.0),
    (105.0, 68.0),
    (68.0, 52.0),
    (32.0, 72.0),
    (24.0, 130.0),
    (15.0, 175.0),
    (-20.0, 212.0),
    (-58.0, 178.0),
    (-68.0, 120.0),
    (-76.0, 70.0),
    (-112.0, 52.0),
    (-148.0, 74.0),
    (-158.0, 130.0),
    (-165.0, 175.0),
    (-190.0, 213.0),
    (-233.0, 188.0),
    (-247.0, 130.0),
    (-240.0, 60.0),
]

# Gauntlet: fast flowing rhythm track, an ess up the east, a chicane
# across the top, and a winding descent on the west.
GAUNTLET = [
    (-180.0, 5.0),
    (-80.0, 0.0),
    (20.0, 5.0),
    (110.0, 0.0),
    (180.0, 20.0),
    (212.0, 78.0),
    (184.0, 142.0),
    (216.0, 205.0),
    (180.0, 242.0),
    (120.0, 215.0),
    (60.0, 242.0),
    (0.0, 210.0),
    (-60.0, 242.0),
    (-125.0, 220.0),
    (-190.0, 200.0),
    (-212.0, 152.0),
    (-186.0, 100.0),
    (-212.0, 48.0),
]

# All selectable circuits. "city" stays the default and is also written to
# shared/track.json for the training/parity pipeline.
TRACKS = {
    "city": {
        "label": "City GP",
        "control_points": CONTROL_POINTS,
        "start_hint": START_HINT,
    },
    "serpent": {
        "label": "Serpent",
        "control_points": SERPENT,
        "start_hint": (-80.0, 0.0),
        "smooth": 1,
    },
    "switchback": {
        "label": "Switchback",
        "control_points": SWITCHBACK,
        "start_hint": (-100.0, 0.0),
        "smooth": 2,
    },
    "gauntlet": {
        "label": "Gauntlet",
        "control_points": GAUNTLET,
        "start_hint": (-80.0, 0.0),
        "smooth": 1,
    },
}
