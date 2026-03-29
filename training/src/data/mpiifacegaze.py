"""MPIIFaceGaze dataset loader.

Expected directory layout::

    {data_root}/mpiifacegaze/
        pXX/                      # p00 .. p14
            day01/
                0001.jpg
                ...
            pXX.txt                # per-person label file

Each ``.txt`` row:  image_path  yaw(rad)  pitch(rad)  ...
We convert to degrees and discretise into bins for compatibility with
the L2CS-Net output format.

Default split: p00-p12 → train, p13-p14 → val.
"""

from __future__ import annotations

import math
from pathlib import Path

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset
from torchvision import transforms

# Default person-based splits
TRAIN_PERSON_IDS = list(range(0, 13))   # p00 .. p12  (13 persons)
VAL_PERSON_IDS = list(range(13, 15))    # p13 .. p14  (2 persons)


def _angle_to_bin(angle_deg: float, num_bins: int) -> int:
    step = 360.0 / num_bins
    idx = int((angle_deg + 180.0) / step)
    return max(0, min(num_bins - 1, idx))


class MPIIFaceGazeDataset(Dataset):
    """MPIIFaceGaze dataset for training and evaluation.

    Parameters
    ----------
    data_root : path
        Parent directory containing ``mpiifacegaze/``.
    split : str
        ``"train"`` (p00-p12) or ``"val"`` (p13-p14).
        Use ``"all"`` for all 15 persons.
    person_ids : list[int] | None
        Override person IDs (ignores ``split`` if given).
    image_size : int
        Target spatial resolution.
    num_bins : int
        Number of angle bins (must match the model).
    """

    def __init__(
        self,
        data_root: str | Path,
        split: str = "train",
        person_ids: list[int] | None = None,
        image_size: int = 224,
        num_bins: int = 90,
        soft_targets_path: str | Path | None = None,
    ) -> None:
        super().__init__()
        self.root = Path(data_root) / "mpiifacegaze"
        self.num_bins = num_bins

        if person_ids is None:
            if split == "train":
                person_ids = TRAIN_PERSON_IDS
            elif split == "val":
                person_ids = VAL_PERSON_IDS
            else:
                person_ids = list(range(15))

        self.samples: list[tuple[Path, float, float]] = []

        for pid in person_ids:
            person_dir = self.root / f"p{pid:02d}"
            label_file = person_dir / f"p{pid:02d}.txt"
            if not label_file.exists():
                continue
            with open(label_file) as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) < 3:
                        continue
                    img_rel = parts[0]
                    yaw_rad, pitch_rad = float(parts[1]), float(parts[2])
                    yaw_deg = math.degrees(yaw_rad)
                    pitch_deg = math.degrees(pitch_rad)
                    img_path = person_dir / img_rel
                    if img_path.exists():
                        self.samples.append((img_path, yaw_deg, pitch_deg))

        # Load pre-computed teacher soft targets if available
        self.soft_targets: dict[str, torch.Tensor] | None = None
        if soft_targets_path is not None:
            st_path = Path(soft_targets_path)
            if st_path.exists():
                self.soft_targets = torch.load(st_path, weights_only=True)
                assert self.soft_targets["yaw"].shape[0] == len(self.samples), (
                    f"Cache size mismatch: {self.soft_targets['yaw'].shape[0]} "
                    f"vs {len(self.samples)} samples"
                )
                print(f"Loaded soft targets from {st_path}")

        if split == "train":
            self.transform = transforms.Compose([
                transforms.ToPILImage(),
                transforms.Resize((image_size, image_size)),
                transforms.RandomHorizontalFlip(p=0.5),
                transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ])
        else:
            self.transform = transforms.Compose([
                transforms.ToPILImage(),
                transforms.Resize((image_size, image_size)),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ])

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        img_path, yaw_deg, pitch_deg = self.samples[idx]

        img = cv2.imread(str(img_path))
        if img is None:
            raise FileNotFoundError(f"Image not found: {img_path}")
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        img_tensor = self.transform(img)

        result = {
            "image": img_tensor,
            "yaw_bin": torch.tensor(_angle_to_bin(yaw_deg, self.num_bins), dtype=torch.long),
            "pitch_bin": torch.tensor(_angle_to_bin(pitch_deg, self.num_bins), dtype=torch.long),
            "yaw_deg": torch.tensor(yaw_deg, dtype=torch.float32),
            "pitch_deg": torch.tensor(pitch_deg, dtype=torch.float32),
        }

        if self.soft_targets is not None:
            result["t_yaw"] = self.soft_targets["yaw"][idx]
            result["t_pitch"] = self.soft_targets["pitch"][idx]

        return result
