"""Pre-compute and cache teacher soft targets for knowledge distillation.

Running this once before training eliminates the need for teacher forward
passes during every epoch, significantly reducing training time.

Usage::

    python -m src.cache_teacher --config configs/distill.yaml

Output: ``{data_root}/soft_targets_train.pt`` and ``soft_targets_val.pt``
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from omegaconf import OmegaConf
from torch.utils.data import DataLoader
from tqdm import tqdm
from torchvision import transforms

from .data import MPIIFaceGazeDataset
from .models import L2CSNet


def _build_canonical_dataset(
    data_root: str | Path, split: str, image_size: int, num_bins: int,
) -> MPIIFaceGazeDataset:
    """Build dataset with deterministic (no augmentation) transform."""
    ds = MPIIFaceGazeDataset(
        data_root, split=split, image_size=image_size, num_bins=num_bins,
    )
    # Override transform to canonical (no flip / color jitter)
    ds.transform = transforms.Compose([
        transforms.ToPILImage(),
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    return ds


@torch.no_grad()
def generate_cache(
    cfg_path: str,
    output_dir: str | None = None,
) -> None:
    cfg = OmegaConf.load(cfg_path)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    num_bins = cfg.teacher.num_bins
    data_root = Path(cfg.data.data_root)

    # --- Load teacher ---
    teacher = L2CSNet(num_bins=num_bins).to(device)
    weights_path = data_root / cfg.teacher.weights
    if weights_path.exists():
        L2CSNet.load_official_weights(teacher, weights_path, device=device)
        print(f"Loaded teacher weights from {weights_path}")
    else:
        raise FileNotFoundError(f"Teacher weights not found: {weights_path}")
    teacher.eval()

    out_dir = Path(output_dir) if output_dir else data_root
    out_dir.mkdir(parents=True, exist_ok=True)

    for split in ("train", "val"):
        ds = _build_canonical_dataset(
            data_root, split, cfg.data.image_size, num_bins,
        )
        loader = DataLoader(
            ds, batch_size=cfg.training.batch_size,
            shuffle=False, num_workers=cfg.data.num_workers, pin_memory=True,
        )

        all_yaw: list[torch.Tensor] = []
        all_pitch: list[torch.Tensor] = []

        for batch in tqdm(loader, desc=f"cache ({split})"):
            images = batch["image"].to(device)
            t_yaw, t_pitch = teacher(images)
            all_yaw.append(t_yaw.cpu())
            all_pitch.append(t_pitch.cpu())

        cache = {
            "yaw": torch.cat(all_yaw, dim=0),    # (N, num_bins)
            "pitch": torch.cat(all_pitch, dim=0),  # (N, num_bins)
        }

        out_path = out_dir / f"soft_targets_{split}.pt"
        torch.save(cache, out_path)
        print(f"Saved {split} cache: {out_path}  ({cache['yaw'].shape[0]} samples)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Cache teacher soft targets")
    parser.add_argument("--config", type=str, default="configs/distill.yaml")
    parser.add_argument("--output-dir", type=str, default=None,
                        help="Output directory (default: data_root)")
    args = parser.parse_args()
    generate_cache(args.config, args.output_dir)


if __name__ == "__main__":
    main()
