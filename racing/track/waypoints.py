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
