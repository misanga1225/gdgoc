"""Knowledge-distillation loss for L2CS-Net bin-classification heads.

The loss combines:
  1. **KD loss** — KL divergence between temperature-softened teacher and
     student distributions (for both yaw and pitch heads).
  2. **Hard label loss** — standard cross-entropy against the ground-truth
     bin index.

Final loss = α · T² · KD_loss  +  (1 − α) · CE_loss
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class DistillationLoss(nn.Module):
    """Combined KD + CE loss for yaw/pitch bin classification."""

    def __init__(self, alpha: float = 0.7, temperature: float = 4.0) -> None:
        super().__init__()
        self.alpha = alpha
        self.temperature = temperature

    def forward(
        self,
        student_yaw: torch.Tensor,   # (B, num_bins)
        student_pitch: torch.Tensor,  # (B, num_bins)
        teacher_yaw: torch.Tensor,    # (B, num_bins)
        teacher_pitch: torch.Tensor,  # (B, num_bins)
        yaw_label: torch.Tensor,      # (B,) long
        pitch_label: torch.Tensor,    # (B,) long
    ) -> dict[str, torch.Tensor]:
        T = self.temperature

        # --- KD loss (KL divergence on temperature-softened logits) ---
        kd_yaw = F.kl_div(
            F.log_softmax(student_yaw / T, dim=1),
            F.softmax(teacher_yaw / T, dim=1),
            reduction="batchmean",
        )
        kd_pitch = F.kl_div(
            F.log_softmax(student_pitch / T, dim=1),
            F.softmax(teacher_pitch / T, dim=1),
            reduction="batchmean",
        )
        kd_loss = (kd_yaw + kd_pitch) * (T * T)

        # --- Hard label CE loss ---
        ce_yaw = F.cross_entropy(student_yaw, yaw_label)
        ce_pitch = F.cross_entropy(student_pitch, pitch_label)
        ce_loss = ce_yaw + ce_pitch

        # --- Combined ---
        total = self.alpha * kd_loss + (1.0 - self.alpha) * ce_loss

        return {
            "loss": total,
            "kd_loss": kd_loss.detach(),
            "ce_loss": ce_loss.detach(),
        }
