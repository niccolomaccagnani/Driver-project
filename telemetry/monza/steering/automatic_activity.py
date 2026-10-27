"""Automatic visible-motion indicator, deliberately NOT a steering-angle estimator.

The signed/integrated angle failed consistency checks on these recordings. This
module exports only the supported, unsigned local motion before integration.
Geometry is specific to these 2622x1206 onboard recordings.
"""
import argparse
import csv
import json
import pathlib
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

W, H, ASPECT = 450, 184, .65
YY, XX = np.indices((H, W))
BODY = np.uint8((YY < 65) | ((XX < 85) & (YY < 160)) | ((XX > 400) & (YY < 145))) * 255


def helmet_mask(image):
    h, s, v = cv2.split(cv2.cvtColor(image, cv2.COLOR_BGR2HSV))
    mask = np.uint8((h > 35) & (h < 140) & (s > 85) & (v > 95) & (YY > 88) & (XX > 15) & (XX < 375)) * 255
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [c for c in contours if cv2.contourArea(c) > 12]
    result = np.zeros((H, W), np.uint8)
    if contours:
        cv2.fillConvexPoly(result, cv2.convexHull(np.concatenate(contours)), 255)
        result = cv2.dilate(result, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 25)))
    return result


def visual_step(previous, current, center):
    """Return local angular-motion increment (proxy), support, updated center."""
    a = cv2.cvtColor(previous, cv2.COLOR_BGR2GRAY)
    b = cv2.cvtColor(current, cv2.COLOR_BGR2GRAY)
    matrix = np.array([[1., 0., 0.], [0., 1., 0.]])
    points = cv2.goodFeaturesToTrack(a, 100, .025, 6, mask=BODY)
    if points is not None and len(points) > 6:
        nxt, status, error = cv2.calcOpticalFlowPyrLK(a, b, points, None, winSize=(21, 21), maxLevel=3)
        good = (status.ravel() > 0) & (error.ravel() < 30)
        if good.sum() > 6:
            fitted, inliers = cv2.estimateAffinePartial2D(points[good], nxt[good], method=cv2.RANSAC, ransacReprojThreshold=1.5)
            if fitted is not None and inliers.sum() > 5 and .97 < np.hypot(fitted[0, 0], fitted[1, 0]) < 1.03:
                matrix = fitted
    center = matrix[:, :2] @ center + matrix[:, 2]
    flow = cv2.calcOpticalFlowFarneback(a, b, None, .5, 3, 21, 3, 7, 1.5, 0)
    vx = flow[:, :, 0] - ((matrix[0, 0] - 1) * XX + matrix[0, 1] * YY + matrix[0, 2])
    vy = (flow[:, :, 1] - (matrix[1, 0] * XX + (matrix[1, 1] - 1) * YY + matrix[1, 2])) / ASPECT
    dx, dy = XX - center[0], (YY - center[1]) / ASPECT
    radius = np.hypot(dx, dy)
    gradient = cv2.magnitude(cv2.Sobel(a, cv2.CV_32F, 1, 0), cv2.Sobel(a, cv2.CV_32F, 0, 1))
    helmet = helmet_mask(previous) | helmet_mask(current)
    mask = (radius > 25) & (radius < 118) & (YY > 84) & (YY < 175) & (XX > 110) & (XX < 325) & (helmet == 0) & (gradient > 25)
    magnitude = np.hypot(vx, vy)
    omega = (dx * vy - dy * vx) / (radius ** 2 + 1e-6)
    radial = np.abs(dx * vx + dy * vy) / (radius * magnitude + 1e-6)
    valid = mask & (magnitude > .18) & (magnitude < 35) & (radial < .65) & (np.abs(omega) < .35)
    if valid.sum() <= 35:
        return None, 0., center
    values = omega[valid]
    weights = (np.sqrt(gradient) * np.minimum(magnitude, 8))[valid]
    bins = np.linspace(-.35, .35, 141)
    histogram, _ = np.histogram(values, bins, weights=weights)
    j = np.argmax(histogram)
    keep = np.abs(values - (bins[j] + bins[j + 1]) / 2) < .015
    support = float(min(1., valid.sum() / 500) * weights[keep].sum() / weights.sum())
    increment = float(np.degrees(np.average(values[keep], weights=weights[keep])))
    return increment, support, center


def extract(video, lap):
    cap = cv2.VideoCapture(str(video))
    previous, previous_time = None, None
    center = np.array([228., 132.], np.float32)
    rows, index = [], -1
    while True:
        ok, frame = cap.read()
        index += 1
        if not ok:
            break
        time = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
        if time < lap['sourceStart'] + .8:
            continue
        if time > lap['sourceStart'] + lap['duration']:
            break
        image = cv2.resize(frame[900:1206, 850:1600], (W, H))
        if previous is not None:
            increment, support, center = visual_step(previous, image, center)
            dt = time - previous_time
            rate = abs(increment) / dt if increment is not None and support > .25 and 0 < dt < .2 else None
            rows.append(dict(frame_index=index, video_time_s=round(time, 6), lap_elapsed_s_est=round(time-lap['sourceStart'], 6), visual_angular_rate_proxy=rate, support_score=support))
        previous, previous_time = image, time
    cap.release()
    return rows


def normalise(series):
    baseline = [r['visual_angular_rate_proxy'] for rows in series for r in rows if r['lap_elapsed_s_est'] < 2.5 and r['visual_angular_rate_proxy'] is not None]
    noise = float(np.percentile(baseline, 75))
    smoothed = []
    for rows in series:
        times = np.array([r['video_time_s'] for r in rows])
        rates = np.array([r['visual_angular_rate_proxy'] if r['visual_angular_rate_proxy'] is not None else np.nan for r in rows])
        values = []
        for i, row in enumerate(rows):
            nearby = rates[np.abs(times-times[i]) <= .15]
            nearby = nearby[np.isfinite(nearby)]
            values.append(float(np.sqrt(np.mean(nearby ** 2))) if row['visual_angular_rate_proxy'] is not None and len(nearby) > 2 else None)
        smoothed.append(values)
    scale = float(np.percentile([v for vv in smoothed for v in vv if v is not None], 95))
    for rows, values in zip(series, smoothed):
        for row, value in zip(rows, values):
            row['wheel_region_motion_index'] = round(float(np.clip((value-noise)/(scale-noise)*100, 0, 100)), 2) if value is not None else None
            row['status'] = 'visual_motion_index' if value is not None else 'insufficient_visual_support'
    return dict(noise_reference=noise, shared_p95_scale=scale, smoothing_window_s=.3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('videos', nargs=2, type=pathlib.Path)
    parser.add_argument('--data', type=pathlib.Path, default=pathlib.Path(__file__).parents[1] / 'viewer/telemetry-data.json')
    parser.add_argument('--out', required=True, type=pathlib.Path)
    args = parser.parse_args()
    cv2.setNumThreads(2)
    metadata = json.loads(args.data.read_text())
    with ThreadPoolExecutor(max_workers=2) as pool:
        series = list(pool.map(lambda pair: extract(*pair), zip(args.videos, metadata['laps'])))
    normalisation = normalise(series)
    args.out.mkdir(parents=True, exist_ok=True)
    for n, rows in enumerate(series, 1):
        with open(args.out/f'automatic-activity-giro{n}.csv', 'w') as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator='\n')
            writer.writeheader(); writer.writerows(rows)
    (args.out/'normalisation.json').write_text(json.dumps(normalisation, indent=2))

if __name__ == '__main__':
    main()
