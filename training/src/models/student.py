"""L2CS-Net-Lite (MobileNetV3-Small) — Student model.

Same output interface as the teacher (90-bin yaw/pitch classification)
but with a ~10x smaller backbone for efficient browser inference via
ONNX Runtime Web.
"""

from __future__ import annotations

import timm
import torch
import torch.nn as nn


class L2CSNetLite(nn.Module):
    """Lightweight gaze estimator using MobileNetV3-Small backbone."""

    def __init__(self, num_bins: int = 90) -> None:
        super().__init__()
        self.num_bins = num_bins

        # --- backbone via timm (pretrained on ImageNet) ---
        self.backbone = timm.create_model(
            "mobilenetv3_small_100",
            pretrained=True,
            num_classes=0,       # remove classifier head
            global_pool="avg",   # (B, 576)
        )
        feat_dim = self.backbone.num_features  # 576 for mobilenetv3_small_100

        # --- heads (same interface as teacher) ---
        self.fc_yaw = nn.Linear(feat_dim, num_bins)
        self.fc_pitch = nn.Linear(feat_dim, num_bins)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Return raw logits ``(yaw_logits, pitch_logits)``, each ``(B, num_bins)``."""
        feat = self.backbone(x)  # (B, feat_dim)
        return self.fc_yaw(feat), self.fc_pitch(feat)

    def predict_angles(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Return continuous **(yaw, pitch)** in degrees via softmax expectation."""
        yaw_logits, pitch_logits = self.forward(x)
        return _softmax_expectation(yaw_logits, self.num_bins), _softmax_expectation(
            pitch_logits, self.num_bins
        )


def _softmax_expectation(logits: torch.Tensor, num_bins: int) -> torch.Tensor:
    step = 360.0 / num_bins
    bin_centres = torch.arange(num_bins, device=logits.device, dtype=logits.dtype)
    bin_centres = bin_centres * step + step / 2 - 180.0
    probs = torch.softmax(logits, dim=1)
    return (probs * bin_centres).sum(dim=1)
