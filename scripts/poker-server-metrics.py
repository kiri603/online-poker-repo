"""Read Linux resource counters during a poker load test; no service changes."""

import json
import os
from pathlib import Path
import time


def cpu_counters():
    values = [int(value) for value in Path("/proc/stat").read_text().splitlines()[0].split()[1:9]]
    return sum(values), values[3] + values[4]


def memory_counters():
    return {
        line.split(":")[0]: int(line.split()[1]) / 1024
        for line in Path("/proc/meminfo").read_text().splitlines()
        if line.startswith(("MemTotal:", "MemAvailable:", "SwapTotal:", "SwapFree:"))
    }


def java_counters():
    rss, threads = 0, 0
    for process in Path("/proc").iterdir():
        if not process.name.isdigit():
            continue
        try:
            if (process / "comm").read_text().strip() != "java":
                continue
            for line in (process / "status").read_text().splitlines():
                if line.startswith("VmRSS:"):
                    rss += int(line.split()[1]) / 1024
                elif line.startswith("Threads:"):
                    threads += int(line.split()[1])
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            continue
    return round(rss, 1), threads


def main():
    started = time.time()
    duration = int(os.environ.get("POKER_LOAD_METRICS_SECONDS", "900"))
    if duration < 5 or duration > 3600:
        raise ValueError("POKER_LOAD_METRICS_SECONDS must be between 5 and 3600")
    output = Path(os.environ.get("POKER_LOAD_METRICS_FILE",
        "/tmp/poker-load-metrics-" + str(int(started)) + ".jsonl"))
    samples = []
    print("LT_FILE " + str(output), flush=True)
    print("LT_PID " + str(os.getpid()), flush=True)
    total_before, idle_before = cpu_counters()
    with output.open("x", encoding="utf-8") as stream:
        for _ in range((duration + 4) // 5):
            time.sleep(5)
            total, idle = cpu_counters()
            cpu = 100 * (1 - (idle - idle_before) / max(1, total - total_before))
            total_before, idle_before = total, idle
            memory = memory_counters()
            rss, threads = java_counters()
            sample = {
                "time": int(time.time()), "cpu": round(cpu, 1),
                "availableMiB": round(memory["MemAvailable"], 1),
                "javaRssMiB": rss, "javaThreads": threads,
                "swapUsedMiB": round(memory["SwapTotal"] - memory["SwapFree"], 1),
                "load1": os.getloadavg()[0],
            }
            samples.append(sample)
            stream.write(json.dumps(sample) + "\n")
            stream.flush()
            print("LT " + json.dumps(sample, separators=(",", ":")), flush=True)
            if len(samples) % 12 == 0:
                print("LT_SUM " + json.dumps({
                    "samples": len(samples),
                    "cpuMean": round(sum(s["cpu"] for s in samples) / len(samples), 1),
                    "cpuMax": max(s["cpu"] for s in samples),
                    "availableMinMiB": min(s["availableMiB"] for s in samples),
                    "javaRssMaxMiB": max(s["javaRssMiB"] for s in samples),
                }, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
