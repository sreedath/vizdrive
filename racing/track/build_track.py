"""Build the full track from waypoints and write shared/track.json.

Pipeline: control points -> closed Catmull-Rom -> uniform resample (~2 m)
-> wall offset polylines -> arc-length table -> checkpoints -> start grid.

Run: python3 -m racing.track.build_track
"""

import json
import math

from racing import constants as C
from racing.track import geometry as geo
from racing.track.spline import resample_uniform, sample_closed_spline
from racing.track.waypoints import CONTROL_POINTS, START_HINT, TRACKS

MIN_RADIUS_FACTOR = 2.2  # min corner radius > factor * half_width


def chaikin(points, iterations):
    """Closed-polygon corner cutting; each pass rounds every corner by
    replacing it with two points at 1/4 and 3/4 of the adjacent edges."""
    for _ in range(iterations):
        out = []
        n = len(points)
        for i in range(n):
            a = points[i]
            b = points[(i + 1) % n]
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        points = out
    return points


def build_track(control_points=None, start_hint=None, smooth=0) -> dict:
    if control_points is None:
        control_points = CONTROL_POINTS
    if start_hint is None:
        start_hint = START_HINT
    if smooth:
        control_points = chaikin(control_points, smooth)
    dense = sample_closed_spline(control_points, samples_per_segment=60)
    center, total_len = resample_uniform(dense, C.CENTERLINE_SPACING)
    n = len(center)

    # Ensure counter-clockwise orientation so left normals point inward-consistently.
    if geo.polygon_area(center) < 0:
        center = list(reversed(center))

    tans = geo.tangents(center)
    norms = geo.normals(tans)
    left = geo.offset_polyline(center, norms, C.TRACK_HALF_WIDTH)
    right = geo.offset_polyline(center, norms, -C.TRACK_HALF_WIDTH)

    # Arc-length table s[i] = distance along centerline to point i.
    s_table = [0.0] * n
    for i in range(1, n):
        a, b = center[i - 1], center[i]
        s_table[i] = s_table[i - 1] + math.hypot(b[0] - a[0], b[1] - a[1])
    lap_length = s_table[-1] + math.hypot(
        center[0][0] - center[-1][0], center[0][1] - center[-1][1]
    )

    # Start index: resampled point nearest the start hint.
    start_i = min(
        range(n),
        key=lambda i: (center[i][0] - start_hint[0]) ** 2
        + (center[i][1] - start_hint[1]) ** 2,
    )
    start_heading = math.atan2(tans[start_i][1], tans[start_i][0])

    # Rotate arrays so index 0 is the start/finish line.
    def rot(arr):
        return arr[start_i:] + arr[:start_i]

    center, tans, norms, left, right = map(rot, (center, tans, norms, left, right))
    s0 = s_table[start_i]
    s_table = [(s - s0) % lap_length for s in rot(s_table)]
    s_table[0] = 0.0

    # Checkpoint gates: evenly spaced in s; each gate is (left point, right point).
    checkpoints = []
    for k in range(C.NUM_CHECKPOINTS):
        target = k * lap_length / C.NUM_CHECKPOINTS
        idx = min(range(len(s_table)), key=lambda i: abs(s_table[i] - target))
        checkpoints.append({"index": idx, "left": left[idx], "right": right[idx]})

    # Two-slot start grid slightly behind the line, offset laterally.
    nrm = norms[0]
    tan = tans[0]
    back = 4.0
    lat = 2.2
    grid = [
        {
            "x": center[0][0] - tan[0] * back + nrm[0] * lat,
            "z": center[0][1] - tan[1] * back + nrm[1] * lat,
            "heading": start_heading,
        },
        {
            "x": center[0][0] - tan[0] * back - nrm[0] * lat,
            "z": center[0][1] - tan[1] * back - nrm[1] * lat,
            "heading": start_heading,
        },
    ]

    return {
        "lap_length": lap_length,
        "half_width": C.TRACK_HALF_WIDTH,
        "centerline": [[p[0], p[1]] for p in center],
        "tangents": [[t[0], t[1]] for t in tans],
        "s_table": s_table,
        "left_wall": [[p[0], p[1]] for p in left],
        "right_wall": [[p[0], p[1]] for p in right],
        "checkpoints": [
            {"index": c["index"], "left": list(c["left"]), "right": list(c["right"])}
            for c in checkpoints
        ],
        "start": {"x": center[0][0], "z": center[0][1], "heading": start_heading},
        "grid": grid,
    }


def validate_track(track: dict) -> None:
    center = [tuple(p) for p in track["centerline"]]
    radii = geo.curvature_radii(center)
    min_r = min(radii)
    min_allowed = MIN_RADIUS_FACTOR * track["half_width"]
    assert min_r > min_allowed, (
        f"min corner radius {min_r:.1f} m <= {min_allowed:.1f} m"
    )
    for name in ("left_wall", "right_wall"):
        wall = [tuple(p) for p in track[name]]
        assert not geo.polyline_self_intersects(wall), f"{name} self-intersects"


def main() -> None:
    C.SHARED_DIR.mkdir(parents=True, exist_ok=True)
    tracks_dir = C.SHARED_DIR / "tracks"
    tracks_dir.mkdir(exist_ok=True)
    manifest = {"default": "city", "tracks": []}
    for key, spec in TRACKS.items():
        track = build_track(
            spec["control_points"], spec["start_hint"], spec.get("smooth", 0)
        )
        validate_track(track)
        track["label"] = spec["label"]
        out = tracks_dir / f"{key}.json"
        with open(out, "w") as f:
            json.dump(track, f)
            f.write("\n")
        if key == "city":
            # Training / parity pipeline keeps reading shared/track.json.
            with open(C.SHARED_DIR / "track.json", "w") as f:
                json.dump(track, f)
                f.write("\n")
        # Downsampled centerline so the lobby can draw a shape thumbnail
        # without fetching the full track file.
        center = track["centerline"]
        stride = max(1, len(center) // 80)
        preview = [
            [round(p[0], 1), round(p[1], 1)] for p in center[::stride]
        ]
        manifest["tracks"].append(
            {
                "key": key,
                "label": spec["label"],
                "file": f"{key}.json",
                "lap_length": round(track["lap_length"]),
                "preview": preview,
            }
        )
        print(
            f"wrote {out}: lap={track['lap_length']:.0f} m, "
            f"{len(track['centerline'])} centerline pts"
        )
    with open(tracks_dir / "index.json", "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"wrote {tracks_dir / 'index.json'} ({len(TRACKS)} tracks)")


if __name__ == "__main__":
    main()
