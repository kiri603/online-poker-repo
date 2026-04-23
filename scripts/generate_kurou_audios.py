"""生成「苦肉」与「苦肉·觉醒」的 TTS 语音。

用法：
  python scripts/generate_kurou_audios.py

会把 mp3 直接生成到 poker-frontend/public/audios/ 下：
  - action_kurou.mp3
  - action_kurou_awaken.mp3

参考 C:\\Users\\czq\\Desktop\\python\\generate_Yunxia.py 的配音风格。
"""

import asyncio
import os
import sys

import edge_tts

VOICE = "zh-CN-YunxiaNeural"
RATE = "+25%"
VOLUME = "+20%"

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, ".."))
OUT_DIR = os.path.join(REPO_ROOT, "poker-frontend", "public", "audios")

TEXTS = {
    "action_kurou": "苦肉！",
    "action_kurou_awaken": "苦肉觉醒！！",
}


async def generate_all():
    os.makedirs(OUT_DIR, exist_ok=True)
    for filename, text in TEXTS.items():
        output_path = os.path.join(OUT_DIR, f"{filename}.mp3")
        print(f"生成: {text} -> {output_path}")
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, volume=VOLUME)
        await communicate.save(output_path)


if __name__ == "__main__":
    try:
        asyncio.run(generate_all())
        print("苦肉系音效生成完毕！")
    except Exception as exc:
        print(f"生成失败: {exc}", file=sys.stderr)
        sys.exit(1)
