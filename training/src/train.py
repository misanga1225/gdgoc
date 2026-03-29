"""Training loop for L2CS-Net knowledge distillation with W&B logging."""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import torch
import torch.nn as nn
from omegaconf import OmegaConf
from torch.utils.data import DataLoader
from tqdm import tqdm

import wandb

from .data import Gaze360Dataset, MPIIFaceGazeDataset
from .distill import DistillationLoss
from .models import L2CSNet, L2CSNetLite


# --------------------------------------------------------------------------- #
#  Metrics
# --------------------------------------------------------------------------- #

def angular_error_deg(
    pred_yaw: torch.Tensor, pred_pitch: torch.Tensor,
    gt_yaw: torch.Tensor, gt_pitch: torch.Tensor,
) -> torch.Tensor:
    """Mean angular error in degrees between predicted and GT gaze vectors."""
    # Convert degrees → radians
    py = pred_yaw * math.pi / 180.0
    pp = pred_pitch * math.pi / 180.0
    gy = gt_yaw * math.pi / 180.0
    gp = gt_pitch * math.pi / 180.0

    # Spherical → Cartesian
    pred_x = -torch.cos(pp) * torch.sin(py)
    pred_y = -torch.sin(pp)
    pred_z = -torch.cos(pp) * torch.cos(py)

    gt_x = -torch.cos(gp) * torch.sin(gy)
    gt_y = -torch.sin(gp)
    gt_z = -torch.cos(gp) * torch.cos(gy)

    dot = (pred_x * gt_x + pred_y * gt_y + pred_z * gt_z).clamp(-1.0, 1.0)
    return torch.acos(dot) * 180.0 / math.pi


def softmax_expectation(logits: torch.Tensor, num_bins: int) -> torch.Tensor:
    step = 360.0 / num_bins
    centres = torch.arange(num_bins, device=logits.device, dtype=logits.dtype)
    centres = centres * step + step / 2 - 180.0
    return (torch.softmax(logits, dim=1) * centres).sum(dim=1)


# --------------------------------------------------------------------------- #
#  Training
# --------------------------------------------------------------------------- #

def train_one_epoch(
    teacher: nn.Module,
    student: nn.Module,
    loader: DataLoader,
    criterion: DistillationLoss,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    num_bins: int,
) -> dict[str, float]:
    student.train()
    teacher.eval()

    total_loss = 0.0
    total_kd = 0.0
    total_ce = 0.0
    total_err = 0.0
    n = 0

    for batch in tqdm(loader, desc="train", leave=False):
        images = batch["image"].to(device)
        yaw_bin = batch["yaw_bin"].to(device)
        pitch_bin = batch["pitch_bin"].to(device)
        yaw_deg = batch["yaw_deg"].to(device)
        pitch_deg = batch["pitch_deg"].to(device)

        # Teacher forward (no grad)
        with torch.no_grad():
            t_yaw, t_pitch = teacher(images)

        # Student forward
        s_yaw, s_pitch = student(images)

        losses = criterion(s_yaw, s_pitch, t_yaw, t_pitch, yaw_bin, pitch_bin)
        loss = losses["loss"]

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        # Metrics
        bs = images.size(0)
        total_loss += loss.item() * bs
        total_kd += losses["kd_loss"].item() * bs
        total_ce += losses["ce_loss"].item() * bs

        pred_yaw = softmax_expectation(s_yaw.detach(), num_bins)
        pred_pitch = softmax_expectation(s_pitch.detach(), num_bins)
        err = angular_error_deg(pred_yaw, pred_pitch, yaw_deg, pitch_deg)
        total_err += err.sum().item()
        n += bs

    return {
        "train/loss": total_loss / n,
        "train/kd_loss": total_kd / n,
        "train/ce_loss": total_ce / n,
        "train/angular_error": total_err / n,
    }


@torch.no_grad()
def evaluate(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
    num_bins: int,
) -> dict[str, float]:
    model.eval()
    total_err = 0.0
    n = 0

    for batch in tqdm(loader, desc="eval", leave=False):
        images = batch["image"].to(device)
        yaw_deg = batch["yaw_deg"].to(device)
        pitch_deg = batch["pitch_deg"].to(device)

        s_yaw, s_pitch = model(images)
        pred_yaw = softmax_expectation(s_yaw, num_bins)
        pred_pitch = softmax_expectation(s_pitch, num_bins)

        err = angular_error_deg(pred_yaw, pred_pitch, yaw_deg, pitch_deg)
        total_err += err.sum().item()
        n += images.size(0)

    return {"val/angular_error": total_err / n}


# --------------------------------------------------------------------------- #
#  Main
# --------------------------------------------------------------------------- #

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=str, default="configs/distill.yaml")
    args = parser.parse_args()

    cfg = OmegaConf.load(args.config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # --- seed ---
    torch.manual_seed(cfg.training.seed)
    if device.type == "cuda":
        torch.cuda.manual_seed_all(cfg.training.seed)

    # --- W&B ---
    wandb.init(
        project=cfg.wandb.project,
        entity=cfg.wandb.entity,
        config=OmegaConf.to_container(cfg, resolve=True),
    )

    # --- models ---
    num_bins = cfg.teacher.num_bins

    teacher = L2CSNet(num_bins=num_bins).to(device)
    weights_path = Path(cfg.data.data_root) / cfg.teacher.weights
    if weights_path.exists():
        L2CSNet.load_official_weights(teacher, weights_path, device=device)
        print(f"Loaded teacher weights from {weights_path}")
    else:
        print(f"WARNING: Teacher weights not found at {weights_path}, using random init")
    teacher.eval()
    for p in teacher.parameters():
        p.requires_grad = False

    student = L2CSNetLite(num_bins=num_bins).to(device)
    wandb.watch(student, log="gradients", log_freq=100)

    # --- data ---
    train_ds = Gaze360Dataset(
        cfg.data.data_root, split="train",
        image_size=cfg.data.image_size, num_bins=num_bins,
    )
    val_ds = Gaze360Dataset(
        cfg.data.data_root, split="val",
        image_size=cfg.data.image_size, num_bins=num_bins,
    )
    train_loader = DataLoader(
        train_ds, batch_size=cfg.training.batch_size,
        shuffle=True, num_workers=cfg.data.num_workers, pin_memory=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=cfg.training.batch_size,
        shuffle=False, num_workers=cfg.data.num_workers, pin_memory=True,
    )
    print(f"Train: {len(train_ds)} samples, Val: {len(val_ds)} samples")

    # --- optimizer & scheduler ---
    optimizer = torch.optim.AdamW(
        student.parameters(), lr=cfg.training.lr, weight_decay=cfg.training.weight_decay,
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=cfg.training.epochs, eta_min=1e-6,
    )
    criterion = DistillationLoss(
        alpha=cfg.distillation.alpha, temperature=cfg.distillation.temperature,
    )

    # --- training loop ---
    ckpt_dir = Path("checkpoints")
    ckpt_dir.mkdir(exist_ok=True)
    best_err = float("inf")
    patience_counter = 0

    for epoch in range(1, cfg.training.epochs + 1):
        print(f"\n--- Epoch {epoch}/{cfg.training.epochs} ---")

        train_metrics = train_one_epoch(
            teacher, student, train_loader, criterion, optimizer, device, num_bins,
        )
        val_metrics = evaluate(student, val_loader, device, num_bins)

        lr = optimizer.param_groups[0]["lr"]
        scheduler.step()

        # Log to W&B
        log_dict = {**train_metrics, **val_metrics, "lr": lr, "epoch": epoch}
        wandb.log(log_dict)

        val_err = val_metrics["val/angular_error"]
        print(f"  train_loss={train_metrics['train/loss']:.4f}  "
              f"train_err={train_metrics['train/angular_error']:.2f}°  "
              f"val_err={val_err:.2f}°  lr={lr:.2e}")

        # Checkpoint (best model)
        if val_err < best_err:
            best_err = val_err
            patience_counter = 0
            torch.save(student.state_dict(), ckpt_dir / "best_student.pth")
            wandb.save(str(ckpt_dir / "best_student.pth"))
            print(f"  ✓ New best: {val_err:.2f}°")
        else:
            patience_counter += 1
            if patience_counter >= cfg.training.early_stopping_patience:
                print(f"  Early stopping at epoch {epoch} (patience={cfg.training.early_stopping_patience})")
                break

    # Save final model
    torch.save(student.state_dict(), ckpt_dir / "final_student.pth")
    wandb.save(str(ckpt_dir / "final_student.pth"))
    print(f"\nTraining complete. Best val error: {best_err:.2f}°")
    wandb.finish()


if __name__ == "__main__":
    main()
