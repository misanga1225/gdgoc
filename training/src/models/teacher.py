"""L2CS-Net (ResNet50) — Teacher model.

Reproduces the architecture from:
  Abdelrahman et al., "L2CS-Net: Fine-Grained Gaze Estimation in
  Unconstrained Environments", 2023.

Gaze direction is decomposed into yaw and pitch, each predicted as a
classification over `num_bins` discrete angle bins.  The final continuous
angle is obtained by taking the softmax expectation over the bin centres.
"""

from __future__ import annotations

import math
from pathlib import Path

import torch
import torch.nn as nn
import torchvision.models as tv_models


class L2CSNet(nn.Module):
    """L2CS-Net with a ResNet-50 backbone."""

    def __init__(self, num_bins: int = 90) -> None:
        super().__init__()
        self.num_bins = num_bins

        # --- backbone (ResNet-50, up to avgpool) ---
        base = tv_models.resnet50(weights=None)
        self.backbone = nn.Sequential(
            base.conv1,
            base.bn1,
            base.relu,
            base.maxpool,
            base.layer1,
            base.layer2,
            base.layer3,
            base.layer4,
            base.avgpool,  # -> (B, 2048, 1, 1)
        )

        # --- heads ---
        self.fc_yaw = nn.Linear(2048, num_bins)
        self.fc_pitch = nn.Linear(2048, num_bins)

    # ------------------------------------------------------------------ #
    #  forward
    # ------------------------------------------------------------------ #
    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Return raw logits ``(yaw_logits, pitch_logits)``, each ``(B, num_bins)``."""
        feat = self.backbone(x).flatten(1)  # (B, 2048)
        return self.fc_yaw(feat), self.fc_pitch(feat)

    # ------------------------------------------------------------------ #
    #  utility helpers
    # ------------------------------------------------------------------ #
    def predict_angles(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Return continuous **(yaw, pitch)** in degrees via softmax expectation."""
        yaw_logits, pitch_logits = self.forward(x)
        return _softmax_expectation(yaw_logits, self.num_bins), _softmax_expectation(
            pitch_logits, self.num_bins
        )

    @staticmethod
    def load_official_weights(
        model: "L2CSNet",
        path: str | Path,
        *,
        device: torch.device | str = "cpu",
    ) -> "L2CSNet":
        """Load the official Gaze360-pretrained ``.pkl`` checkpoint.

        The official repo stores the state-dict directly via
        ``torch.save(model.state_dict(), …)``, so we can load as-is after
        remapping the few key differences.
        """
        state = torch.load(path, map_location=device, weights_only=False)

        # The official checkpoint may prefix keys with "module." (DataParallel).
        cleaned: dict[str, torch.Tensor] = {}
        for k, v in state.items():
            cleaned[k.removeprefix("module.")] = v

        # Remap official key names → our Sequential backbone.
        remapped: dict[str, torch.Tensor] = {}
        layer_map = {
            "conv1": "0",
            "bn1": "1",
            "layer1": "4",
            "layer2": "5",
            "layer3": "6",
            "layer4": "7",
        }
        for k, v in cleaned.items():
            new_k = k
            for orig, idx in layer_map.items():
                if k.startswith(orig + "."):
                    new_k = f"backbone.{idx}.{k[len(orig) + 1:]}"
                    break
            # fc_yaw_gaze / fc_pitch_gaze → fc_yaw / fc_pitch
            new_k = new_k.replace("fc_yaw_gaze", "fc_yaw").replace(
                "fc_pitch_gaze", "fc_pitch"
            )
            remapped[new_k] = v

        model.load_state_dict(remapped, strict=False)
        return model


# --------------------------------------------------------------------------- #
#  Private helpers
# --------------------------------------------------------------------------- #

def _softmax_expectation(logits: torch.Tensor, num_bins: int) -> torch.Tensor:
    """Softmax expectation → continuous angle in **degrees**.

    Bin centres span ``[-180, 180)`` with step ``360 / num_bins``.
    """
    step = 360.0 / num_bins
    bin_centres = torch.arange(num_bins, device=logits.device, dtype=logits.dtype)
    bin_centres = bin_centres * step + step / 2 - 180.0  # e.g. [-178, -174, …, 178]
    probs = torch.softmax(logits, dim=1)
    return (probs * bin_centres).sum(dim=1)
