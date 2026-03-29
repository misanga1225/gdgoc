"""Export the trained student model to ONNX with optional float16 quantization.

Usage::

    python -m src.export_onnx --checkpoint checkpoints/best_student.pth \\
                              --output outputs/l2cs_lite.onnx \\
                              --quantize fp16
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from onnx import numpy_helper

from .models import L2CSNetLite


def export(checkpoint: Path, output: Path, num_bins: int = 90) -> None:
    model = L2CSNetLite(num_bins=num_bins)
    model.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True))
    model.eval()

    dummy = torch.randn(1, 3, 224, 224)
    output.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model,
        dummy,
        str(output),
        opset_version=17,
        input_names=["image"],
        output_names=["yaw_logits", "pitch_logits"],
        dynamic_axes={"image": {0: "batch"}, "yaw_logits": {0: "batch"}, "pitch_logits": {0: "batch"}},
    )
    print(f"Exported ONNX model to {output}")


def quantize_fp16(input_path: Path, output_path: Path) -> None:
    """Convert float32 weights to float16 (keeps model structure identical)."""
    model = onnx.load(str(input_path))

    for tensor in model.graph.initializer:
        if tensor.data_type == onnx.TensorProto.FLOAT:
            arr = numpy_helper.to_array(tensor).astype(np.float16)
            new_tensor = numpy_helper.from_array(arr, tensor.name)
            tensor.CopyFrom(new_tensor)

    onnx.save(model, str(output_path))
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Quantized (fp16) model saved to {output_path} ({size_mb:.1f} MB)")


def verify(onnx_path: Path) -> None:
    """Quick sanity check: run a dummy input through ONNX Runtime."""
    sess = ort.InferenceSession(str(onnx_path))
    dummy = np.random.randn(1, 3, 224, 224).astype(np.float32)
    yaw, pitch = sess.run(None, {"image": dummy})
    print(f"Verification OK — yaw shape: {yaw.shape}, pitch shape: {pitch.shape}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export student to ONNX")
    parser.add_argument("--checkpoint", type=str, default="checkpoints/best_student.pth")
    parser.add_argument("--output", type=str, default="outputs/l2cs_lite.onnx")
    parser.add_argument("--num-bins", type=int, default=90)
    parser.add_argument("--quantize", choices=["none", "fp16"], default="fp16")
    args = parser.parse_args()

    ckpt = Path(args.checkpoint)
    out = Path(args.output)

    # Step 1: Export to ONNX (float32)
    export(ckpt, out, num_bins=args.num_bins)

    # Step 2: Optional fp16 quantization
    if args.quantize == "fp16":
        fp16_path = out.with_stem(out.stem + "_fp16")
        quantize_fp16(out, fp16_path)
        verify(fp16_path)
    else:
        verify(out)


if __name__ == "__main__":
    main()
