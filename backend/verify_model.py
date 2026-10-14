"""
Sanity-check that the backend really uses the trained model correctly.

Run from the backend/ folder:

    python verify_model.py --data ../data --per-class 15
    python verify_model.py path\\to\\image1.jpg path\\to\\image2.jpg

With --data it picks a few random HAM10000 images per class (it finds the metadata CSV and the
.jpg files anywhere under that folder), runs them through exactly the same code path as the API,
and prints per-class accuracy and the tier distribution.

How to read it: roughly 80 % of these images were in the training set, so the accuracy is
optimistic -- this checks the PLUMBING (class order, preprocessing, calibration), not
generalisation. A healthy model scores well above 70 % overall. If you see ~15 % (chance level)
or "nv" images being called something else, the class order or preprocessing is wrong.
"""

import argparse
import csv
import glob
import os
import random
import sys
from collections import Counter, defaultdict

from PIL import Image

from model_utils import LesionModel
from labels import CLASS_CODES


def find_images(data_dir: str, per_class: int, seed: int):
    metas = glob.glob(os.path.join(data_dir, "**", "HAM10000_metadata*"), recursive=True)
    if not metas:
        sys.exit(f"Could not find HAM10000_metadata*.csv under {data_dir}")
    paths = {os.path.splitext(os.path.basename(p))[0]: p
             for p in glob.glob(os.path.join(data_dir, "**", "ISIC_*.jpg"), recursive=True)}
    by_class = defaultdict(list)
    with open(metas[0], newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["image_id"] in paths:
                by_class[row["dx"]].append(paths[row["image_id"]])
    if not by_class:
        sys.exit(f"Found the metadata CSV but no matching ISIC_*.jpg images under {data_dir}")
    rng = random.Random(seed)
    items = []
    for code in CLASS_CODES:
        pool = by_class.get(code, [])
        for p in rng.sample(pool, min(per_class, len(pool))):
            items.append((code, p))
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="*", help="image files to classify")
    ap.add_argument("--data", help="folder containing HAM10000 images + metadata csv")
    ap.add_argument("--per-class", type=int, default=15)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    model = LesionModel()
    if model.mock_mode:
        sys.exit("\nMOCK MODE: no checkpoint was loaded, so this would not test the real model. "
                 "Put skinsight_final_v2.pt in training/checkpoints/ first.")

    if args.images:
        for path in args.images:
            r = model.predict(Image.open(path), include_heatmap=False)
            top3 = sorted(r["all_probabilities"].items(), key=lambda kv: -kv[1])[:3]
            print(f"\n{os.path.basename(path)}")
            print(f"  prediction : {r['predicted_class_code']} ({r['confidence']:.0%})   top-3: {top3}")
            print(f"  melanoma p : {r['melanoma_probability']:.3f}")
            print(f"  tier       : {r['triage_tier']}  [{r['triage_reason']}]")
        return

    if not args.data:
        sys.exit("Give either image paths or --data <folder>.")

    items = find_images(args.data, args.per_class, args.seed)
    print(f"\nTesting {len(items)} images ({args.per_class} per class)...\n")
    hits, total = Counter(), Counter()
    tiers = Counter()
    confusions = Counter()
    for true_code, path in items:
        r = model.predict(Image.open(path), include_heatmap=False)
        total[true_code] += 1
        hits[true_code] += int(r["predicted_class_code"] == true_code)
        tiers[r["triage_tier"]] += 1
        if r["predicted_class_code"] != true_code:
            confusions[(true_code, r["predicted_class_code"])] += 1

    print(f"{'class':8s} {'correct':>9s}")
    for code in CLASS_CODES:
        if total[code]:
            print(f"{code:8s} {hits[code]:>4d}/{total[code]:<4d} {hits[code] / total[code]:>6.0%}")
    overall = sum(hits.values()) / max(sum(total.values()), 1)
    print(f"\noverall accuracy on this sample: {overall:.0%}")
    print("tier distribution:", dict(tiers))
    if confusions:
        print("most common mix-ups (true -> predicted):", confusions.most_common(4))

    if overall < 0.5 or (total["nv"] and hits["nv"] / total["nv"] < 0.5):
        print("\nWARNING: far below what this model achieved in the notebook. Check the class order in "
              "labels.py, that the checkpoint is the v2 bundle, and that the preprocessing was not edited.")
    else:
        print("\nLooks healthy: the backend reproduces the trained model's behaviour.")


if __name__ == "__main__":
    main()