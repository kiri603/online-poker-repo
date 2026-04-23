"""HD-process lobby background images.

Upscales the two clean backgrounds (PC 16:9, Mobile 9:16) using
Lanczos resampling and mild enhancement, then writes them to the
frontend public/images folder as high-quality JPEGs.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


# Source images supplied by the user (clean art backgrounds)
SOURCE_PC = Path(
    r"C:\Users\czq\.cursor\projects\c-Users-czq-online-poker-repo\assets"
    r"\c__Users_czq_AppData_Roaming_Cursor_User_workspaceStorage_27226c9110701f9393885f9d8c1fc3b7_images_10187a35-aef8-4aaa-8306-d754e0e65019-19d060fa-9e33-433f-917d-85c7ac3f713c.png"
)
SOURCE_MOBILE = Path(
    r"C:\Users\czq\.cursor\projects\c-Users-czq-online-poker-repo\assets"
    r"\c__Users_czq_AppData_Roaming_Cursor_User_workspaceStorage_27226c9110701f9393885f9d8c1fc3b7_images_33e8f2e1-05d4-4531-83d9-ae0c8af6f8e2-0a2b4c33-3011-404c-a54b-58c65601dbc2.png"
)

# Target sizes and output files within the worktree frontend
WORKTREE_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = WORKTREE_ROOT / "poker-frontend" / "public" / "images"
OUT_DIR.mkdir(parents=True, exist_ok=True)

TARGETS = [
    # (src_path, output_path, target_size)
    (SOURCE_PC, OUT_DIR / "lobby-bg.jpg", (1920, 1080)),
    (SOURCE_MOBILE, OUT_DIR / "lobby-bg-mobile.jpg", (1440, 2560)),
]


def hd_process(src: Path, dst: Path, target: tuple[int, int]) -> None:
    print(f"Processing {src.name} -> {dst.name} @ {target[0]}x{target[1]}")
    with Image.open(src) as im:
        im = im.convert("RGB")
        # Upscale with Lanczos for highest quality
        im = im.resize(target, Image.Resampling.LANCZOS)
        # Mild detail-enhance via unsharp mask to counter any softness
        im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=3))
        # Subtle contrast + saturation boost to keep the art vibrant
        im = ImageEnhance.Contrast(im).enhance(1.04)
        im = ImageEnhance.Color(im).enhance(1.06)
        im.save(dst, "JPEG", quality=92, optimize=True, progressive=True)
        print(f"  written: {dst} ({dst.stat().st_size/1024:.1f} KB)")


def main() -> None:
    for src, dst, target in TARGETS:
        if not src.exists():
            raise FileNotFoundError(f"source missing: {src}")
        hd_process(src, dst, target)


if __name__ == "__main__":
    main()
