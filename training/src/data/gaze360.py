"""Gaze360 dataset loader.

Expected directory layout (after download & extraction)::

    {data_root}/gaze360/
        imgs/               # raw images
        metadata.mat        # MATLAB metadata with gaze labels
        train.txt           # official split (image paths)
        val.txt
        test.txt

Gaze labels are stored as 3-D unit vectors in the MATLAB file and
converted to (yaw, pitch) in **degrees** on the fly.
"""

from __future__ import annotations

import math
from pathlib import Path

import cv2
import numpy as np
import scipy.io as sio
import torch
from torch.utils.data import Dataset
from torchvision import transforms


def _vector_to_yaw_pitch(vec: np.ndarray) -> tuple[float, float]:
    """Convert a 3-D gaze direction vector to (yaw, pitch) in degrees.

    Convention (same as L2CS-Net):
        yaw  = atan2(-x, -z)   horizontal
        pitch = asin(-y)         vertical
    """
    x, y, z = vec[0], vec[1], vec[2]
    yaw = math.atan2(-x, -z)
    pitch = math.asin(np.clip(-y, -1.0, 1.0))
    return math.degrees(yaw), math.degrees(pitch)


def _angle_to_bin(angle_deg: float, num_bins: int) -> int:
    """Map a continuous angle in [-180, 180) to a discrete bin index."""
    step = 360.0 / num_bins
    idx = int((angle_deg + 180.0) / step)
    return max(0, min(num_bins - 1, idx))


class Gaze360Dataset(Dataset):
    """PyTorch Dataset for Gaze360."""

    def __init__(
        self,
        data_root: str | Path,
        split: str = "train",
        image_size: int = 224,
        num_bins: int = 90,
    ) -> None:
        super().__init__()
        self.root = Path(data_root) / "gaze360"
        self.num_bins = num_bins

        # --- load metadata ---
        meta = sio.loadmat(str(self.root / "metadata.mat"))
        split_file = self.root / f"{split}.txt"
        with open(split_file) as f:
            self.image_paths = [line.strip() for line in f if line.strip()]

        # Build index mapping: path → row in metadata
        all_paths = [p.decode() if isinstance(p, bytes) else str(p)
                     for p in meta["recording_path"].flatten()]
        path_to_idx = {p: i for i, p in enumerate(all_paths)}

        self.gaze_vectors = meta["gaze_dir"]  # (N, 3)
        self.indices = []
        self.valid_paths: list[str] = []
        for p in self.image_paths:
            if p in path_to_idx:
                self.indices.append(path_to_idx[p])
                self.valid_paths.append(p)

        # --- transforms ---
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
        return len(self.valid_paths)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        img_path = self.root / "imgs" / self.valid_paths[idx]
        img = cv2.imread(str(img_path))
        if img is None:
            raise FileNotFoundError(f"Image not found: {img_path}")
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        gaze_vec = self.gaze_vectors[self.indices[idx]]
        yaw_deg, pitch_deg = _vector_to_yaw_pitch(gaze_vec)

        yaw_bin = _angle_to_bin(yaw_deg, self.num_bins)
        pitch_bin = _angle_to_bin(pitch_deg, self.num_bins)

        img_tensor = self.transform(img)

        return {
            "image": img_tensor,
            "yaw_bin": torch.tensor(yaw_bin, dtype=torch.long),
            "pitch_bin": torch.tensor(pitch_bin, dtype=torch.long),
            "yaw_deg": torch.tensor(yaw_deg, dtype=torch.float32),
            "pitch_deg": torch.tensor(pitch_deg, dtype=torch.float32),
        }
